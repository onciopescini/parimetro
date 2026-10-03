"""La vista della concorrenza nelle gare (richiede TEST_DATABASE_URL). Esercizio fittizio 2099, transazione annullata."""
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
    def __init__(self, c):
        self.c, self.n, self.cig = c, 0, 0

    def comune(self, popolazione=2000):
        self.n += 1
        istat = f"T{self.n:05d}"
        self.c.execute(
            "insert into municipalities (istat_code, name, region, province, population, geom) "
            "values (%s, %s, 'Prova', 'Prova', %s, ST_GeomFromText(%s, 4326))",
            (istat, f"Comune {istat}", popolazione, POLIGONO))
        return istat

    def gara(self, istat, offerte, ribasso=5.0, famiglia="aperta"):
        self.cig += 1
        cig = f"CIG{self.cig:06d}"
        self.c.execute(
            "insert into appalti_comuni (cig, istat, anno, famiglia, importo) values (%s, %s, %s, %s, 1000)",
            (cig, istat, ANNO, famiglia))
        self.c.execute("insert into aggiudicazioni_comuni (cig, offerte, ribasso) values (%s, %s, %s)", (cig, offerte, ribasso))

    def ricalcola(self):
        self.c.execute("select refresh_concorrenza()")

    def anno(self, istat):
        s = self.c.execute("select get_concorrenza_comune(%s)", (istat,)).fetchone()[0]
        return None if s is None else s[str(ANNO)]


@pytest.fixture
def k(db):
    return Cantiere(db)


def test_comune_senza_gare_con_aggiudicazione_e_null(k):
    c = k.comune()
    k.ricalcola()
    assert k.anno(c) is None


def test_quota_di_offerta_unica_e_offerte_mediane(k):
    c = k.comune()
    for o in (1, 1, 2, 3, 5):
        k.gara(c, o)
    k.ricalcola()
    a = k.anno(c)
    assert a["n_gare"] == 5 and a["n_offerta_unica"] == 2
    assert a["quota_offerta_unica"] == 40 and a["offerte_mediane"] == 2


def test_gli_affidamenti_diretti_non_sono_gare(k):
    c = k.comune()
    k.gara(c, 1, famiglia="diretto")
    k.gara(c, 1, famiglia="in_house")
    k.gara(c, 1, famiglia="adesione")
    k.gara(c, 4, famiglia="aperta")
    k.ricalcola()
    assert k.anno(c)["n_gare"] == 1


def test_sotto_cinque_gare_non_si_confronta_e_il_ribasso_non_si_mostra(k):
    c = k.comune()
    for _ in range(4):
        k.gara(c, 1, ribasso=10)
    k.ricalcola()
    a = k.anno(c)
    assert a["quota_offerta_unica"] is None and a["rango_offerta_unica"] is None
    assert a["ribasso_mediano"] is None


def test_il_ribasso_mediano_ignora_i_valori_mancanti(k):
    c = k.comune()
    for r in (2, 4, 6, 8, 10, None, None):
        k.gara(c, 2, ribasso=r)
    k.ricalcola()
    assert k.anno(c)["ribasso_mediano"] == 6


def test_rango_fra_i_simili(k):
    poca, tanta = k.comune(), k.comune()
    for _ in range(5):
        k.gara(poca, 4)       # mai offerta unica
        k.gara(tanta, 1)      # sempre offerta unica
    k.ricalcola()
    assert k.anno(poca)["rango_offerta_unica"] == 0
    assert k.anno(tanta)["rango_offerta_unica"] == 100
    assert k.anno(tanta)["n_simili"] >= 2
