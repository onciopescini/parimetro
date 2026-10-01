"""Il confronto con i simili davanti a dati mancanti (richiede TEST_DATABASE_URL)."""
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


def _comune(conn, n, entrate, spese):
    istat = f"T{n:05d}"
    mid = conn.execute(
        "insert into municipalities (istat_code, name, region, province, population, geom) "
        "values (%s, %s, 'P', 'P', 2000, ST_GeomFromText(%s, 4326)) returning id",
        (istat, istat, POLIGONO),
    ).fetchone()[0]
    conn.execute(
        "insert into budget_records (municipality_id, year, population, revenue_total, expenditure_total) "
        "values (%s, %s, 2000, %s, %s)", (mid, ANNO, entrate, spese),
    )
    return istat


def _peer(conn, istat):
    return conn.execute("select get_peer_comparison(%s, %s)", (istat, ANNO)).fetchone()[0]


def test_senza_entrate_la_posizione_e_null_non_zero(db):
    _comune(db, 1, 4_000_000, 3_000_000)
    senza = _comune(db, 2, None, 3_000_000)
    p = _peer(db, senza)
    assert p["pct_revenue"] is None
    assert p["pct_expenditure"] is not None


def test_chi_non_ha_il_dato_non_conta_al_denominatore(db):
    # 3 comuni con entrate 1M, 2M, 3M e uno senza. Chi ha 2M e' sopra 2 su 3 (67%),
    # non 2 su 4 (50%): il comune senza dato non puo' stare sotto a nessuno
    _comune(db, 1, 2_000_000, 1)
    _comune(db, 2, 4_000_000, 1)
    _comune(db, 3, 6_000_000, 1)
    _comune(db, 4, None, 1)
    mediano = _peer(db, "T00001")
    assert mediano["pct_revenue"] == 33  # un comune su tre ha entrate <= le sue
    assert _peer(db, "T00003")["pct_revenue"] == 100
