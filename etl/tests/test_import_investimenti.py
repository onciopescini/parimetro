"""Import PNRR e coesione: le regole che decidono cosa finisce su un comune."""
import importlib.util
import pathlib
from datetime import date

import pandas as pd
import pytest

import investimenti as inv

ETL = pathlib.Path(__file__).resolve().parents[1]


def carica(nome):
    spec = importlib.util.spec_from_file_location(nome.replace(".py", ""), ETL / nome)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def pnrr():
    return carica("07_import_pnrr.py")


@pytest.fixture(scope="module")
def coesione():
    return carica("08_import_coesione.py")


# ------------------------------------------------------------------ PNRR
ANAG = inv.Anagrafica([("065062", "Laurito", None), ("058091", "Roma", None)], {})


def riga_pnrr(**kw):
    base = {
        "CUP": "E1", "ID Misura": "M4C1I1.1", "Missione": "M4", "Descrizione Missione": "Istruzione",
        "Descrizione Misura": "Asili nido", "Titolo Progetto": "Nuovo asilo", "CUP Descrizione Settore": "SOCIALI",
        "Soggetto Attuatore": "COMUNE DI LAURITO", "Codice Fiscale Soggetto Attuatore": "00776010654",
        "Finanziamento PNRR": "1033550", "Finanziamento Totale": "1706633,17", "Stato Avanzamento Progetto": "In Corso",
        "Data Inizio Progetto Effettiva": "08/02/2022", "Data Inizio Progetto Prevista": "01/01/2022",
        "Data Fine Progetto Effettiva": "", "Data Fine Progetto Prevista": "31/03/2026",
    }
    base.update(kw)
    return base


class TestPnrr:
    def test_numeri_con_virgola_decimale(self, pnrr):
        assert pnrr.numero("1706633,17") == pytest.approx(1706633.17)
        assert pnrr.numero("1033550") == 1033550
        assert pnrr.numero("") is None
        assert pnrr.numero(float("nan")) is None
        assert pnrr.numero("boh") is None

    def test_date(self, pnrr):
        assert pnrr.data("08/02/2022") == date(2022, 2, 8)
        assert pnrr.data("") is None
        assert pnrr.data("2022-02-08") is None  # formato diverso: meglio niente che sbagliato

    def test_un_progetto_di_un_comune(self, pnrr):
        righe, motivi = pnrr.righe_db(pd.DataFrame([riga_pnrr()]), ANAG)
        r = righe[0]
        assert r[:3] == ("E1", "M4C1I1.1", "065062")
        assert r[9] == 1033550 and r[10] == pytest.approx(1706633.17)
        assert dict(motivi) == {"nome": 1}

    def test_la_data_effettiva_vince_sulla_prevista_e_viceversa(self, pnrr):
        r = pnrr.righe_db(pd.DataFrame([riga_pnrr()]), ANAG)[0][0]
        assert r[12] == date(2022, 2, 8)  # inizio effettiva
        assert r[13] == date(2026, 3, 31)  # fine: manca l'effettiva, vale la prevista

    def test_un_progetto_di_rfi_resta_senza_comune(self, pnrr):
        df = pd.DataFrame([riga_pnrr(**{
            "Soggetto Attuatore": "RETE FERROVIARIA ITALIANA", "Codice Fiscale Soggetto Attuatore": "01585570581"})])
        righe, motivi = pnrr.righe_db(df, ANAG)
        assert righe[0][2] is None
        assert motivi["non_e_un_comune"] == 1

    def test_stesso_cup_in_misure_diverse_sono_due_progetti(self, pnrr):
        df = pd.DataFrame([riga_pnrr(), riga_pnrr(**{"ID Misura": "M5C2I2.1"})])
        assert len(pnrr.righe_db(df, ANAG)[0]) == 2

    def test_la_stessa_coppia_cup_misura_si_conta_una_volta(self, pnrr):
        df = pd.DataFrame([riga_pnrr(), riga_pnrr()])
        assert len(pnrr.righe_db(df, ANAG)[0]) == 1

    def test_senza_cup_o_misura_si_scarta(self, pnrr):
        df = pd.DataFrame([riga_pnrr(CUP=""), riga_pnrr(**{"ID Misura": ""})])
        assert pnrr.righe_db(df, ANAG)[0] == []


# -------------------------------------------------------------- coesione
class TestCoesione:
    @pytest.mark.parametrize("cod, atteso", [
        ("002007003", "007003"),            # Aosta
        ("003015146", "015146"),            # Milano
        ("", None), (None, None),
        ("002007003:::002007004", None),    # piu' comuni: non si divide il costo
        ("002", None), ("abcdefghi", None),
    ])
    def test_codice_istat_dal_codice_a_nove_cifre(self, coesione, cod, atteso):
        assert coesione.istat_da_cod_comune(cod) == atteso

    def test_un_comune_fuso_va_al_comune_di_oggi(self, coesione):
        assert coesione.istat_da_cod_comune("003013199") == "013256"  # Ronago -> Uggiate con Ronago

    @pytest.mark.parametrize("natura, g", [
        ("REALIZZAZIONE DI LAVORI PUBBLICI (OPERE ED IMPIANTISTICA)", "opere"),
        ("ACQUISTO O REALIZZAZIONE DI SERVIZI", "servizi"),
        ("ACQUISTO DI BENI", "beni"),
        ("CONCESSIONE DI CONTRIBUTI AD ALTRI SOGGETTI (DIVERSI DA UNITA' PRODUTTIVE)", "contributi"),
        ("CONCESSIONE DI INCENTIVI AD UNITA' PRODUTTIVE", "incentivi"),
        ("SOTTOSCRIZIONE INIZIALE O AUMENTO DI CAPITALE SOCIALE (COMPRESI SPIN OFF), FONDI DI RISCHIO", "capitale"),
        ("  acquisto di beni ", "beni"),
        ("COSA STRANA", "altro"), (None, "altro"),
    ])
    def test_genere(self, coesione, natura, g):
        assert coesione.genere(natura) == g

    def test_date_aaaammgg(self, coesione):
        assert coesione.data("20120613") == date(2012, 6, 13)
        assert coesione.data("2012") is None and coesione.data(None) is None

    def _r(self, **kw):
        base = {
            "COD_LOCALE_PROGETTO": "P1", "CUP": "C1", "OC_TITOLO_PROGETTO": "Strada", "OC_COD_CICLO": "2",
            "OC_TEMA_SINTETICO": "Trasporti",
            "CUP_DESCR_NATURA": "REALIZZAZIONE DI LAVORI PUBBLICI (OPERE ED IMPIANTISTICA)",
            "CUP_DESCR_SETTORE": "STRADE", "OC_FINANZ_TOT_PUB_NETTO": "1500000,50", "TOT_PAGAMENTI": "1000,00",
            "OC_STATO_PROGETTO": "In corso", "OC_DATA_INIZIO_PROGETTO": "20150101",
            "OC_DATA_FINE_PROGETTO_EFFETTIVA": "", "COD_COMUNE": "003015146", "OC_LINK": "https://x/p1/",
            "OC_FLAG_VISUALIZZAZIONE": "0",
        }
        base.update(kw)
        return base

    NOTI = {"015146", "007003", "013256"}

    def test_un_progetto_normale(self, coesione):
        righe, scarti = coesione.righe_db(pd.DataFrame([self._r()]), self.NOTI)
        r = righe[0]
        assert r[:5] == ("P1", "C1", "015146", "opere", "Strada")
        assert r[5] == 2 and r[8] == 1500000.5 and r[9] == 1000
        assert r[11] == date(2015, 1, 1) and r[12] is None
        assert not scarti

    def test_un_progetto_non_pubblicato_sul_portale_si_scarta(self, coesione):
        righe, scarti = coesione.righe_db(pd.DataFrame([self._r(OC_FLAG_VISUALIZZAZIONE="1")]), self.NOTI)
        assert righe == [] and scarti["non_pubblicato"] == 1

    def test_su_piu_comuni_o_senza_comune_si_scarta(self, coesione):
        df = pd.DataFrame([
            self._r(COD_COMUNE="003015146:::003015147"),
            self._r(COD_LOCALE_PROGETTO="P2", COD_COMUNE=""),
        ])
        righe, scarti = coesione.righe_db(df, self.NOTI)
        assert righe == [] and scarti["non_su_un_solo_comune"] == 2

    def test_comune_soppresso(self, coesione):
        righe, scarti = coesione.righe_db(pd.DataFrame([self._r(COD_COMUNE="003099999")]), self.NOTI)
        assert righe == [] and scarti["comune_soppresso_o_sconosciuto"] == 1

    def test_il_titolo_di_incentivi_e_contributi_non_si_salva(self, coesione):
        df = pd.DataFrame([
            self._r(COD_LOCALE_PROGETTO="A", OC_TITOLO_PROGETTO="Aiuto - TACITA S.R.L.",
                    CUP_DESCR_NATURA="CONCESSIONE DI INCENTIVI AD UNITA' PRODUTTIVE"),
            self._r(COD_LOCALE_PROGETTO="B", OC_TITOLO_PROGETTO="Voucher Mario Rossi",
                    CUP_DESCR_NATURA="CONCESSIONE DI CONTRIBUTI AD ALTRI SOGGETTI (DIVERSI DA UNITA' PRODUTTIVE)"),
            self._r(COD_LOCALE_PROGETTO="C", OC_TITOLO_PROGETTO="Scuolabus", CUP_DESCR_NATURA="ACQUISTO DI BENI"),
        ])
        righe, _ = coesione.righe_db(df, self.NOTI)
        assert [(r[3], r[4]) for r in righe] == [("incentivi", None), ("contributi", None), ("beni", "Scuolabus")]
        assert "TACITA" not in str(righe) and "Mario" not in str(righe)

    def test_senza_codice_locale_si_scarta(self, coesione):
        righe, scarti = coesione.righe_db(pd.DataFrame([self._r(COD_LOCALE_PROGETTO="")]), self.NOTI)
        assert righe == [] and scarti["senza_codice"] == 1

    def test_i_doppioni_si_scartano_anche_dentro_lo_stesso_pezzo(self, coesione):
        righe = [("P1", "a"), ("P1", "b"), ("P2", "c")]
        visti = set()
        assert [r[0] for r in coesione.senza_doppioni(righe, visti)] == ["P1", "P2"]
        assert coesione.senza_doppioni([("P2", "d"), ("P3", "e")], visti) == [("P3", "e")]
