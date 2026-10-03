"""La vista e la scheda degli investimenti (richiede TEST_DATABASE_URL).

Transazione sempre annullata. La vista contiene anche i comuni veri, se ci sono: i test non
dipendono da mediane o ranghi esatti, ma da quantita' che i dati veri non possono alterare.
"""
import os

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")
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

    def comune(self, popolazione=2000):
        self.n += 1
        istat = f"T{self.n:05d}"
        self.c.execute(
            "insert into municipalities (istat_code, name, region, province, population, geom) "
            "values (%s, %s, 'Prova', 'Prova', %s, ST_GeomFromText(%s, 4326))",
            (istat, f"Comune {istat}", popolazione, POLIGONO),
        )
        return istat

    def pnrr(self, istat, cup, fin, missione="M4", stato="In Corso", misura="X", titolo=None):
        self.c.execute(
            "insert into progetti_pnrr (cup, misura, istat, missione, descr_missione, descr_misura, titolo, fin_pnrr, fin_totale, stato) "
            "values (%s, %s, %s, %s, %s, 'misura', %s, %s, %s, %s)",
            (cup, misura, istat, missione, f"Missione {missione}", titolo or f"Progetto {cup}", fin, fin * 1.2, stato),
        )

    def opera(self, istat, codice, fin, natura="opere", titolo=None, ciclo=2, stato="Concluso", pagamenti=0):
        self.c.execute(
            "insert into progetti_coesione (codice_locale, cup, istat, natura, titolo, ciclo, tema, fin_pubblico, pagamenti, stato, link) "
            "values (%s, %s, %s, %s, %s, %s, 'Trasporti', %s, %s, %s, 'https://x/')",
            (codice, codice, istat, natura, titolo, ciclo, fin, pagamenti, stato),
        )

    def ricalcola(self):
        self.c.execute("select refresh_investimenti()")

    def scheda(self, istat):
        return self.c.execute("select get_investimenti_comune(%s)", (istat,)).fetchone()[0]


@pytest.fixture
def k(db):
    return Cantiere(db)


def test_comune_inesistente(k):
    k.ricalcola()
    assert k.scheda("ZZZZZZ") is None


def test_un_comune_senza_progetti_ha_zero_non_null(k):
    c = k.comune()
    k.ricalcola()
    s = k.scheda(c)
    assert s["pnrr"]["n"] == 0 and s["pnrr"]["progetti"] == []
    assert s["coesione"]["opere"]["n"] == 0 and s["coesione"]["altri"] == {}


def test_pnrr_per_abitante_e_totali(k):
    c = k.comune(popolazione=2000)
    k.pnrr(c, "A", 1_000_000, missione="M4")
    k.pnrr(c, "B", 500_000, missione="M2")
    k.pnrr(c, "C", 500_000, missione="M4", stato="Concluso")
    k.ricalcola()
    p = k.scheda(c)["pnrr"]
    assert p["n"] == 3 and p["fin_pnrr"] == 2_000_000
    assert p["pc"] == 1000  # 2 mln / 2000 abitanti
    assert p["conclusi"] == 1
    assert [(m["missione"], m["n"]) for m in p["missioni"]] == [("M4", 2), ("M2", 1)]  # per importo


def test_i_progetti_pnrr_di_altri_non_finiscono_su_questo_comune(k):
    a, b = k.comune(), k.comune()
    k.pnrr(a, "A", 100)
    k.pnrr(None, "RFI", 9_999_999_999)  # attuatore che non e' un comune
    k.ricalcola()
    assert k.scheda(a)["pnrr"]["fin_pnrr"] == 100
    assert k.scheda(b)["pnrr"]["n"] == 0


def test_la_lista_dei_progetti_e_in_ordine_di_importo_e_limitata_a_otto(k):
    c = k.comune()
    for i in range(12):
        k.pnrr(c, f"P{i:02d}", (i + 1) * 1000)
    k.ricalcola()
    prog = k.scheda(c)["pnrr"]["progetti"]
    assert len(prog) == 8
    assert [p["fin_pnrr"] for p in prog] == [12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000]
    assert k.scheda(c)["pnrr"]["n"] == 12  # il conteggio e' di tutti, non degli otto


def test_coesione_conta_le_opere_e_mostra_solo_quelle(k):
    c = k.comune(popolazione=1000)
    k.opera(c, "O1", 3_000_000, titolo="Strada", pagamenti=1_000_000)
    k.opera(c, "O2", 1_000_000, titolo="Ponte")
    k.ricalcola()
    o = k.scheda(c)["coesione"]["opere"]
    assert o["n"] == 2 and o["fin"] == 4_000_000 and o["pagamenti"] == 1_000_000
    assert o["pc"] == 4000
    assert [p["titolo"] for p in o["progetti"]] == ["Strada", "Ponte"]
    assert o["progetti"][0]["link"] == "https://x/"


def test_incentivi_e_contributi_hanno_solo_conteggio_e_importo_mai_i_nomi(k):
    c = k.comune()
    k.opera(c, "I1", 50_000, natura="incentivi", titolo=None)
    k.opera(c, "I2", 30_000, natura="incentivi", titolo=None)
    k.opera(c, "K1", 1_000, natura="contributi", titolo=None)
    k.opera(c, "S1", 7_000, natura="servizi", titolo="Formazione")
    k.ricalcola()
    s = k.scheda(c)["coesione"]
    assert s["opere"]["n"] == 0
    assert s["altri"]["incentivi"] == {"n": 2, "fin": 80_000}
    assert s["altri"]["contributi"] == {"n": 1, "fin": 1_000}
    # niente titoli nella scheda, nemmeno per i servizi: sono "altri", si contano e basta
    assert "titolo" not in str(s["altri"])
    assert s["opere"]["progetti"] == []


def test_per_ciclo_e_per_stato(k):
    c = k.comune()
    k.opera(c, "A", 100, ciclo=1, stato="Concluso")
    k.opera(c, "B", 200, ciclo=2, stato="Concluso")
    k.opera(c, "C", 300, ciclo=2, stato="In corso")
    k.ricalcola()
    o = k.scheda(c)["coesione"]["opere"]
    assert o["stati"] == {"Concluso": 2, "In corso": 1}
    assert [(x["ciclo"], x["n"], x["fin"]) for x in o["cicli"]] == [(1, 1, 100), (2, 2, 500)]


def test_chi_ha_piu_di_tutti_i_comuni_veri_e_in_cima_alla_sua_fascia(k):
    c = k.comune(popolazione=2000)
    k.pnrr(c, "A", 5_000_000_000)  # 2,5 milioni a testa: piu' di qualunque comune vero
    k.ricalcola()
    assert k.scheda(c)["pnrr"]["rango"] == 100


def test_un_progetto_pnrr_con_importo_nullo_non_rompe_la_somma(k):
    c = k.comune()
    k.c.execute(
        "insert into progetti_pnrr (cup, misura, istat, missione, fin_pnrr) values ('N', 'M', %s, 'M1', null)", (c,))
    k.pnrr(c, "B", 100)
    k.ricalcola()
    assert k.scheda(c)["pnrr"]["fin_pnrr"] == 100
