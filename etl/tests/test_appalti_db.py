"""La vista e la scheda degli appalti (richiede TEST_DATABASE_URL).

Esercizio fittizio 2099, transazione sempre annullata. I test valgono anche su un database vuoto.
"""
import os

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")
ANNO = 2099
POLIGONO = "MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)))"


@pytest.fixture
def db():
    with psycopg.connect(URL) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


class Cantiere:
    def __init__(self, conn):
        self.c = conn
        self.n = 0
        self.cig = 0

    def comune(self, popolazione=2000, pagamenti=1_000_000):
        """Comune con il bilancio dell'anno fittizio (serve al tetto di attendibilita')."""
        self.n += 1
        istat = f"T{self.n:05d}"
        mid = self.c.execute(
            "insert into municipalities (istat_code, name, region, province, population, geom) "
            "values (%s, %s, 'Prova', 'Prova', %s, ST_GeomFromText(%s, 4326)) returning id",
            (istat, f"Comune {istat}", popolazione, POLIGONO),
        ).fetchone()[0]
        if pagamenti is not None:
            self.c.execute(
                "insert into budget_records (municipality_id, year, population, expenditure_total) values (%s, %s, %s, %s)",
                (mid, ANNO, popolazione, pagamenti),
            )
        return istat

    def lotto(self, istat, importo, famiglia="diretto", tipo="SERVIZI", piattaforma=None, anno=ANNO, oggetto=None):
        self.cig += 1
        self.c.execute(
            "insert into appalti_comuni (cig, istat, anno, oggetto, importo, tipo, procedura, famiglia, piattaforma) "
            "values (%s, %s, %s, %s, %s, %s, 'procedura', %s, %s)",
            (f"CIG{self.cig:06d}", istat, anno, oggetto or f"Lotto {self.cig}", importo, tipo, famiglia, piattaforma),
        )

    def lotti(self, istat, n, importo=1000, **kw):
        for _ in range(n):
            self.lotto(istat, importo, **kw)

    def ricalcola(self):
        self.c.execute("select refresh_appalti()")

    def anno(self, istat):
        return self.c.execute("select get_appalti_comune(%s)", (istat,)).fetchone()[0]["anni"][str(ANNO)]

    def scheda(self, istat):
        return self.c.execute("select get_appalti_comune(%s)", (istat,)).fetchone()[0]


@pytest.fixture
def k(db):
    return Cantiere(db)


def test_senza_lotti_la_scheda_e_null(k):
    c = k.comune()
    k.ricalcola()
    assert k.scheda(c) is None


def test_conteggi_e_quote(k):
    c = k.comune(popolazione=2000)
    k.lotti(c, 6, famiglia="diretto")
    k.lotti(c, 2, famiglia="aperta", importo=200_000)
    k.lotti(c, 2, famiglia="in_house")
    k.ricalcola()
    a = k.anno(c)
    assert a["n"] == 10
    assert a["n_diretti"] == 8  # diretti + in house
    assert a["quota_diretti"] == 80
    assert a["n_per_1000"] == 5  # 10 lotti / 2000 abitanti * 1000
    assert a["n_aperte"] == 2


def test_le_adesioni_a_convenzioni_si_contano_ma_non_si_sommano(k):
    # l'importo di un'adesione e' il massimale della convenzione, non cio' che il comune impegna
    c = k.comune()
    k.lotto(c, 10_000)
    k.lotto(c, 900_000_000, famiglia="adesione")
    k.ricalcola()
    a = k.anno(c)
    assert a["n"] == 2 and a["n_adesioni"] == 1
    assert a["importo"] == 10_000


def test_un_importo_impossibile_non_entra_nel_totale_ed_e_segnalato(k):
    # 1,1 miliardi di buoni pasto per un comune con 1 milione di pagamenti annui: un refuso
    c = k.comune(pagamenti=1_000_000)
    k.lotto(c, 50_000)
    k.lotto(c, 1_112_763_000)
    k.ricalcola()
    a = k.anno(c)
    assert a["n"] == 2  # il lotto conta
    assert a["importo"] == 50_000  # ma l'importo no
    assert a["n_importo_anomalo"] == 1
    assert a["n_senza_importo"] == 0


def test_un_lotto_grande_ma_plausibile_resta(k):
    # 5 milioni per una scuola in un comune da 1 milione di pagamenti: grande, non impossibile (< 10 volte)
    c = k.comune(pagamenti=1_000_000)
    k.lotto(c, 5_000_000)
    k.ricalcola()
    assert k.anno(c)["importo"] == 5_000_000


def test_lotti_senza_importo_sono_dato_mancante_non_anomalia(k):
    c = k.comune()
    k.lotto(c, None)
    k.lotto(c, 0)
    k.lotto(c, 1000)
    k.ricalcola()
    a = k.anno(c)
    assert a["n_senza_importo"] == 2 and a["n_importo_anomalo"] == 0
    assert a["importo"] == 1000


def test_senza_bilancio_vale_un_tetto_fisso(k):
    c = k.comune(pagamenti=None)
    k.lotto(c, 40_000_000)
    k.lotto(c, 60_000_000)  # oltre i 50 milioni
    k.ricalcola()
    a = k.anno(c)
    assert a["importo"] == 40_000_000 and a["n_importo_anomalo"] == 1


def test_importo_mediano(k):
    c = k.comune()
    for imp in (1000, 2000, 9000):
        k.lotto(c, imp)
    k.ricalcola()
    assert k.anno(c)["importo_mediano"] == 2000


def test_la_quota_di_diretti_si_confronta_solo_con_chi_ha_almeno_cinque_lotti(k):
    pochi = k.comune()
    k.lotti(pochi, 3, famiglia="diretto")  # 100% ma su 3 lotti: non dice nulla
    a, b = k.comune(), k.comune()
    k.lotti(a, 5, famiglia="aperta")
    k.lotti(b, 5, famiglia="diretto")
    k.ricalcola()
    assert k.anno(pochi)["rango_diretti"] is None
    assert k.anno(a)["rango_diretti"] == 0
    assert k.anno(b)["rango_diretti"] == 100


def test_la_piattaforma_si_mostra_solo_se_il_dato_e_diffuso(k):
    c = k.comune()
    # 10 lotti, solo 2 con l'informazione: il campo e' quasi sempre vuoto, la quota non e' affidabile
    k.lotto(c, 100, piattaforma=True)
    k.lotto(c, 100, piattaforma=False)
    k.lotti(c, 8, piattaforma=None)
    d = k.comune()
    k.lotti(d, 6, piattaforma=True)
    k.lotti(d, 2, piattaforma=False)
    k.ricalcola()
    assert k.anno(c)["quota_piattaforma"] is None
    assert k.anno(d)["quota_piattaforma"] == 75


def test_le_maggiori_sono_solo_lotti_attendibili_in_ordine(k):
    c = k.comune(pagamenti=1_000_000)
    k.lotto(c, 800_000, oggetto="Strada")
    k.lotto(c, 500_000, oggetto="Scuola")
    k.lotto(c, 9_000_000_000, oggetto="Refuso")  # impossibile
    k.lotto(c, 700_000_000, famiglia="adesione", oggetto="Convenzione")  # massimale
    k.ricalcola()
    mag = k.scheda(c)["maggiori"]
    assert [m["oggetto"] for m in mag] == ["Strada", "Scuola"]


def test_le_maggiori_sono_al_massimo_otto(k):
    c = k.comune(pagamenti=10_000_000)
    for i in range(12):
        k.lotto(c, (i + 1) * 1000)
    k.ricalcola()
    mag = k.scheda(c)["maggiori"]
    assert len(mag) == 8 and mag[0]["importo"] == 12_000


def test_tipi_e_famiglie(k):
    c = k.comune()
    k.lotto(c, 10, tipo="LAVORI")
    k.lotto(c, 10, tipo="LAVORI", famiglia="aperta")
    k.lotto(c, 10, tipo="SERVIZI")
    k.ricalcola()
    s = k.scheda(c)
    assert s["tipi"] == {"LAVORI": 2, "SERVIZI": 1}
    assert s["famiglie"] == {"diretto": 2, "aperta": 1}
