"""Import aggiudicazioni ANAC: valori impossibili a NULL, una riga per CIG."""
import importlib.util
import pathlib

import pandas as pd
import pytest

ETL = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("agg", ETL / "11_import_aggiudicazioni.py")
agg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agg)


@pytest.mark.parametrize("v, atteso", [("6.1", 6.1), ("0", 0), ("100", 100), ("-5", None), ("101", None),
                                      ("-2810330", None), ("", None), (None, None), ("boh", None)])
def test_ribasso(v, atteso):
    assert agg.ribasso(v) == atteso


@pytest.mark.parametrize("v, atteso", [("3", 3), ("3.0", 3), ("0", 0), ("-1", None), ("2.5", None),
                                      ("505", 505), ("5000", None), ("", None)])
def test_offerte(v, atteso):
    assert agg.offerte(v) == atteso


def test_importo_negativo_e_nullo():
    assert agg.importo("-10") is None and agg.importo("") is None and agg.importo("8999.1") == 8999.1


def riga(**kw):
    base = {"cig": "A", "cod_esito": "1", "numero_offerte_ammesse": "3", "importo_aggiudicazione": "100",
            "ribasso_aggiudicazione": "5", "id_aggiudicazione": "10"}
    base.update(kw)
    return base


def test_si_tengono_solo_le_aggiudicate_una_per_cig_l_ultima():
    df = pd.DataFrame([
        riga(cig="A", id_aggiudicazione="10", numero_offerte_ammesse="2"),
        riga(cig="A", id_aggiudicazione="20", numero_offerte_ammesse="4"),   # riaggiudicazione: vale l'ultima
        riga(cig="B", cod_esito="6"),                                         # non aggiudicata
        riga(cig="C", cod_esito="99"),
    ])
    r = agg.righe_db(df)
    assert len(r) == 1 and r[0][0] == "A" and r[0][1] == 4


def test_valori_impossibili_diventano_null_ma_la_riga_resta():
    df = pd.DataFrame([riga(ribasso_aggiudicazione="-2810330", numero_offerte_ammesse="")])
    assert agg.righe_db(df) == [("A", None, None, 100.0)]
