"""La vista dei redditi IRPEF: medio, per abitante, posizione fra i simili (richiede TEST_DATABASE_URL).

Come gli altri test sul database: esercizio fittizio 2099, transazione sempre annullata.
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

    def comune(self, popolazione, contribuenti, imponibile, addizionale=None):
        """Un comune con bilancio e IRPEF nell'anno fittizio. Ritorna il codice ISTAT."""
        self.n += 1
        istat = f"T{self.n:05d}"
        mid = self.c.execute(
            "insert into municipalities (istat_code, name, region, province, population, geom) "
            "values (%s, %s, 'Prova', 'Prova', %s, ST_GeomFromText(%s, 4326)) returning id",
            (istat, f"Comune {istat}", popolazione, POLIGONO),
        ).fetchone()[0]
        self.c.execute(
            "insert into budget_records (municipality_id, year, population) values (%s, %s, %s)",
            (mid, ANNO, popolazione),
        )
        self.c.execute(
            "insert into irpef_comuni (istat_code, year, contribuenti, imponibile_freq, imponibile_euro, addizionale_euro) "
            "values (%s, %s, %s, %s, %s, %s)",
            (istat, ANNO, contribuenti, contribuenti, imponibile, addizionale),
        )
        return istat

    def ricalcola(self):
        self.c.execute("select refresh_reddito()")

    def riga(self, istat):
        return self.c.execute(
            "select medio, pc, addizionale_media, rango, mediana_simili, n_simili from reddito_pc where istat = %s and year = %s",
            (istat, ANNO),
        ).fetchone()


@pytest.fixture
def k(db):
    return Cantiere(db)


def test_medio_e_per_abitante(k):
    c = k.comune(popolazione=1000, contribuenti=800, imponibile=16_000_000, addizionale=80_000)
    k.ricalcola()
    medio, pc, add, *_ = k.riga(c)
    assert medio == 20_000  # 16 mln / 800 contribuenti
    assert pc == 16_000  # 16 mln / 1000 abitanti
    assert add == 100  # 80.000 / 800


def test_il_rango_e_dentro_la_fascia(k):
    # tre comuni piccoli (stessa fascia) con redditi 10k, 20k, 30k; un grande con 99k non conta
    poveri = k.comune(2000, 1000, 10_000_000)
    medi = k.comune(2000, 1000, 20_000_000)
    ricchi = k.comune(2000, 1000, 30_000_000)
    k.comune(100_000, 1000, 99_000_000)
    k.ricalcola()
    assert k.riga(poveri)[3] == 0
    assert k.riga(medi)[3] == 50
    assert k.riga(ricchi)[3] == 100
    assert k.riga(medi)[4] == 20_000  # mediana dei tre
    assert k.riga(medi)[5] == 3


def test_senza_imponibile_non_entra_(k):
    a = k.comune(2000, 1000, 10_000_000)
    senza = k.comune(2000, 1000, None)
    k.ricalcola()
    assert k.riga(senza) is None  # oscurato: non e' un reddito zero
    assert k.riga(a)[5] == 1  # e non fa numero fra i simili


def test_addizionale_oscurata_resta_null(k):
    c = k.comune(2000, 1000, 10_000_000, addizionale=None)
    k.ricalcola()
    assert k.riga(c)[2] is None


def test_scheda_per_anno_e_null_se_manca(k):
    c = k.comune(2000, 1000, 10_000_000)
    k.ricalcola()
    scheda = k.c.execute("select get_reddito_comune(%s)", (c,)).fetchone()[0]
    assert set(scheda) == {str(ANNO)}
    assert scheda[str(ANNO)]["medio"] == 10_000
    assert k.c.execute("select get_reddito_comune('ZZZZZZ')").fetchone()[0] is None


def test_la_classifica_per_reddito(k):
    a = k.comune(2000, 1000, 10_000_000)
    b = k.comune(2000, 1000, 30_000_000)
    c = k.comune(2000, 1000, 20_000_000)
    k.ricalcola()
    righe = k.c.execute(
        "select istat, valore from get_ranking(%s, 'reddito_medio', null, 'Prova', true, 5)", (ANNO,)
    ).fetchall()
    assert [r[0] for r in righe] == [b, c, a]
    assert float(righe[0][1]) == 30_000
    basse = k.c.execute(
        "select istat from get_ranking(%s, 'reddito_medio', null, 'Prova', false, 1)", (ANNO,)
    ).fetchall()
    assert basse[0][0] == a
