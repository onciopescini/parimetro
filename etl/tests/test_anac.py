"""Import ANAC: quali lotti sono di un comune e come si classificano le procedure."""
import importlib.util
import pathlib
from datetime import date

import pandas as pd
import pytest

ETL = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("anac", ETL / "09_import_anac.py")
anac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anac)


class TestFamiglia:
    @pytest.mark.parametrize("etichetta, atteso", [
        ("AFFIDAMENTO DIRETTO", "diretto"),
        ("AFFIDAMENTO DIRETTO IN ADESIONE AD ACCORDO QUADRO/CONVENZIONE", "adesione"),
        ("CONFRONTO COMPETITIVO IN ADESIONE AD ACCORDO QUADRO/CONVENZIONE", "adesione"),
        ("AFFIDAMENTO DIRETTO A SOCIETA' IN HOUSE", "in_house"),
        ("PROCEDURA APERTA", "aperta"),
        ("PROCEDURA RISTRETTA", "ristretta"),
        ("PROCEDURA RISTRETTA SEMPLIFICATA", "ristretta"),
        ("PROCEDURA NEGOZIATA SENZA PREVIA PUBBLICAZIONE", "negoziata"),
        ("PROCEDURA NEGOZIATA PER AFFIDAMENTI SOTTO SOGLIA", "negoziata"),
        ("AFFIDAMENTO IN ECONOMIA - COTTIMO FIDUCIARIO", "negoziata"),
        ("ALTRA PROCEDURA A FASE UNICA", "altra"),
        ("PROCEDURA DI GARA", "altra"),
        ("  affidamento diretto ", "diretto"),
        (None, "altra"), ("", "altra"),
    ])
    def test_famiglia(self, etichetta, atteso):
        assert anac.famiglia(etichetta) == atteso

    def test_l_adesione_vince_sull_affidamento_diretto(self):
        # il fornitore e' gia' scelto dalla convenzione: non e' una scelta del comune e l'importo e' il massimale
        assert anac.famiglia("AFFIDAMENTO DIRETTO IN ADESIONE AD ACCORDO QUADRO/CONVENZIONE") != "diretto"


class TestValori:
    def test_numero(self):
        assert anac.numero("500301.43") == pytest.approx(500301.43)
        assert anac.numero("0.0") == 0
        assert anac.numero("-5") is None  # negativo: errore di inserimento
        assert anac.numero("") is None and anac.numero(None) is None and anac.numero("boh") is None

    def test_flag_vuoto_non_e_no(self):
        assert anac.flag("1") is True and anac.flag("1.0") is True
        assert anac.flag("0") is False and anac.flag("0.0") is False
        assert anac.flag("") is None and anac.flag(None) is None and anac.flag("x") is None

    def test_data(self):
        assert anac.data("2024-01-10") == date(2024, 1, 10)
        assert anac.data("2024-01-10 00:00:00") == date(2024, 1, 10)
        assert anac.data("") is None and anac.data("10/01/2024") is None


def lotto(**kw):
    base = {
        "cig": "A1", "oggetto_lotto": "Manutenzione strade", "importo_lotto": "50000.0",
        "oggetto_principale_contratto": "LAVORI", "data_pubblicazione": "2024-03-05",
        "tipo_scelta_contraente": "AFFIDAMENTO DIRETTO", "cf_amministrazione_appaltante": "01199250158",
        "denominazione_amministrazione_appaltante": "COMUNE DI MILANO", "cod_cpv": "45233142-6",
        "descrizione_cpv": "Lavori di riparazione stradale", "anno_pubblicazione": "2024",
        "data_cancellazione": "", "data_ultimo_perfezionamento": "2024-06-06",
        "strumento_svolgimento": "PROCEDURE SVOLTE ATTRAVERSO PIATTAFORME TELEMATICHE",
        "flag_urgenza": "0.0", "esito": "AGGIUDICATA", "flag_pnrr_pnc": "1",
    }
    base.update(kw)
    return base


def comune_solo(denominazione, cf):
    return "015146" if denominazione == "COMUNE DI MILANO" else None


class TestRighe:
    def test_un_lotto_di_un_comune(self):
        righe, scarti = anac.righe_db(pd.DataFrame([lotto()]), comune_solo)
        r = righe[0]
        assert r[:3] == ("A1", "015146", 2024)
        assert r[3] == date(2024, 3, 5) and r[5] == 50000 and r[6] == "LAVORI"
        assert r[8] == "diretto"
        assert r[11] is True       # aggiudicata
        assert r[12] is False      # urgenza
        assert r[13] is True       # pnrr
        assert r[14] is True       # piattaforma
        assert r[15] == date(2024, 6, 6)
        assert not scarti

    def test_un_lotto_di_un_ente_che_non_e_un_comune_si_scarta(self):
        righe, scarti = anac.righe_db(pd.DataFrame([lotto(denominazione_amministrazione_appaltante="ASL ROMA 1")]), comune_solo)
        assert righe == [] and scarti["committente_non_comune"] == 1

    def test_un_cig_cancellato_si_scarta(self):
        righe, scarti = anac.righe_db(pd.DataFrame([lotto(data_cancellazione="2024-04-01")]), comune_solo)
        assert righe == [] and scarti["cancellato"] == 1

    def test_senza_cig(self):
        righe, scarti = anac.righe_db(pd.DataFrame([lotto(cig="")]), comune_solo)
        assert righe == [] and scarti["senza_cig"] == 1

    def test_l_anno_manca_si_ricava_dalla_data(self):
        righe, _ = anac.righe_db(pd.DataFrame([lotto(anno_pubblicazione="")]), comune_solo)
        assert righe[0][2] == 2024

    def test_senza_anno_ne_data_si_scarta(self):
        righe, scarti = anac.righe_db(pd.DataFrame([lotto(anno_pubblicazione="", data_pubblicazione="")]), comune_solo)
        assert righe == [] and scarti["senza_anno"] == 1

    def test_dati_vecchi_senza_esito_e_piattaforma_restano_sconosciuti_non_falsi(self):
        righe, _ = anac.righe_db(pd.DataFrame([lotto(esito="", strumento_svolgimento="", flag_urgenza="", flag_pnrr_pnc="")]), comune_solo)
        r = righe[0]
        assert r[11] is None and r[12] is None and r[13] is None and r[14] is None

    def test_strumento_tradizionale_non_e_piattaforma(self):
        righe, _ = anac.righe_db(pd.DataFrame([lotto(strumento_svolgimento="PROCEDURA SVOLTA IN MODALITÀ TRADIZIONALE O CARTACEA")]), comune_solo)
        assert righe[0][14] is False

    def test_esito_negativo_non_e_aggiudicata(self):
        righe, _ = anac.righe_db(pd.DataFrame([lotto(esito="NON AGGIUDICATA")]), comune_solo)
        assert righe[0][11] is False

    def test_importo_negativo_diventa_sconosciuto(self):
        righe, _ = anac.righe_db(pd.DataFrame([lotto(importo_lotto="-100")]), comune_solo)
        assert righe[0][5] is None
