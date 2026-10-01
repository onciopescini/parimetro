"""SIOPE: le trappole che il codice deve evitare.

Ognuna di queste e' costata un errore vero sui dati reali:
  - gli importi sono CUMULATI da gennaio: sommare i mesi gonfia di 6 volte
  - nel file ci sono anche province, unioni e comunita' montane
  - il titolo 0 sono sospesi da regolarizzare, non entrate
"""
import pytest

INTESTAZIONE = (
    "Codice istat provincia;Codice istat comune;Codice Tipologia Ente BDAP;"
    "Anno/Mese calendario;Codice Titolo CG;Importo cumulato"
)


def csv_siope(tmp_path, righe, nome="entrate_X.csv"):
    """Scrive un CSV SIOPE minimo, in latin-1 e con ';' come i file veri."""
    testo = "\n".join([INTESTAZIONE] + [";".join(map(str, r)) for r in righe]) + "\n"
    p = tmp_path / nome
    p.write_text(testo, encoding="latin-1")
    return str(p)


class TestAggrega:
    def test_compone_il_codice_istat_da_provincia_e_comune(self, siope, tmp_path):
        f = csv_siope(tmp_path, [("070", "001", "CO", "2024/12", "E1000000000", "100.50")])
        acc = siope.aggrega([f])
        assert acc == {("070001", 12, "1"): pytest.approx(100.50)}

    def test_riempie_con_zeri_i_codici_corti(self, siope, tmp_path):
        f = csv_siope(tmp_path, [("70", "1", "CO", "2024/12", "E1000000000", "5")])
        assert list(siope.aggrega([f])) == [("070001", 12, "1")]

    def test_tiene_solo_i_comuni(self, siope, tmp_path):
        f = csv_siope(
            tmp_path,
            [
                ("070", "001", "CO", "2024/12", "E1000000000", "100"),
                ("070", "000", "PR", "2024/12", "E1000000000", "9999"),  # provincia
                ("070", "001", "UC", "2024/12", "E1000000000", "9999"),  # unione di comuni
                ("070", "001", "CM", "2024/12", "E1000000000", "9999"),  # comunita' montana
            ],
        )
        tot = sum(siope.aggrega([f]).values())
        assert tot == pytest.approx(100)

    def test_estrae_il_titolo_dalla_lettera_e_dalla_cifra(self, siope, tmp_path):
        # Le entrate cominciano per E, le uscite per U (non S): lo script deve
        # accettare entrambe senza dipendere dalla lettera.
        f = csv_siope(
            tmp_path,
            [
                ("070", "001", "CO", "2024/12", "E4000000000", "1"),
                ("070", "001", "CO", "2024/12", "U7000000000", "2"),
                ("070", "001", "CO", "2024/12", "E0000000000", "3"),
            ],
        )
        titoli = {k[2] for k in siope.aggrega([f])}
        assert titoli == {"4", "7", "0"}

    def test_somma_le_righe_dello_stesso_comune_mese_e_titolo(self, siope, tmp_path):
        # Piu' voci gestionali dello stesso titolo, stesso mese
        f = csv_siope(
            tmp_path,
            [
                ("070", "001", "CO", "2024/12", "E1000000000", "10"),
                ("070", "001", "CO", "2024/12", "E1000000000", "15.5"),
            ],
        )
        assert siope.aggrega([f])[("070001", 12, "1")] == pytest.approx(25.5)

    def test_unisce_piu_file(self, siope, tmp_path):
        # Un file per regione, mai lo stesso comune in due file: ma le chiavi si sommano
        a = csv_siope(tmp_path, [("070", "001", "CO", "2024/12", "E1000000000", "1")], "a.csv")
        b = csv_siope(tmp_path, [("001", "001", "CO", "2024/12", "E1000000000", "2")], "b.csv")
        acc = siope.aggrega([a, b])
        assert set(acc) == {("070001", 12, "1"), ("001001", 12, "1")}

    def test_colonne_mancanti_fermano_lo_script_con_un_messaggio(self, siope, tmp_path):
        p = tmp_path / "rotto.csv"
        p.write_text("a;b;c\n1;2;3\n", encoding="latin-1")
        with pytest.raises(SystemExit) as e:
            siope.aggrega([str(p)])
        assert "colonne non trovate" in str(e.value)


class TestUltimoMese:
    """Il test piu' importante del file: i cumulati."""

    def test_usa_il_mese_piu_alto_e_NON_la_somma_dei_mesi(self, siope):
        # Gen 100, giu 600, dic 1200: l'anno e' 1200, non 1900
        acc = {
            ("070001", 1, "1"): 100.0,
            ("070001", 6, "1"): 600.0,
            ("070001", 12, "1"): 1200.0,
        }
        assert siope.ultimo_mese(acc)["070001"]["1"] == pytest.approx(1200.0)

    def test_sommare_i_mesi_gonfierebbe_di_circa_sei_volte(self, siope):
        # Il difetto misurato sul Molise: 6,0x. Cumulato crescente linearmente
        # 1..12 mesi => la somma dei mesi vale 6,5 volte l'ultimo.
        acc = {("070001", m, "1"): 100.0 * m for m in range(1, 13)}
        corretto = siope.ultimo_mese(acc)["070001"]["1"]
        sbagliato = sum(acc.values())
        assert corretto == pytest.approx(1200.0)
        assert sbagliato / corretto == pytest.approx(6.5)

    def test_un_comune_con_dati_fermi_a_giugno_usa_giugno(self, siope):
        # Non va scartato ne' confrontato con dicembre degli altri
        acc = {
            ("070001", 6, "1"): 300.0,
            ("070002", 12, "1"): 900.0,
        }
        r = siope.ultimo_mese(acc)
        assert r["070001"]["1"] == pytest.approx(300.0)
        assert r["070002"]["1"] == pytest.approx(900.0)

    def test_non_dipende_dall_ordine_delle_righe(self, siope):
        a = {("070001", 12, "1"): 5.0, ("070001", 3, "1"): 1.0}
        b = {("070001", 3, "1"): 1.0, ("070001", 12, "1"): 5.0}
        assert siope.ultimo_mese(a) == siope.ultimo_mese(b)

    def test_somma_i_titoli_dello_stesso_mese_massimo(self, siope):
        acc = {
            ("070001", 12, "1"): 10.0,
            ("070001", 12, "3"): 7.0,
            ("070001", 11, "1"): 4.0,  # mese precedente: scartato
        }
        r = siope.ultimo_mese(acc)["070001"]
        assert r == {"1": 10.0, "3": 7.0}


class TestTotaliComune:
    ENTRATE = {"0": 50, "1": 100, "2": 20, "3": 30, "4": 40, "5": 5, "7": 900, "9": 800}
    SPESE = {"0": 9, "1": 120, "2": 40, "4": 10, "5": 999, "7": 777}

    def test_incassi_escludono_sospesi_anticipazioni_e_partite_di_giro(self, siope):
        # fuori: titolo 0 (sospesi), 7 (anticipazioni di tesoreria), 9 (conto terzi)
        assert siope.totali_comune(self.ENTRATE, self.SPESE)["incassi"] == 100 + 20 + 30 + 40 + 5

    def test_pagamenti_escludono_sospesi_chiusura_anticipazioni_e_partite_di_giro(self, siope):
        # fuori: titolo 0 (sospesi), 5 (chiusura anticipazioni), 7 (conto terzi)
        assert siope.totali_comune(self.ENTRATE, self.SPESE)["pagamenti"] == 120 + 40 + 10

    def test_componenti_delle_entrate(self, siope):
        t = siope.totali_comune(self.ENTRATE, self.SPESE)
        assert t["correnti"] == 100 + 20 + 30  # titoli 1+2+3
        assert t["capitale"] == 40 + 5  # titoli 4+5
        assert t["proprie"] == 100 + 30  # titoli 1+3: autonomia finanziaria

    def test_il_saldo_e_incassi_meno_pagamenti(self, siope):
        t = siope.totali_comune(self.ENTRATE, self.SPESE)
        assert t["saldo"] == t["incassi"] - t["pagamenti"] == 195 - 170

    def test_senza_spese_il_saldo_e_tutti_gli_incassi(self, siope):
        t = siope.totali_comune({"1": 100}, {})
        assert (t["incassi"], t["pagamenti"], t["saldo"]) == (100, 0, 100)

    def test_i_sospesi_non_gonfiano_il_denominatore_dell_autonomia(self, siope):
        # Il motivo per cui il titolo 0 e' escluso: 2,5% di incassi non
        # attribuiti schiaccerebbero entrate proprie / entrate totali
        con = siope.totali_comune({"1": 80, "3": 20, "0": 50}, {})
        senza = siope.totali_comune({"1": 80, "3": 20}, {})
        assert con == senza
        assert con["proprie"] / con["incassi"] == pytest.approx(1.0)
