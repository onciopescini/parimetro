import importlib.util
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fusioni import codice_ente  # noqa: E402

_spec = importlib.util.spec_from_file_location("import_siope", os.path.join(os.path.dirname(__file__), "..", "04_import_siope.py"))
import_siope = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(import_siope)


def test_caines_ha_il_suo_codice_e_rifiano_il_proprio():
    assert codice_ente("021073", "COMUNE DI CAINES") == "021014"
    assert codice_ente("021073", " comune di caines ") == "021014"
    assert codice_ente("021073", "COMUNE DI RIFIANO") == "021073"
    assert codice_ente("070006", "COMUNE DI CAMPOBASSO") == "070006"


def test_correggi_codici_sulla_colonna():
    ist = pd.Series(["021073", "021073", "070006"])
    ente = pd.Series(["COMUNE DI CAINES", "COMUNE DI RIFIANO", "COMUNE DI CAMPOBASSO"])
    assert list(import_siope.correggi_codici(ist, ente)) == ["021014", "021073", "070006"]
