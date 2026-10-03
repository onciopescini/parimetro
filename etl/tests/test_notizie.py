"""Notizie sui comuni: cosa si tiene, cosa si scarta, come si leggono le date."""
import importlib.util
import pathlib
from datetime import date

ETL = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("notizie", ETL / "notizie.py")
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

OGGI = date(2026, 10, 3)

# Risultati veri di una ricerca su Campobasso (accorciati): meta' sono cronaca, non conti
CAMPOBASSO = [
    {"title": "Comune di Campobasso: Rottamazione quinquies, primo si in Commissione Bilancio",
     "url": "https://www.molisenetwork.net/2026/06/10/x/", "date": "10 Jun 2026",
     "snippet": "La Rottamazione-quinquies consente di estinguere i debiti versando solo il capitale"},
    {"title": "Campobasso, approvata la variazione di bilancio", "url": "https://www.molisenetwork.net/2026/05/20/y/",
     "date": "20 May 2026", "snippet": "Con 14 voti favorevoli il Consiglio comunale ha approvato la variazione di bilancio"},
    {"title": "Natale a Campobasso, il bilancio del Comune: \"Ampio consenso\"",
     "url": "https://www.ilgiornaledelmolise.it/2026/01/07/z/", "date": "7 Jan 2026",
     "snippet": "Concluse le feste l'amministrazione comunale di Campobasso traccia un bilancio del cartellone di iniziative"},
    {"title": "Più visitatori grazie a luminarie e iniziative: Comune Cb traccia bilancio",
     "url": "https://www.primonumero.it/2026/01/a/", "date": "7 Jan 2026", "snippet": "Da Palazzo San Giorgio si traccia un bilancio più che positivo"},
    {"title": "Il Consiglio Comunale di Campobasso approva il Bilancio di previsione 2025",
     "url": "https://www.cblive.it/comune/b.html", "date": "1 Jan 2025", "snippet": "approvato il Bilancio di previsione 2025"},
]


def test_si_tengono_solo_le_notizie_sui_conti_e_recenti():
    tenute = n.seleziona(CAMPOBASSO, "Campobasso", "Campobasso", False, OGGI)
    assert [t["titolo"][:20] for t in tenute] == ["Comune di Campobasso", "Campobasso, approvat"]  # piu' recente prima
    # solo titolo, fonte, data, link: nessun testo dell'articolo
    assert set(tenute[0]) == {"url", "titolo", "fonte", "data"}
    assert tenute[0]["fonte"] == "molisenetwork.net" and tenute[0]["data"] == date(2026, 6, 10)


def test_le_frasi_fatte_non_sono_conti():
    assert not n.pertinente("Natale in centro, il bilancio dell'amministrazione: ampio consenso")
    assert not n.pertinente("Il sindaco traccia un bilancio della stagione estiva")
    assert not n.pertinente("Commissione Bilancio convocata per giovedi")
    assert n.pertinente("Approvato il rendiconto 2025")
    assert n.pertinente("Gara d'appalto per la scuola, offerte entro venerdi")
    assert n.pertinente("Il Comune finisce in dissesto")
    assert n.pertinente("Tari più cara dal prossimo anno")


def test_serve_che_il_comune_sia_nominato():
    assert not n.cita_il_comune("Approvato il bilancio di previsione", None, "Campobasso", "Campobasso", False)
    assert n.cita_il_comune("Campobasso: approvato il bilancio", None, "Campobasso", "Campobasso", False)
    # "L'Aquila" e "Sant'Agata" si scrivono in piu' modi
    assert n.cita_il_comune("Il bilancio dell'Aquila", None, "L'Aquila", "L'Aquila", False)


def test_i_nomi_con_omonimi_chiedono_anche_la_provincia():
    # Castro e' in provincia di Lecce e di Bergamo
    assert not n.cita_il_comune("Castro, nuovo appalto per il porto", None, "Castro", "Lecce", True)
    assert n.cita_il_comune("Castro (Lecce), nuovo appalto per il porto", None, "Castro", "Lecce", True)


def test_social_e_siti_senza_testata_si_scartano():
    assert n.escluso("https://www.facebook.com/comune/posts/1")
    assert n.escluso("https://it.wikipedia.org/wiki/Roma")
    assert not n.escluso("https://www.ilgiornaledelmolise.it/x")
    assert n.fonte("https://www.rainews.it/a") == "rainews.it"


def test_date_assolute_e_relative():
    assert n.leggi_data("10 Jun 2026", OGGI) == date(2026, 6, 10)
    assert n.leggi_data("2026-06-10", OGGI) == date(2026, 6, 10)
    assert n.leggi_data("3 days ago", OGGI) == date(2026, 9, 30)
    assert n.leggi_data("2 settimane fa", OGGI) == date(2026, 9, 19)
    assert n.leggi_data("5 ore fa", OGGI) == OGGI
    assert n.leggi_data("boh", OGGI) is None and n.leggi_data(None, OGGI) is None


def test_una_notizia_senza_data_o_troppo_vecchia_si_scarta():
    r = {"title": "Comune di Elva: approvato il rendiconto", "url": "https://www.x.it/a", "snippet": "Elva"}
    assert n.seleziona([dict(r, date=None)], "Elva", "Cuneo", False, OGGI) == []
    assert n.seleziona([dict(r, date="1 Jan 2020")], "Elva", "Cuneo", False, OGGI) == []
    assert len(n.seleziona([dict(r, date="1 Sep 2026")], "Elva", "Cuneo", False, OGGI)) == 1


def test_stesso_link_una_volta_sola_e_massimo_otto():
    r = [{"title": f"Elva: appalto numero {i}", "url": f"https://x.it/{i % 12}", "date": "1 Sep 2026"} for i in range(30)]
    assert len(n.seleziona(r, "Elva", "Cuneo", False, OGGI)) == 8


def test_l_interrogazione_ha_il_nome_tra_virgolette():
    assert n.interrogazione("Roma", "Roma", False).startswith('"Comune di Roma"')
    assert "Lecce" in n.interrogazione("Castro", "Lecce", True)
    assert n.interrogazione("Chienes/Kiens", "Bolzano", False).startswith('"Comune di Chienes"')
