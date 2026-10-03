"""I due modi semplici di assegnare un lotto ANAC a un'area di spesa (benchmark/baseline_lotti.py)."""
import json
import pathlib
import sys

import pytest

BENCH = pathlib.Path(__file__).resolve().parents[1] / "benchmark"
sys.path.insert(0, str(BENCH))
from baseline_lotti import AREE, area_da_cpv, area_da_parole  # noqa: E402


@pytest.mark.parametrize("cpv, atteso", [
    ("09310000-5", "utenze"), ("65310000-9", "utenze"), ("90511000-2", "rifiuti"), ("90610000-6", "strade_trasporti"),
    ("77310000-6", "ambiente_territorio"), ("45233142-6", "strade_trasporti"), ("45210000-2", "patrimonio"),
    ("85311000-2", "sociale_sanita"), ("80110000-8", "istruzione"), ("72000000-5", "funzionamento"),
    ("92000000-1", "cultura_sport_turismo"), ("98371110-8", "patrimonio"), ("", "altro"), (None, "altro"),
    ("Cpv prevalente non disponibile", "altro"),
])
def test_area_da_cpv(cpv, atteso):
    assert area_da_cpv(cpv) == atteso


@pytest.mark.parametrize("oggetto, atteso", [
    ("FORNITURA ENERGIA ELETTRICA UTENZE COMUNALI", "utenze"),
    ("Servizio di raccolta differenziata dei rifiuti", "rifiuti"),
    ("Servizio di trasporto scolastico", "istruzione"),
    ("Manutenzione strade comunali", "strade_trasporti"),
    ("Potatura alberature comunali", "ambiente_territorio"),
    ("Rinnovo licenze software 2025", "funzionamento"),
    ("RIBASSO PERCENTUALE BASE ASTA", "altro"),
])
def test_area_da_parole(oggetto, atteso):
    assert area_da_parole(oggetto) == atteso


def test_tutte_le_aree_sono_dichiarate():
    for nome in ("lotti_etichettati.json", "lotti_test.json"):
        for x in json.load(open(BENCH / nome, encoding="utf-8")):
            assert x["area"] in AREE


def test_i_due_campioni_non_hanno_lotti_in_comune():
    a = {x["cig"] for x in json.load(open(BENCH / "lotti_etichettati.json", encoding="utf-8"))}
    b = {x["cig"] for x in json.load(open(BENCH / "lotti_test.json", encoding="utf-8"))}
    assert not (a & b)


def test_le_parole_chiave_non_peggiorano_sul_campione_mai_visto():
    """58% a oggi sul campione di prova (80% esatto quando risponde). Il campione di sviluppo non vale: le
    parole chiave sono state scritte guardandolo."""
    lotti = json.load(open(BENCH / "lotti_test.json", encoding="utf-8"))
    giuste = sum(area_da_parole(x["oggetto"], x["cpv_descr"]) == x["area"] for x in lotti)
    assert giuste / len(lotti) >= 0.5
