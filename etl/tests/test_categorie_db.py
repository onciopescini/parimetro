"""La logica SQL della spesa per voce e del confronto tra pari.

Ogni test costruisce i propri dati dentro una transazione che viene SEMPRE
annullata: il database resta com'era. Richiede TEST_DATABASE_URL e le
migrazioni applicate; si salta da solo altrimenti.
"""
import os

import psycopg
import pytest

import categorie_spesa as cs

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")

# Un esercizio che nessun dato vero usa: le mediane si calcolano per anno, quindi i
# comuni di prova restano soli anche se il database contiene l'Italia intera.
ANNO = 2099

POLIGONO = "MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)))"


@pytest.fixture
def db():
    """Connessione con transazione aperta, mai confermata."""
    with psycopg.connect(URL) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


class Cantiere:
    """Costruisce comuni, bilanci e voci di prova."""

    def __init__(self, conn):
        self.c = conn
        self.n = 0

    def voce(self, codice, descrizione=None):
        natura, area = cs.classifica(codice)
        self.c.execute(
            "insert into spese_voci (codice, descrizione, natura, area) values (%s,%s,%s,%s) "
            "on conflict (codice) do update set descrizione = excluded.descrizione, "
            "natura = excluded.natura, area = excluded.area",
            (codice, descrizione or f"voce {codice}", natura, area),
        )

    def comune(self, popolazione, voci=None, anno=ANNO):
        """Crea comune + bilancio + importi {codice: importo}. Ritorna il codice ISTAT."""
        self.n += 1
        istat = f"T{self.n:05d}"
        mid = self.c.execute(
            "insert into municipalities (istat_code, name, region, province, population, geom) "
            "values (%s, %s, 'Prova', 'Prova', %s, ST_GeomFromText(%s, 4326)) returning id",
            (istat, f"Comune {istat}", popolazione, POLIGONO),
        ).fetchone()[0]
        bid = self.c.execute(
            "insert into budget_records (municipality_id, year, population) values (%s,%s,%s) returning id",
            (mid, anno, popolazione),
        ).fetchone()[0]
        for codice, importo in (voci or {}).items():
            self.c.execute(
                "insert into budget_items (budget_id, codice, importo) values (%s,%s,%s)",
                (bid, codice, importo),
            )
        return istat

    def ricalcola(self):
        self.c.execute("select refresh_aree()")

    def scheda(self, istat, anno=ANNO):
        return self.c.execute("select get_categorie_comune(%s, %s)", (istat, anno)).fetchone()[0]


RIFIUTI = "U1030215004"  # area rifiuti
STRADE = "U2020109012"  # area strade_trasporti
STIPENDI = "U1010101002"  # area personale


@pytest.fixture
def cantiere(db):
    k = Cantiere(db)
    for codice in (RIFIUTI, STRADE, STIPENDI):
        k.voce(codice)
    return k


def area_di(scheda, nome):
    return next(a for a in scheda["aree"] if a["area"] == nome)


class TestConfrontoTraPari:
    def _fascia_con_sei(self, k):
        """Sei comuni da 2.000 abitanti. Spesa rifiuti: 0, 10, 20, 30, 40, 50 euro pro capite."""
        # Il primo non spende nulla per i rifiuti: ha solo gli stipendi
        zero = k.comune(2000, {STIPENDI: 100_000})
        altri = [k.comune(2000, {RIFIUTI: pc * 2000, STIPENDI: 100_000}) for pc in (10, 20, 30, 40, 50)]
        k.ricalcola()
        return zero, altri

    def test_gli_zeri_contano_nella_mediana(self, cantiere):
        # Con lo zero la mediana di [0,10,20,30,40,50] e' 25; escludendolo
        # sarebbe 30 e tutti sembrerebbero spendere meno del dovuto.
        zero, altri = self._fascia_con_sei(cantiere)
        a = area_di(cantiere.scheda(altri[3]), "rifiuti")
        assert float(a["mediana_pc"]) == 25.0
        assert a["n_simili"] == 6

    def test_il_pro_capite_e_il_rango(self, cantiere):
        zero, altri = self._fascia_con_sei(cantiere)
        a = area_di(cantiere.scheda(altri[3]), "rifiuti")  # 40 euro/ab
        assert float(a["pc"]) == 40.0
        # 4 dei 5 "altri" del gruppo spendono meno di lui: percent_rank = 4/5
        assert a["rango"] == 80

    def test_chi_non_spende_ha_pro_capite_zero_e_rango_zero(self, cantiere):
        zero, _ = self._fascia_con_sei(cantiere)
        a = area_di(cantiere.scheda(zero), "rifiuti")
        assert float(a["pc"]) == 0.0
        assert a["rango"] == 0

    def test_il_confronto_e_solo_dentro_la_fascia(self, cantiere):
        zero, altri = self._fascia_con_sei(cantiere)
        # Una citta' da 100.000 abitanti: un'altra fascia, non deve spostare la mediana
        citta = cantiere.comune(100_000, {RIFIUTI: 100 * 100_000})
        cantiere.ricalcola()
        piccolo = area_di(cantiere.scheda(altri[3]), "rifiuti")
        assert float(piccolo["mediana_pc"]) == 25.0
        assert area_di(cantiere.scheda(citta), "rifiuti")["n_simili"] == 1

    def test_gli_anni_non_si_mescolano(self, cantiere):
        zero, altri = self._fascia_con_sei(cantiere)
        # Stesso comune, anno diverso, spesa molto diversa: nell'anno precedente e' solo
        k = cantiere
        vecchio = k.comune(2000, {RIFIUTI: 999_000}, anno=ANNO - 1)
        k.ricalcola()
        assert area_di(k.scheda(vecchio, ANNO - 1), "rifiuti")["n_simili"] == 1
        assert area_di(k.scheda(altri[0]), "rifiuti")["n_simili"] == 6


class TestScheda:
    def test_senza_dettaglio_non_c_e_scheda(self, cantiere):
        # Bilancio caricato ma senza voci: null, non una scheda vuota che sembri vera
        senza = cantiere.comune(2000)
        cantiere.ricalcola()
        assert cantiere.scheda(senza) is None

    def test_comune_inesistente(self, cantiere):
        cantiere.ricalcola()
        assert cantiere.scheda("T99999") is None

    def test_il_totale_e_la_somma_delle_voci(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 30_000, STRADE: 50_000, STIPENDI: 20_000})
        cantiere.ricalcola()
        s = cantiere.scheda(c)
        assert float(s["totale"]) == 100_000
        assert sum(float(a["importo"]) for a in s["aree"]) == pytest.approx(100_000)
        assert sum(float(n["importo"]) for n in s["nature"]) == pytest.approx(100_000)

    def test_le_aree_sono_ordinate_dalla_piu_pesante(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 30_000, STRADE: 50_000, STIPENDI: 20_000})
        cantiere.ricalcola()
        aree = [a["area"] for a in cantiere.scheda(c)["aree"]]
        # Le tre aree con spesa vengono prima di quelle a zero
        assert aree[:3] == ["strade_trasporti", "rifiuti", "personale"]

    def test_le_voci_sono_le_prime_25_e_il_resto_e_raggruppato(self, cantiere):
        k = cantiere
        codici = [f"U900000{n:04d}" for n in range(30)]
        for c in codici:
            k.voce(c)
        # Importi 1..30: le 25 piu' grandi sono 30..6, le altre 5 valgono 1+2+3+4+5
        c = k.comune(2000, {codice: i + 1 for i, codice in enumerate(codici)})
        k.ricalcola()
        s = k.scheda(c)
        assert len(s["voci"]) == 25
        assert float(s["voci"][0]["importo"]) == 30  # in ordine decrescente
        assert float(s["voci"][-1]["importo"]) == 6
        assert s["altre_voci"]["n"] == 5
        assert float(s["altre_voci"]["importo"]) == 15
        # Niente si perde: voci mostrate + altre = totale
        mostrate = sum(float(v["importo"]) for v in s["voci"])
        assert mostrate + float(s["altre_voci"]["importo"]) == float(s["totale"])

    def test_le_voci_a_zero_non_compaiono(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 10_000, STRADE: 0})
        cantiere.ricalcola()
        codici = [v["codice"] for v in cantiere.scheda(c)["voci"]]
        assert codici == [RIFIUTI]

    def test_ogni_voce_porta_la_sua_area(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 1, STRADE: 2})
        cantiere.ricalcola()
        voci = {v["codice"]: v["area"] for v in cantiere.scheda(c)["voci"]}
        assert voci == {RIFIUTI: "rifiuti", STRADE: "strade_trasporti"}


class TestIntegrita:
    def test_cancellare_un_bilancio_cancella_le_sue_voci(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 1})
        n = cantiere.c.execute(
            "select count(*) from budget_items i join budget_records b on b.id = i.budget_id "
            "join municipalities m on m.id = b.municipality_id where m.istat_code = %s", (c,)
        ).fetchone()[0]
        assert n == 1
        cantiere.c.execute(
            "delete from budget_records where municipality_id = "
            "(select id from municipalities where istat_code = %s)", (c,)
        )
        assert cantiere.c.execute(
            "select count(*) from budget_items i where not exists "
            "(select 1 from budget_records b where b.id = i.budget_id)"
        ).fetchone()[0] == 0

    def test_una_voce_deve_esistere_in_anagrafica(self, cantiere):
        c = cantiere.comune(2000)
        bid = cantiere.c.execute(
            "select b.id from budget_records b join municipalities m on m.id = b.municipality_id "
            "where m.istat_code = %s", (c,)
        ).fetchone()[0]
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            cantiere.c.execute(
                "insert into budget_items (budget_id, codice, importo) values (%s, 'U0000000000', 1)",
                (bid,),
            )


class TestRangoAlNettoDeiPrestiti:
    def _bilancio(self, k, surplus, loans_in, loans_out=0):
        istat = k.comune(2000)
        k.c.execute(
            "update budget_records set revenue_total = 1000, expenditure_total = %s, surplus_deficit = %s, "
            "loans_in = %s, loans_out = %s where municipality_id = (select id from municipalities where istat_code = %s)",
            (1000 - surplus, surplus, loans_in, loans_out, istat),
        )
        return istat

    def _punteggio(self, k, istat):
        return k.c.execute(
            "select financial_health_score from budget_records b join municipalities m on m.id = b.municipality_id "
            "where m.istat_code = %s and b.year = %s", (istat, ANNO)
        ).fetchone()[0]

    def test_un_mutuo_acceso_non_fa_salire_il_rango(self, cantiere):
        a = self._bilancio(cantiere, 100, 0)
        b = self._bilancio(cantiere, 150, 100)  # il saldo di cassa e' alto solo per il mutuo
        c = self._bilancio(cantiere, 120, 0)
        cantiere.c.execute("select refresh_fhi(%s)", (ANNO,))
        # Al netto del prestito B vale 50/900: ultimo. In cassa sarebbe primo.
        assert self._punteggio(cantiere, b) == 0
        assert self._punteggio(cantiere, c) == 100
        assert self._punteggio(cantiere, a) == 50

    def test_il_rimborso_non_fa_scendere_il_rango(self, cantiere):
        a = self._bilancio(cantiere, 100, 0)
        b = self._bilancio(cantiere, 60, 0, loans_out=80)  # gestione: 60+80 = 140
        cantiere.c.execute("select refresh_fhi(%s)", (ANNO,))
        assert self._punteggio(cantiere, b) == 100
        assert self._punteggio(cantiere, a) == 0

    def test_senza_prestiti_noti_si_ricade_sul_saldo_di_cassa(self, cantiere):
        a = self._bilancio(cantiere, 100, None)
        b = self._bilancio(cantiere, 150, None)
        cantiere.c.execute("select refresh_fhi(%s)", (ANNO,))
        assert self._punteggio(cantiere, b) == 100
        assert self._punteggio(cantiere, a) == 0


class TestSpesaConcentrata:
    def test_la_quota_e_la_voce_piu_grande_sul_totale(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 90_000, STRADE: 10_000})
        cantiere.c.execute(
            "update budget_records set expenditure_total = 100000 where year = %s and municipality_id = "
            "(select id from municipalities where istat_code = %s)", (ANNO, c))
        cantiere.c.execute("select refresh_concentrazione(%s)", (ANNO,))
        q = cantiere.c.execute(
            "select b.quota_voce_max from budget_records b join municipalities m on m.id = b.municipality_id "
            "where m.istat_code = %s and b.year = %s", (c, ANNO)).fetchone()[0]
        assert float(q) == 90.0

    def test_senza_dettaglio_la_quota_resta_null(self, cantiere):
        c = cantiere.comune(2000)
        cantiere.c.execute("select refresh_concentrazione(%s)", (ANNO,))
        q = cantiere.c.execute(
            "select b.quota_voce_max from budget_records b join municipalities m on m.id = b.municipality_id "
            "where m.istat_code = %s and b.year = %s", (c, ANNO)).fetchone()[0]
        assert q is None

    def test_la_classifica_porta_la_quota(self, cantiere):
        c = cantiere.comune(2000, {RIFIUTI: 80_000, STRADE: 20_000})
        cantiere.c.execute(
            "update budget_records set expenditure_total = 100000 where year = %s and municipality_id = "
            "(select id from municipalities where istat_code = %s)", (ANNO, c))
        cantiere.c.execute("select refresh_concentrazione(%s)", (ANNO,))
        righe = cantiere.c.execute(
            "select istat, concentrata from get_ranking(%s, 'expenditure_pc', null, 'Prova', true, 5)", (ANNO,)
        ).fetchall()
        assert (c, 80.0) in [(i, float(q)) for i, q in righe]
