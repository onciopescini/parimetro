"""Invarianti sul database: schema e dati caricati.

DA ESEGUIRE CON UN DATABASE: si saltano da soli se TEST_DATABASE_URL non c'e'.
La variabile e' DIVERSA da DATABASE_URL apposta (quella dell'ETL scrive): qui
si fanno solo letture, ma una variabile dedicata evita di puntare questi test
a un database sbagliato senza accorgersene.

    TEST_DATABASE_URL=postgres://postgres:...@localhost:5432/mappabilanci pytest tests/test_dati_db.py

Le prove sulle fasce servono solo lo schema (migrazioni applicate); quelle
sui dati si saltano da sole se budget_records e' vuota.
"""
import os

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not URL, reason="serve TEST_DATABASE_URL (database con le migrazioni applicate)"
)


@pytest.fixture(scope="module")
def cur():
    with psycopg.connect(URL) as conn, conn.cursor() as c:
        # Nessuna scrittura da questi test: lo si impone, non lo si spera
        c.execute("set transaction read only")
        yield c


@pytest.fixture(scope="module")
def con_dati(cur):
    cur.execute("select count(*) from budget_records")
    if cur.fetchone()[0] == 0:
        pytest.skip("budget_records e' vuota: carica prima i dati con l'ETL")


# --- Schema: le fasce demografiche ------------------------------------------------
# Sono la base del confronto tra pari e del rango: un confine spostato di una
# riga cambierebbe silenziosamente chi e' "simile" a chi.


@pytest.mark.parametrize(
    "abitanti, fascia",
    [
        (None, "sotto 1.000 abitanti"),
        (0, "sotto 1.000 abitanti"),
        (999, "sotto 1.000 abitanti"),
        (1000, "da 1.000 a 5.000 abitanti"),
        (4999, "da 1.000 a 5.000 abitanti"),
        (5000, "da 5.000 a 20.000 abitanti"),
        (19999, "da 5.000 a 20.000 abitanti"),
        (20000, "da 20.000 a 60.000 abitanti"),
        (59999, "da 20.000 a 60.000 abitanti"),
        (60000, "da 60.000 a 250.000 abitanti"),
        (249999, "da 60.000 a 250.000 abitanti"),
        (250000, "oltre 250.000 abitanti"),
        (2_750_000, "oltre 250.000 abitanti"),
    ],
)
def test_confini_delle_fasce(cur, abitanti, fascia):
    cur.execute("select fascia_demografica(%s::int)", (abitanti,))
    assert cur.fetchone()[0] == fascia


def test_gli_anni_disponibili_sono_distinti_e_ordinati(cur):
    cur.execute("select get_available_years()")
    anni = cur.fetchone()[0]
    assert anni == sorted(set(anni))


# --- Dati ---------------------------------------------------------------------------


def test_un_solo_bilancio_per_comune_e_anno(cur, con_dati):
    cur.execute(
        "select count(*) from (select 1 from budget_records "
        "group by municipality_id, year having count(*) > 1) t"
    )
    assert cur.fetchone()[0] == 0


def test_il_rango_sta_tra_0_e_100(cur, con_dati):
    cur.execute(
        "select count(*) from budget_records "
        "where financial_health_score is not null and financial_health_score not between 0 and 100"
    )
    assert cur.fetchone()[0] == 0


def test_quasi_ogni_bilancio_ha_un_rango(cur, con_dati):
    # Il rango manca solo se mancano sia l'autonomia sia il saldo: su dati veri
    # sono pochissimi casi. Una quota alta vuol dire che refresh_fhi() non e'
    # stata lanciata dopo l'import.
    cur.execute(
        "select count(*) filter (where financial_health_score is null)::float "
        "/ nullif(count(*), 0) from budget_records"
    )
    assert cur.fetchone()[0] < 0.01


def test_la_popolazione_manca_di_rado(cur, con_dati):
    # Pro capite con popolazione 0 diventano null: pochi comuni, non centinaia
    cur.execute(
        "select count(*) filter (where population = 0)::float "
        "/ nullif(count(*), 0) from budget_records"
    )
    assert cur.fetchone()[0] < 0.005


def test_il_rango_e_distribuito_in_modo_uniforme(cur, con_dati):
    # E' un percentile dentro la fascia, riclassificato: per costruzione ogni
    # quinto dell'intervallo vale circa il 20% dei comuni. Se si torna a una
    # campana (la media di due percentili non e' un percentile) questo cade.
    cur.execute(
        """
        select year, least(floor(financial_health_score / 20.0), 4)::int as quinto, count(*)
        from budget_records
        where financial_health_score is not null
        group by 1, 2
        """
    )
    conteggi: dict[int, dict[int, int]] = {}
    for anno, quinto, n in cur.fetchall():
        conteggi.setdefault(anno, {})[quinto] = n
    for anno, per_quinto in conteggi.items():
        totale = sum(per_quinto.values())
        if totale < 1000:  # su pochi comuni il rango e' troppo granulare
            continue
        for quinto in range(5):
            quota = per_quinto.get(quinto, 0) / totale
            assert 0.12 < quota < 0.28, f"{anno}: quinto {quinto} = {quota:.1%}"
