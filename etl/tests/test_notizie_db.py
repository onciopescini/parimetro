"""La scheda delle notizie (richiede TEST_DATABASE_URL). Transazione sempre annullata."""
import os

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")


@pytest.fixture
def db():
    with psycopg.connect(URL) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


def scheda(db, istat):
    return db.execute("select get_notizie_comune(%s)", (istat,)).fetchone()[0]


def test_mai_cercato_e_null(db):
    assert scheda(db, "T99999") is None


def test_cercato_senza_risultati_e_un_elenco_vuoto(db):
    db.execute("insert into notizie_raccolte (istat, raccolta_il, trovate) values ('T99999', '2026-10-01', 0)")
    s = scheda(db, "T99999")
    assert s["notizie"] == [] and s["raccolta_il"] == "2026-10-01"


def test_le_notizie_sono_le_piu_recenti_e_al_massimo_otto(db):
    db.execute("insert into notizie_raccolte (istat, raccolta_il, trovate) values ('T99999', '2026-10-01', 12)")
    for i in range(12):
        db.execute(
            "insert into notizie_comuni (istat, url, titolo, fonte, data) values ('T99999', %s, %s, 'x.it', %s)",
            (f"https://x.it/{i}", f"Notizia {i}", f"2026-09-{i + 1:02d}"))
    n = scheda(db, "T99999")["notizie"]
    assert len(n) == 8 and n[0]["titolo"] == "Notizia 11" and n[0]["data"] == "2026-09-12"
    assert set(n[0]) == {"titolo", "fonte", "data", "url"}  # nient'altro
    assert [x["data"] for x in n] == sorted((x["data"] for x in n), reverse=True)
