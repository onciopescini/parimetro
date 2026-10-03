"""ISTAT: i due file che cambiano forma senza avvisare.

Entrambe le trappole sono state scoperte importando i file veri:
  - l'Elenco comuni ha un a-capo LETTERALE dentro il nome di una colonna
  - il CSV POSAS si apre con una riga di titolo prima dell'intestazione, e ha
    una riga per ogni eta': il totale del comune e' la riga con eta' 999
"""
import pytest

from config import ISTAT_ELENCO, POSAS

# --- Elenco comuni -----------------------------------------------------------

COL_PROV = ISTAT_ELENCO["col_provincia"]


def scrivi_elenco(tmp_path, righe, colonna_provincia=COL_PROV):
    """CSV latin-1 con ';' e con i campi tra virgolette, come ISTAT."""
    intestazione = [ISTAT_ELENCO["col_istat"], ISTAT_ELENCO["col_regione"], colonna_provincia]
    def campo(v):
        return '"' + v.replace('"', '""') + '"'
    testo = ";".join(campo(c) for c in intestazione) + "\n"
    testo += "".join(";".join(campo(v) for v in r) + "\n" for r in righe)
    p = tmp_path / "Elenco-comuni-italiani.csv"
    # write_bytes e non write_text: su Windows write_text traduce ogni a-capo
    # in CR+LF, compreso quello dentro il nome della colonna, che non
    # coinciderebbe piu' con la configurazione.
    p.write_bytes(testo.encode(ISTAT_ELENCO["encoding"]))
    return str(p)


class TestElencoComuni:
    def test_l_intestazione_con_a_capo_dentro_viene_riconosciuta(self, confini, tmp_path):
        # La configurazione deve contenere davvero un a-capo: se qualcuno lo
        # "ripulisce" lo script torna a fermarsi con "colonne non trovate".
        assert "\n" in COL_PROV
        f = scrivi_elenco(tmp_path, [("001001", "Piemonte", "Torino")])
        assert confini.load_elenco(f) == [("001001", "Piemonte", "Torino")]

    def test_riempie_con_zeri_il_codice(self, confini, tmp_path):
        f = scrivi_elenco(tmp_path, [("1001", "Piemonte", "Torino")])
        assert confini.load_elenco(f)[0][0] == "001001"

    def test_scarta_i_duplicati(self, confini, tmp_path):
        f = scrivi_elenco(
            tmp_path,
            [("001001", "Piemonte", "Torino"), ("001001", "Piemonte", "Torino")],
        )
        assert len(confini.load_elenco(f)) == 1

    def test_la_lettera_accentata_sopravvive_a_latin_1(self, confini, tmp_path):
        f = scrivi_elenco(tmp_path, [("040012", "Emilia-Romagna", "Forlì-Cesena")])
        assert confini.load_elenco(f)[0][2] == "Forlì-Cesena"

    def test_un_header_cambiato_ferma_lo_script_e_indica_il_rimedio(self, confini, tmp_path):
        f = scrivi_elenco(
            tmp_path,
            [("001001", "Piemonte", "Torino")],
            colonna_provincia="Denominazione provincia",  # nome diverso
        )
        with pytest.raises(SystemExit) as e:
            confini.load_elenco(f)
        assert "Colonne non trovate" in str(e.value)
        assert "--inspect" in str(e.value)


# --- POSAS ---------------------------------------------------------------------

C = POSAS


def scrivi_posas(tmp_path, righe, titolo=True):
    colonne = [C["col_istat"], "Comune", C["col_eta"], C["col_maschi"], C["col_femmine"], "Totale"]
    testo = ""
    if titolo:
        testo += '"Popolazione residente per età, sesso e stato civile al 1° gennaio 2024"\n'
    testo += ";".join(f'"{c}"' for c in colonne) + "\n"
    testo += "".join(";".join(map(str, r)) + "\n" for r in righe)
    p = tmp_path / "POSAS.csv"
    p.write_text(testo, encoding=C["encoding"])
    return str(p)


class TestPopolazione:
    def test_usa_solo_la_riga_totale_999_e_non_somma_le_eta(self, popolazione, tmp_path):
        # Se si sommassero le righe per eta' il comune risulterebbe di ~2x piu' grande
        f = scrivi_posas(
            tmp_path,
            [
                ("028001", "Abano", "0", 30, 35, 65),
                ("028001", "Abano", "1", 33, 31, 64),
                ("028001", "Abano", "999", 9764, 10669, 20433),
            ],
        )
        assert popolazione.popolazione_da_csv(f) == [("028001", 20433)]

    def test_somma_maschi_e_femmine(self, popolazione, tmp_path):
        f = scrivi_posas(tmp_path, [("028001", "A", "999", 10, 12, 22)])
        assert popolazione.popolazione_da_csv(f)[0][1] == 22

    def test_salta_la_riga_di_titolo(self, popolazione, tmp_path):
        con = scrivi_posas(tmp_path, [("028001", "A", "999", 1, 2, 3)], titolo=True)
        assert popolazione.popolazione_da_csv(con) == [("028001", 3)]

    def test_riempie_con_zeri_il_codice(self, popolazione, tmp_path):
        f = scrivi_posas(tmp_path, [("1001", "A", "999", 5, 5, 10)])
        assert popolazione.popolazione_da_csv(f)[0][0] == "001001"

    def test_piu_comuni_restano_separati(self, popolazione, tmp_path):
        f = scrivi_posas(
            tmp_path,
            [("028001", "A", "999", 10, 10, 20), ("098001", "B", "999", 1, 2, 3)],
        )
        assert dict(popolazione.popolazione_da_csv(f)) == {"028001": 20, "098001": 3}

    def test_il_csv_senza_riga_totale_non_inventa_popolazioni(self, popolazione, tmp_path):
        f = scrivi_posas(tmp_path, [("028001", "A", "0", 30, 35, 65)])
        assert popolazione.popolazione_da_csv(f) == []

    def test_colonna_mancante_ferma_lo_script(self, popolazione, tmp_path):
        p = tmp_path / "x.csv"
        p.write_text('"titolo"\n"a";"b"\n1;2\n', encoding="utf-8")
        with pytest.raises(SystemExit) as e:
            popolazione.popolazione_da_csv(str(p))
        assert "assente" in str(e.value)
