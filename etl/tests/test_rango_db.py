"""refresh_fhi(): il rango nella fascia e il suo ricalcolo dopo un reimport.

Ogni test costruisce i propri dati dentro una transazione che viene SEMPRE
annullata: il database resta com'era. Richiede TEST_DATABASE_URL e le
migrazioni applicate; si salta da solo altrimenti.
"""
import os

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")

# Esercizi che nessun dato vero usa: il rango si calcola per anno e fascia,
# quindi i comuni di prova restano soli anche col database pieno.
ANNO = 2099
ALTRO_ANNO = 2098
POLIGONO = "MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)))"


@pytest.fixture
def db():
    """Connessione con transazione aperta, mai confermata."""
    with psycopg.connect(URL) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


def comune(c, n, anni):
    """Crea un comune da 3.000 abitanti con un bilancio per anno. Ritorna {anno: id bilancio}."""
    mid = c.execute(
        "insert into municipalities (istat_code, name, region, province, population, geom) "
        "values (%s, %s, 'Prova', 'Prova', 3000, ST_GeomFromText(%s, 4326)) returning id",
        (f"R{n:05d}", f"Comune R{n:05d}", POLIGONO),
    ).fetchone()[0]
    ids = {}
    for anno, (proprie, correnti, totali, avanzo) in anni.items():
        ids[anno] = c.execute(
            "insert into budget_records (municipality_id, year, population, own_revenue, "
            "revenue_current, revenue_total, surplus_deficit, loans_in, loans_out) "
            "values (%s, %s, 3000, %s, %s, %s, %s, 0, 0) returning id",
            (mid, anno, proprie, correnti, totali, avanzo),
        ).fetchone()[0]
    return ids


def rango(c, bid):
    return c.execute(
        "select financial_health_score from budget_records where id = %s", (bid,)
    ).fetchone()[0]


def test_entrate_tornate_null_tolgono_il_rango(db):
    a = comune(db, 1, {ANNO: (500, 1000, 1200, 100)})
    b = comune(db, 2, {ANNO: (800, 1000, 1200, 300)})
    db.execute("select refresh_fhi(%s)", (ANNO,))
    assert rango(db, a[ANNO]) is not None
    assert rango(db, b[ANNO]) is not None

    # Il reimport porta le entrate di A a NULL: niente autonomia ne' saldo
    db.execute(
        "update budget_records set own_revenue = null, revenue_current = null, "
        "revenue_total = null, surplus_deficit = null where id = %s",
        (a[ANNO],),
    )
    db.execute("select refresh_fhi(%s)", (ANNO,))

    assert rango(db, a[ANNO]) is None, "il rango vecchio e' sopravvissuto al reimport"
    assert rango(db, b[ANNO]) is not None


def test_il_ricalcolo_di_un_anno_non_tocca_gli_altri(db):
    a = comune(db, 1, {ANNO: (500, 1000, 1200, 100), ALTRO_ANNO: (500, 1000, 1200, 100)})
    comune(db, 2, {ANNO: (800, 1000, 1200, 300), ALTRO_ANNO: (800, 1000, 1200, 300)})
    db.execute("select refresh_fhi(%s)", (ALTRO_ANNO,))
    prima = rango(db, a[ALTRO_ANNO])
    assert prima is not None

    db.execute(
        "update budget_records set own_revenue = null, revenue_current = null, "
        "revenue_total = null, surplus_deficit = null where id = %s",
        (a[ALTRO_ANNO],),
    )
    db.execute("select refresh_fhi(%s)", (ANNO,))

    assert rango(db, a[ALTRO_ANNO]) == prima
