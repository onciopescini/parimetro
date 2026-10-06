"""Classificazione dei lotti per area di spesa: la logica pura e la scheda con le aree (la parte database richiede TEST_DATABASE_URL).

Le aree dei lotti devono essere quelle del sito: se qui ne compare una che il sito non conosce, nella scheda uscirebbe grezza.
"""
import os
import pathlib
import re

import psycopg
import pytest

from lotti_area import CRITERI, DOMANDA, SOGLIA, chiave_testo, risposta_valida, stato_lotto

WEB = pathlib.Path(__file__).resolve().parents[2] / "web"


def test_le_aree_dei_lotti_sono_quelle_del_sito():
    sito = set(re.findall(r"^\s+(\w+): \"", (WEB / "lib" / "categorie.ts").read_text(encoding="utf-8").split("export const NATURE")[0], re.M))
    assert set(CRITERI) - {"altro"} <= sito, set(CRITERI) - {"altro"} - sito


def test_i_criteri_sono_quelli_provati_nel_banco_di_prova():
    from benchmark.confronta_lotti import CRITERI as PROVATI

    assert CRITERI == PROVATI


def test_la_domanda_ha_tutte_le_opzioni_e_una_sola_scelta():
    d = DOMANDA["area"]
    assert d["type"] == "choice" and d["criteria"] is CRITERI


def test_lo_stato_ha_il_formato_del_banco_di_prova():
    s = stato_lotto("SERVIZI", "Fornitura gas", "Gas naturale")
    assert s == "Public procurement lot of an Italian municipality. Type: SERVIZI. Object: Fornitura gas. CPV category: Gas naturale"


def test_lotti_con_lo_stesso_testo_si_chiedono_una_volta():
    assert chiave_testo("SERVIZI", "Fornitura  gas ", "Gas") == chiave_testo("SERVIZI", "FORNITURA GAS", "Gas")
    assert chiave_testo("LAVORI", "Fornitura gas", "Gas") != chiave_testo("SERVIZI", "Fornitura gas", "Gas")
    assert chiave_testo(None, None, None) == ("", "", "")


def test_una_risposta_vale_solo_se_ha_un_area_nostra():
    assert risposta_valida({"choice": "rifiuti", "confidence": 0.9}) == ("rifiuti", 0.9)
    assert risposta_valida({"choice": "rifiuti"}) == ("rifiuti", 1.0)
    assert risposta_valida({"choice": "inventata", "confidence": 0.9}) is None
    assert risposta_valida({}) is None
    assert risposta_valida({"choice": "altro", "confidence": "boh"}) is None
    assert risposta_valida({"choice": "altro", "confidence": 7})[1] == 1.0
    assert SOGLIA == 0.5  # lo stesso numero e' scritto nella funzione SQL


# ------------------------------------------------------------------ la scheda, col database
URL = os.environ.get("TEST_DATABASE_URL")
ANNO = 2099
POLIGONO = "MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)))"


@pytest.fixture
def db():
    with psycopg.connect(URL) as conn:
        try:
            yield conn
        finally:
            conn.rollback()


@pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")
def test_la_scheda_ha_le_aree_con_le_regole_degli_importi(db):
    mid = db.execute(
        "insert into municipalities (istat_code, name, region, province, population, geom) "
        "values ('T99001', 'Comune prova', 'Prova', 'Prova', 2000, ST_GeomFromText(%s, 4326)) returning id", (POLIGONO,)
    ).fetchone()[0]
    db.execute("insert into budget_records (municipality_id, year, population, expenditure_total) values (%s, %s, 2000, 1000000)", (mid, ANNO))
    lotti = [
        # (cig, importo, famiglia, area, confidenza)
        ("A1", 1000, "diretto", "rifiuti", 0.9),
        ("A2", 3000, "diretto", "rifiuti", 0.8),
        ("A3", 500, "aperta", "funzionamento", 0.7),
        ("A4", 400, "diretto", "funzionamento", 0.4),  # confidenza bassa: non classificabile
        ("A5", 200, "diretto", "altro", 0.99),  # il modello dice altro: non classificabile
        ("A6", 100, "diretto", None, None),  # mai classificato: non classificabile
        ("A7", 20_000_000, "diretto", "rifiuti", 0.9),  # importo impossibile (oltre 10x i pagamenti): conta come lotto, non come importo
        ("A8", 50_000, "adesione", "rifiuti", 0.9),  # adesione a convenzione: fuori
    ]
    for cig, imp, fam, area, conf in lotti:
        db.execute(
            "insert into appalti_comuni (cig, istat, anno, oggetto, importo, tipo, procedura, famiglia) "
            "values (%s, 'T99001', %s, 'oggetto', %s, 'SERVIZI', 'p', %s)", (cig, ANNO, imp, fam))
        if area:
            db.execute("insert into lotti_area (cig, area, confidenza, modello) values (%s, %s, %s, 'prova')", (cig, area, conf))
    db.execute("select refresh_appalti()")
    aree = db.execute("select get_appalti_comune('T99001') -> 'aree' -> %s", (str(ANNO),)).fetchone()[0]
    assert aree["lotti"] == 7  # le adesioni non contano
    assert aree["classificati"] == 4  # A1, A2, A3, A7
    voci = {v["area"]: v for v in aree["voci"]}
    assert voci["rifiuti"]["n"] == 3
    assert float(voci["rifiuti"]["importo"]) == 4000  # A7 ha un importo impossibile: escluso dalla somma
    assert voci["funzionamento"]["n"] == 1 and float(voci["funzionamento"]["importo"]) == 500
    assert voci["non_classificabile"]["n"] == 3


@pytest.mark.skipif(not URL, reason="serve TEST_DATABASE_URL")
def test_un_comune_senza_lotti_classificati_non_ha_aree(db):
    mid = db.execute(
        "insert into municipalities (istat_code, name, region, province, population, geom) "
        "values ('T99002', 'Comune prova 2', 'Prova', 'Prova', 2000, ST_GeomFromText(%s, 4326)) returning id", (POLIGONO,)
    ).fetchone()[0]
    db.execute("insert into appalti_comuni (cig, istat, anno, oggetto, importo, tipo, procedura, famiglia) values ('B1', 'T99002', %s, 'x', 10, 'SERVIZI', 'p', 'diretto')", (ANNO,))
    db.execute("select refresh_appalti()")
    assert db.execute("select get_appalti_comune('T99002') -> 'aree'").fetchone()[0] == {}
    assert mid
