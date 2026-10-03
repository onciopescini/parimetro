"""Natura e area di una voce di spesa.

La tabella di corrispondenza e' fatta a mano: questi test sono il modo in cui
la si controlla. Le 362 voci vere dei comuni del Molise (tests/fixtures/
voci_molise.json, solo codice e descrizione) devono passare tutte.
"""
import json
import pathlib
import re

import pytest

import categorie_spesa as cs

VOCI = json.loads(
    (pathlib.Path(__file__).parent / "fixtures" / "voci_molise.json").read_text(encoding="utf-8")
)
DESCRIZIONE = {v["codice"]: v["descrizione"] for v in VOCI}


class TestCoerenza:
    def test_le_voci_vere_sono_362(self):
        assert len(VOCI) == 362

    def test_ogni_codice_ha_il_formato_atteso(self):
        for v in VOCI:
            assert re.fullmatch(r"U\d{10}", v["codice"]), v

    def test_ogni_voce_ha_una_natura_e_un_area_conosciute(self):
        for v in VOCI:
            n, a = cs.classifica(v["codice"])
            assert n in cs.NATURE, (v, n)
            assert a in cs.AREE, (v, a)

    def test_ogni_regola_punta_a_un_area_esistente(self):
        for prefisso, a in cs._AREA_PER_PREFISSO.items():
            assert a in cs.AREE, (prefisso, a)

    def test_ogni_regola_serve_a_qualcosa(self):
        # Una regola che non riguarda nessuna voce vera e' quasi sempre un refuso
        # nel prefisso. Quelle sotto riguardano codici che il Molise non usa ma
        # che esistono nel piano dei conti: si controllano quando arrivano i dati
        # nazionali.
        senza_riscontro = {
            p for p in cs._AREA_PER_PREFISSO if not any(c.startswith(p) for c in DESCRIZIONE)
        }
        attese = {"U3", "U1080", "U2020202", "U2040", "U204"}
        assert senza_riscontro - attese == set(), senza_riscontro - attese

    def test_non_attribuibile_resta_una_minoranza_delle_voci(self):
        n = sum(1 for v in VOCI if cs.area(v["codice"]) == "non_attribuibile")
        assert n / len(VOCI) < 0.10, f"{n} voci su {len(VOCI)}"


class TestAree:
    @pytest.mark.parametrize(
        "codice, atteso",
        [
            ("U1030215004", "rifiuti"),  # contratti di servizio per la raccolta rifiuti
            ("U1030215005", "rifiuti"),  # conferimento in discarica
            ("U2020109012", "strade_trasporti"),  # infrastrutture stradali
            ("U1030215015", "strade_trasporti"),  # illuminazione pubblica
            ("U1030215001", "strade_trasporti"),  # trasporto pubblico
            ("U2020109003", "istruzione"),  # fabbricati ad uso scolastico
            ("U1030215006", "istruzione"),  # mense scolastiche
            ("U1030215002", "istruzione"),  # trasporto scolastico
            ("U1030215008", "sociale_sanita"),  # assistenza sociale residenziale
            ("U1030215010", "sociale_sanita"),  # asili nido
            ("U1040202999", "sociale_sanita"),  # assegni e sussidi assistenziali
            ("U2020109010", "ambiente_territorio"),  # infrastrutture idrauliche
            ("U2020109014", "ambiente_territorio"),  # sistemazione del suolo
            ("U2020109016", "cultura_sport_turismo"),  # impianti sportivi
            ("U2020109018", "cultura_sport_turismo"),  # musei, teatri, biblioteche
            ("U1030205004", "utenze"),  # energia elettrica
            ("U1030205006", "utenze"),  # gas
            ("U1010101002", "personale"),  # stipendi
            ("U1010201001", "personale"),  # contributi obbligatori
            ("U4030104003", "debito"),  # rimborso mutui alla Cassa Depositi e Prestiti
            ("U1070504003", "debito"),  # interessi passivi sui mutui
            ("U1040102005", "trasferimenti_imposte"),  # trasferimenti alle Unioni di Comuni
            ("U1020101001", "trasferimenti_imposte"),  # IRAP
            ("U1030201001", "funzionamento"),  # indennita' degli organi istituzionali
            ("U1030209008", "funzionamento"),  # manutenzione ordinaria di immobili
            ("U2020109001", "patrimonio"),  # fabbricati ad uso abitativo
        ],
    )
    def test_voci_chiave(self, codice, atteso):
        assert cs.area(codice) == atteso, DESCRIZIONE.get(codice)

    @pytest.mark.parametrize(
        "codice",
        [
            "U1030299999",  # altri servizi diversi n.a.c.
            "U1030215999",  # altre spese per contratti di servizio pubblico
            "U1030102999",  # altri beni e materiali di consumo n.a.c.
            "U2059999999",  # altre spese in conto capitale n.a.c.
            "U1109999999",  # altre spese correnti n.a.c.
            "U2020399001",  # beni immateriali n.a.c.
        ],
    )
    def test_le_voci_generiche_non_vengono_indovinate(self, codice):
        # Il motivo per cui la tabella e' fatta a mano: "Altri servizi n.a.c."
        # non appartiene a nessuna area, e dirlo vale piu' di forzarlo in una
        assert cs.area(codice) == "non_attribuibile"

    def test_depositi_e_partecipazioni_non_sono_un_servizio(self):
        # 739 milioni nel 2024 di "versamenti a depositi bancari": mettere questo
        # in "non attribuibile" faceva sembrare opaca una spesa che e' solo finanziaria
        assert cs.area("U3040701001") == "operazioni_finanziarie"
        assert cs.area("U3010103001") == "operazioni_finanziarie"

    def test_un_codice_sconosciuto_finisce_in_non_attribuibile(self):
        assert cs.area("U9999999999") == "non_attribuibile"


class TestPrefissoPiuLungo:
    def test_l_eccezione_sulla_singola_voce_batte_la_regola_del_gruppo(self):
        # Stesso gruppo U2020109: la regola generale dice patrimonio, le eccezioni no
        assert cs.area("U2020109001") == "patrimonio"  # abitativo -> regola del gruppo
        assert cs.area("U2020109003") == "istruzione"  # scolastico -> eccezione
        assert cs.area("U2020109012") == "strade_trasporti"  # stradale -> eccezione

    def test_stesso_macroaggregato_aree_diverse(self):
        # U10302150xx: contratti di servizio. Ciascuna voce ha la sua area.
        aree = {cs.area(f"U10302150{n:02d}") for n in (1, 2, 4, 8, 11, 15)}
        assert len(aree) == 5  # trasporti, istruzione, rifiuti, sociale, ambiente


class TestNatura:
    @pytest.mark.parametrize(
        "codice, atteso",
        [
            ("U1010101002", "personale"),
            ("U1020101001", "imposte_e_tasse"),
            ("U1030215004", "beni_e_servizi"),
            ("U1040102005", "trasferimenti_correnti"),
            ("U1070504003", "interessi_passivi"),
            ("U1100504001", "altre_spese_correnti"),
            ("U2020109012", "investimenti"),
            ("U2030102003", "contributi_investimenti"),
            ("U2042102003", "contributi_investimenti"),
            ("U2059999999", "altre_spese_capitale"),
            ("U3040701001", "attivita_finanziarie"),
            ("U4030104003", "rimborso_prestiti"),
        ],
    )
    def test_dalla_struttura_del_codice(self, codice, atteso):
        assert cs.natura(codice) == atteso

    def test_il_debito_e_interessi_piu_rimborsi(self):
        # Nelle voci vere: tutto cio' che e' interesse o rimborso e' area debito
        for v in VOCI:
            if cs.natura(v["codice"]) in ("interessi_passivi", "rimborso_prestiti"):
                assert cs.area(v["codice"]) == "debito", v
