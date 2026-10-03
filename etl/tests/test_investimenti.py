"""Dal soggetto attuatore del PNRR al comune: mai a caso."""
import pytest

import investimenti as inv

COMUNI = [
    ("065062", "Laurito", None),
    ("010034", "Mezzanego", None),
    ("016065", "Castro", None),  # Bergamo
    ("075096", "Castro", None),  # Lecce
    ("011015", "La Spezia", None),
    ("066049", "L'Aquila", None),
    ("021021", "Chienes/Kiens", None),
    ("058091", "Roma", None),
    ("003001", "San Martino", None),
]
CF_IPA = {"84001510654": "065062", "02438750586": "058091"}


@pytest.fixture
def anag():
    return inv.Anagrafica(COMUNI, CF_IPA)


class TestNomeDaAttuatore:
    @pytest.mark.parametrize(
        "den, atteso",
        [
            ("COMUNE DI LAURITO", ("laurito", None)),
            ("Comune di Sant'Andrea del Garigliano", ("sant andrea del garigliano", None)),
            ("COMUNE D'ISCHIA", ("ischia", None)),
            ("COMUNE DELLA SPEZIA", ("spezia", None)),
            ("COMUNE DI CASTRO (BG)", ("castro", "BG")),
            ("  Città di Torino ", ("torino", None)),
        ],
    )
    def test_riconosce_il_comune(self, den, atteso):
        assert inv.nome_comune_da_attuatore(den) == atteso

    @pytest.mark.parametrize(
        "den",
        [
            "REGIONE LOMBARDIA", "MINISTERO DELLA SALUTE", "RETE FERROVIARIA ITALIANA", "",
            None, "UNIONE DEI COMUNI VALLE DEL X", "Comunità Montana del Y",
            "CONSORZIO DEI COMUNI Z", "ASL ROMA 1",
        ],
    )
    def test_non_e_il_comune_stesso(self, den):
        assert inv.nome_comune_da_attuatore(den) is None


class TestRisolvi:
    def test_dal_codice_fiscale_ipa(self, anag):
        assert anag.risolvi("COMUNE DI LAURITO", "84001510654") == ("065062", "codice_fiscale")

    def test_il_codice_fiscale_con_zeri_persi(self, anag):
        # Excel mangia gli zeri iniziali
        assert anag.risolvi("COMUNE DI ROMA", "2438750586")[0] == "058091"

    def test_dal_nome_se_il_codice_non_corrisponde(self, anag):
        # il PNRR usa la partita IVA, IPA il codice fiscale: il codice non si aggancia, il nome si'
        assert anag.risolvi("COMUNE DI MEZZANEGO", "00209450998") == ("010034", "nome")

    def test_due_comuni_con_lo_stesso_nome_non_si_indovina(self, anag):
        assert anag.risolvi("COMUNE DI CASTRO", "00000000000") == (None, "nome_ambiguo")

    def test_la_sigla_scioglie_l_ambiguita_solo_se_c_e_in_anagrafica(self):
        a = inv.Anagrafica([("016065", "Castro", "BG"), ("075096", "Castro", "LE")], {})
        assert a.risolvi("COMUNE DI CASTRO (LE)", "") == ("075096", "nome")
        assert a.risolvi("COMUNE DI CASTRO", "") == (None, "nome_ambiguo")

    def test_articolo_nel_nome(self, anag):
        assert anag.risolvi("COMUNE DELLA SPEZIA", "")[0] == "011015"
        assert anag.risolvi("COMUNE DELL'AQUILA", "")[0] == "066049"

    def test_nome_bilingue(self, anag):
        assert anag.risolvi("COMUNE DI CHIENES", "")[0] == "021021"
        assert anag.risolvi("COMUNE DI KIENS", "")[0] == "021021"

    def test_comune_sconosciuto(self, anag):
        assert anag.risolvi("COMUNE DI ATLANTIDE", "") == (None, "nome_sconosciuto")

    def test_un_ente_che_non_e_un_comune(self, anag):
        assert anag.risolvi("REGIONE LOMBARDIA", "12874720159") == (None, "non_e_un_comune")

    def test_codice_fiscale_incoerente_col_nome_non_vince(self):
        # CF di Roma ma attuatore "Comune di Laurito": una delle due fonti sbaglia, meglio non dire
        a = inv.Anagrafica(COMUNI, {"02438750586": "058091"})
        istat, motivo = a.risolvi("COMUNE DI LAURITO", "02438750586")
        assert istat == "065062" and motivo == "nome"  # si fida del nome, che e' univoco, non del codice

    def test_codice_fiscale_di_un_ente_non_comune(self, anag):
        # CF noto ma l'attuatore ha un nome che non e' un comune: il CF decide (es. "Città metropolitana"?)
        assert anag.risolvi(None, "84001510654")[0] == "065062"

    def test_celle_vuote_di_pandas_sono_nan_non_testo(self, anag):
        nan = float("nan")
        assert anag.risolvi(nan, nan) == (None, "non_e_un_comune")
        assert inv.nome_comune_da_attuatore(nan) is None

class TestAlias:
    def test_un_comune_poi_fuso_va_al_comune_di_oggi(self, anag):
        assert anag.risolvi("COMUNE DI QUERO VAS", "") == ("025075", "alias")
        assert anag.risolvi("COMUNE DI VIGHIZZOLO D'ESTE", "") == ("028108", "alias")

    def test_grafia_diversa_da_quella_istat(self, anag):
        assert anag.risolvi("COMUNE DI CASSANO ALLO IONIO", "") == ("078029", "alias")

    def test_nome_troncato_a_trenta_caratteri_con_prefisso_univoco(self):
        a = inv.Anagrafica([("041001", "Castrocaro Terme e Terra del Sole", None), ("041002", "Castro Pretorio", None)], {})
        assert a.risolvi("COMUNE DI CASTROCARO TERME E TERRA DEL S", "") == ("041001", "nome_troncato")

    def test_un_prefisso_corto_non_si_interpreta(self):
        # "COMUNE DI CASTRO" potrebbe essere l'inizio di mille nomi: sotto soglia non si indovina
        a = inv.Anagrafica([("041001", "Castrocaro Terme e Terra del Sole", None)], {})
        assert a.risolvi("COMUNE DI CASTRO", "") == (None, "nome_sconosciuto")

    def test_prefisso_lungo_ma_ambiguo_non_si_risolve(self):
        a = inv.Anagrafica([("1", "Sant Andrea Apostolo dello Ionio", None), ("2", "Sant Andrea Apostolo dello Ionio Marina", None)], {})
        assert a.risolvi("COMUNE DI SANT'ANDREA APOSTOLO DELLO ION", "")[0] is None


class TestDenominazioniParticolari:
    def test_roma_capitale(self, anag):
        assert anag.risolvi("ROMA CAPITALE", "02438750586") == ("058091", "alias")
        assert anag.risolvi("Roma Capitale", None) == ("058091", "alias")

    def test_citta_con_apostrofo(self):
        assert inv.nome_comune_da_attuatore("CITTA' DI LUINO") == ("luino", None)

    def test_dopo_il_trattino_si_scarta_la_seconda_lingua_o_l_intitolazione(self):
        assert inv.nome_comune_da_attuatore("COMUNE DI CHIENES - GEMEINDE KIENS") == ("chienes", None)
        assert inv.nome_comune_da_attuatore("CITTA' DI LUINO - CARLO VOLONTE'") == ("luino", None)

    def test_un_ufficio_del_comune_e_il_comune(self):
        assert inv.nome_comune_da_attuatore("COMUNE DI X - UFFICIO TECNICO") == ("x", None)

    def test_ma_un_consorzio_o_un_unione_no(self):
        assert inv.nome_comune_da_attuatore("COMUNE DI X - UNIONE MONTANA") is None

    def test_nome_bilingue_con_trattino_nell_anagrafica(self):
        a = inv.Anagrafica([("031003", "Doberdò del Lago-Doberdob", None), ("032005", "Sgonico-Zgonik", None)], {})
        assert a.risolvi("COMUNE DI DOBERDO' DEL LAGO", "") == ("031003", "nome_bilingue")
        assert a.risolvi("COMUNE DI SGONICO", "") == ("032005", "nome_bilingue")

    def test_il_nome_intero_vince_sulla_variante(self):
        a = inv.Anagrafica([("030108", "Savogna", None), ("031022", "Savogna d'Isonzo-Sovodnje ob Soci", None)], {})
        assert a.risolvi("COMUNE DI SAVOGNA", "") == ("030108", "nome")
        assert a.risolvi("COMUNE DI SAVOGNA D'ISONZO", "") == ("031022", "nome_bilingue")

    def test_una_citta_metropolitana_non_e_un_comune(self, anag):
        assert inv.nome_comune_da_attuatore("CITTA' METROPOLITANA DI ROMA CAPITALE") is None
        assert anag.risolvi("CITTA' METROPOLITANA DI MILANO", "") == (None, "non_e_un_comune")

    def test_paterno_con_accento_e_senza(self):
        a = inv.Anagrafica([("087033", "Paternò", None), ("076059", "Paterno", None)], {})
        assert a.risolvi("COMUNE DI PATERNO'", "") == ("087033", "alias")
        assert a.risolvi("COMUNE DI PATERNO", "") == (None, "nome_ambiguo")
