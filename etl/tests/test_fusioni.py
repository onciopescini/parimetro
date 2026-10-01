"""Comuni nati da fusioni: la serie storica si ricostruisce a confini attuali."""
import pytest

import fusioni as f


class TestRimappa:
    def test_un_predecessore_va_sul_comune_nuovo(self):
        assert f.rimappa("013199") == "013256"  # Ronago -> Uggiate con Ronago
        assert f.rimappa("013228") == "013256"

    def test_un_comune_qualunque_resta_com_e(self):
        assert f.rimappa("058091") == "058091"

    def test_il_nuovo_codice_resta_se_stesso(self):
        assert f.rimappa("013256") == "013256"

    def test_nessun_codice_e_insieme_vecchio_e_nuovo(self):
        # Altrimenti due fusioni si concatenerebbero e la somma dipenderebbe dall'ordine
        vecchi = {v for vs, _ in f.FUSIONI.values() for v in vs}
        assert vecchi.isdisjoint(f.FUSIONI)

    def test_un_vecchio_codice_ha_un_solo_successore(self):
        tutti = [v for vs, _ in f.FUSIONI.values() for v in vs]
        assert len(tutti) == len(set(tutti))


class TestFondi:
    def test_somma_i_predecessori(self):
        out = f.fondi({"013199": {"1": 10.0, "6": 1.0}, "013228": {"1": 30.0}})
        assert dict(out["013256"]) == {"1": 40.0, "6": 1.0}
        assert "013199" not in out

    def test_somma_anche_con_il_comune_che_ha_tenuto_il_codice(self):
        # Campospinoso (018026) + Albaredo Arnaboldi (018002): stesso anno, due righe
        out = f.fondi({"018026": {"1": 700.0}, "018002": {"1": 400.0}})
        assert dict(out["018026"]) == {"1": 1100.0}

    def test_gli_altri_comuni_passano_invariati(self):
        out = f.fondi({"058091": {"1": 5.0}})
        assert dict(out["058091"]) == {"1": 5.0}

    def test_non_modifica_l_input(self):
        dati = {"013199": {"1": 10.0}}
        f.fondi(dati)
        assert dati == {"013199": {"1": 10.0}}

    def test_funziona_anche_sulle_voci_di_spesa(self):
        out = f.fondi({"028022": {"U1030215004": 5.0}, "028098": {"U1030215004": 7.0, "U1010101002": 1.0}})
        assert dict(out["028108"]) == {"U1030215004": 12.0, "U1010101002": 1.0}


class TestPopolazione:
    def test_non_e_un_comune_fuso(self):
        assert f.popolazione_fusa("058091", 2024, {"058091": 5}) is None

    def test_prima_di_pop_dal_si_sommano_le_parti(self):
        pop = {"005079": 186, "005110": 213}
        assert f.popolazione_fusa("005122", 2021, pop) == 399

    def test_dopo_pop_dal_vale_il_comune_fuso(self):
        pop = {"005122": 399, "005079": 186}  # i vecchi, se restano nel file, non si contano
        assert f.popolazione_fusa("005122", 2024, pop) == 399

    def test_campospinoso_prima_dell_assorbimento_somma_albaredo(self):
        pop = {"018026": 1074, "018002": 236}
        assert f.popolazione_fusa("018026", 2021, pop) == 1310
        assert f.popolazione_fusa("018026", 2024, {"018026": 1349, "018002": 234}) == 1349

    def test_comune_non_ancora_in_posas_vale_la_somma_sempre(self):
        pop = {"013199": 1653, "013228": 5190}
        assert f.popolazione_fusa("013256", 2024, pop) == 6843

    def test_senza_dati_di_popolazione_e_none(self):
        assert f.popolazione_fusa("013256", 2024, {}) is None


def test_ogni_comune_fuso_esiste_nell_anagrafica_istat():
    # Se un domani ISTAT rinomina un codice, la tabella non deve restare appesa a vuoto
    import os
    import psycopg
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("serve TEST_DATABASE_URL")
    with psycopg.connect(url) as c:
        noti = {r[0] for r in c.execute("select istat_code from municipalities")}
    assert set(f.FUSIONI) <= noti
    # e i vecchi codici NON ci sono piu': sono sciolti
    assert not ({v for vs, _ in f.FUSIONI.values() for v in vs} & noti)
