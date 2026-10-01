"""Fixture comuni ai test dell'ETL.

Gli script si chiamano 01_..., 02_...: nomi che iniziano con una cifra non
sono importabili con `import`, quindi si caricano dal percorso.
"""
import importlib.util
import pathlib
import sys

import pytest

ETL = pathlib.Path(__file__).resolve().parents[1]
# "import config" dentro gli script deve trovare etl/config.py
sys.path.insert(0, str(ETL))


def _carica(nome_file: str):
    percorso = ETL / nome_file
    spec = importlib.util.spec_from_file_location(percorso.stem.replace("-", "_"), percorso)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture(scope="session")
def siope():
    return _carica("04_import_siope.py")


@pytest.fixture(scope="session")
def popolazione():
    return _carica("02_import_population.py")


@pytest.fixture(scope="session")
def confini():
    return _carica("01_import_boundaries.py")


@pytest.fixture(scope="session")
def esportatore():
    return _carica("05_esporta_statico.py")
