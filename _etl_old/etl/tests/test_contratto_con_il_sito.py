"""Contratto tra l'esportatore Python e il sito TypeScript.

L'esportatore scrive i file, il sito li cerca per nome: se i due calcolano il
nome in modo diverso la pagina resta vuota senza nessun errore evidente.
Le stesse tabelle (tests/fixtures/*.json) esistono in copia identica nel
repository dell'app, dove le verifica l'implementazione TypeScript.
"""
import json
import pathlib

import pytest

QUI = pathlib.Path(__file__).resolve().parent / "fixtures"
SLUG = json.loads((QUI / "slug-cases.json").read_text(encoding="utf-8"))
CLASSIFICHE = json.loads((QUI / "classifica-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("caso", SLUG, ids=lambda c: repr(c["input"]))
def test_slug(esportatore, caso):
    assert esportatore.slug(caso["input"]) == caso["expected"]


def test_slug_idempotente(esportatore):
    for caso in SLUG:
        assert esportatore.slug(esportatore.slug(caso["input"])) == esportatore.slug(caso["input"])


@pytest.mark.parametrize("caso", CLASSIFICHE, ids=lambda c: c["expected"])
def test_percorso_classifica(esportatore, caso):
    assert (
        esportatore.percorso_classifica(
            caso["anno"], caso["metric"], caso["desc"], caso["fascia"], caso["region"]
        )
        == caso["expected"]
    )


def test_percorsi_diversi_non_collidono(esportatore):
    percorsi = set()
    n = 0
    for m in ("fhi", "autonomia", "expenditure_pc", "revenue_pc"):
        for d in (True, False):
            for f in (None, "sotto 1.000 abitanti", "da 1.000 a 5.000 abitanti"):
                for r in (None, "Lombardia", "Valle D'Aosta"):
                    percorsi.add(esportatore.percorso_classifica(2024, m, d, f, r))
                    n += 1
    assert len(percorsi) == n


# Le due copie delle fixture devono restare identiche: se ne cambia una sola,
# ciascun lato continuerebbe a passare i propri test e il contratto si
# romperebbe senza che nessuno se ne accorga.
APP = pathlib.Path(__file__).resolve().parents[3] / "mappa-bilanci" / "tests" / "fixtures"


@pytest.mark.skipif(not APP.exists(), reason="il repository dell'app non e' accanto a questo")
@pytest.mark.parametrize("nome", ["slug-cases.json", "classifica-cases.json"])
def test_fixture_identiche_a_quelle_dell_app(nome):
    mia = json.loads((QUI / nome).read_text(encoding="utf-8"))
    sua = json.loads((APP / nome).read_text(encoding="utf-8"))
    assert mia == sua, f"{nome} diverge dalla copia nel repository dell'app"
