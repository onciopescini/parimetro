"""Import IRPEF: le intestazioni cambiano per anno e le celle oscurate non sono zeri."""
import importlib.util
import pathlib

import pytest

ETL = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("irpef", ETL / "06_import_irpef.py")
irpef = importlib.util.module_from_spec(spec)
spec.loader.exec_module(irpef)

FASCE = [
    "minore o uguale a zero euro", "da 0 a 10000 euro", "da 10000 a 15000 euro", "da 15000 a 26000 euro",
    "da 26000 a 55000 euro", "da 55000 a 75000 euro", "da 75000 a 120000 euro", "oltre 120000 euro",
]


def intestazione(complessivo=True, spazio_finale=False):
    c = ["Anno di imposta", "Codice catastale", "Codice Istat Comune", "Denominazione Comune", "Sigla Provincia",
         "Regione", "Codice Istat Regione", "Numero contribuenti",
         "Reddito imponibile - Frequenza", "Reddito imponibile - Ammontare in euro",
         "Addizionale comunale dovuta - Frequenza", "Addizionale comunale dovuta - Ammontare in euro",
         "Reddito da lavoro dipendente e assimilati - Ammontare in euro",
         "Reddito da pensione - Ammontare in euro", "Reddito da fabbricati - Ammontare in euro",
         "Reddito da lavoro autonomo (comprensivo dei valori nulli) - Ammontare in euro",
         "Reddito da partecipazione (comprensivo dei valori nulli) - Ammontare in euro",
         "Reddito di spettanza dell'imprenditore in contabilita' ordinaria (comprensivo dei valori nulli) - Ammontare in euro",
         "Reddito di spettanza dell'imprenditore in contabilita' semplificata (comprensivo dei valori nulli) - Ammontare in euro"]
    if complessivo:
        c += ["Reddito complessivo - Frequenza", "Reddito complessivo - Ammontare in euro"]
    for f in FASCE:
        c += [f"Reddito complessivo {f} - Frequenza", f"Reddito complessivo {f} - Ammontare in euro" + (" " if spazio_finale and f == FASCE[-1] else "")]
    return c


def riga(codice, contribuenti, imponibile=("90", "900000"), fasce=None, complessivo=("100", "1000000")):
    r = ["2024", "A001", codice, "NOME", "XX", "Reg", "01", contribuenti, *imponibile, "80", "50000",
         "300000", "200000", "10000", "50000", "1000", "20000", "5000"]
    if complessivo:
        r += list(complessivo)
    f = fasce or ["", "", "", "", "", "", "", ""]
    for x in f:
        r += [x, "1" if x else ""]
    return r


def csv_di(intest, righe):
    return "\n".join(";".join(r) for r in [intest, *righe]) + "\n"


class TestLettura:
    def test_legge_anno_e_valori(self):
        anno, d = irpef.leggi_anno(csv_di(intestazione(), [riga("028001", "100")]))
        assert anno == 2024
        assert d["028001"]["contribuenti"] == 100
        assert d["028001"]["imponibile_euro"] == 900000
        assert d["028001"]["complessivo_euro"] == 1000000
        assert d["028001"]["addizionale_euro"] == 50000

    def test_celle_oscurate_sono_null_non_zero(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(), [riga("028001", "100", fasce=["", "5", "", "", "", "", "", ""])]))
        fasce = d["028001"]["fasce"]
        assert fasce["0_10"] == 5
        assert fasce["oltre_120"] is None  # oscurata: non e' "nessun ricco"

    def test_uno_zero_vero_resta_zero(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(), [riga("028001", "100", imponibile=("0", "0"))]))
        assert d["028001"]["imponibile_euro"] == 0

    def test_senza_colonna_reddito_complessivo_e_null(self):
        # 2020-2022 non la pubblicano: non si inventa sommando le fasce (sono oscurate)
        _, d = irpef.leggi_anno(csv_di(intestazione(complessivo=False), [riga("028001", "100", complessivo=None)]))
        assert d["028001"]["complessivo_euro"] is None
        assert d["028001"]["imponibile_euro"] == 900000

    def test_intestazione_con_spazio_in_fondo(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(spazio_finale=True), [riga("028001", "100", fasce=["", "", "", "", "", "", "", "3"])]))
        assert d["028001"]["fasce"]["oltre_120"] == 3

    def test_la_riga_senza_comune_si_scarta(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(), [riga("000000", "5000"), riga("028001", "100")]))
        assert list(d) == ["028001"]

    def test_codice_con_zeri_iniziali(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(), [riga("1001", "10")]))
        assert "001001" in d

    def test_impresa_e_la_somma_se_entrambe_note_altrimenti_null(self):
        _, d = irpef.leggi_anno(csv_di(intestazione(), [riga("028001", "100")]))
        assert d["028001"]["impresa_euro"] == 25000  # 20000 (ordinaria) + 5000 (semplificata)
        r = riga("028002", "100")
        r[17] = ""  # ordinaria oscurata
        _, d2 = irpef.leggi_anno(csv_di(intestazione(), [r]))
        assert d2["028002"]["impresa_euro"] is None

    def test_colonna_obbligatoria_mancante_ferma_lo_script(self):
        with pytest.raises(SystemExit):
            irpef.leggi_anno("a;b\n1;2\n")

    def test_numero(self):
        assert irpef.numero("12") == 12
        assert irpef.numero(" 7 ") == 7
        assert irpef.numero("") is None
        assert irpef.numero(None) is None
        assert irpef.numero("n.d.") is None
        assert irpef.numero("1234.0") == 1234


class TestFusioni:
    def _rec(self, contribuenti, imponibile, complessivo=None, oltre=None):
        return {"contribuenti": contribuenti, "imponibile_freq": contribuenti, "imponibile_euro": imponibile,
                "complessivo_freq": None, "complessivo_euro": complessivo, "addizionale_freq": None,
                "addizionale_euro": 10, "dipendente_euro": 5, "pensione_euro": 5, "fabbricati_euro": 5,
                "autonomo_euro": None, "impresa_euro": None, "partecipazione_euro": None,
                "fasce": {"0_10": contribuenti, "oltre_120": oltre}}

    def test_i_predecessori_si_sommano_al_successore(self):
        out = irpef.fondi_irpef({"013199": self._rec(100, 1000), "013228": self._rec(300, 5000)})
        assert list(out) == ["013256"]
        assert out["013256"]["contribuenti"] == 400
        assert out["013256"]["imponibile_euro"] == 6000
        assert out["013256"]["fasce"]["0_10"] == 400

    def test_un_valore_oscurato_rende_ignota_la_somma(self):
        out = irpef.fondi_irpef({"013199": self._rec(100, 1000, oltre=2), "013228": self._rec(300, 5000, oltre=None)})
        assert out["013256"]["fasce"]["oltre_120"] is None  # 2 + ignoto != 2
        assert out["013256"]["autonomo_euro"] is None

    def test_non_tocca_gli_altri_comuni(self):
        out = irpef.fondi_irpef({"058091": self._rec(10, 100)})
        assert out["058091"]["contribuenti"] == 10

    def test_non_altera_l_input(self):
        dati = {"013199": self._rec(100, 1000), "013228": self._rec(300, 5000)}
        irpef.fondi_irpef(dati)
        assert dati["013199"]["contribuenti"] == 100
