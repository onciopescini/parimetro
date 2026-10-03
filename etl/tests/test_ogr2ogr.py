"""Come lo script chiama ogr2ogr, su Windows con la WSL."""
import pytest


class TestPercorsoWsl:
    def test_converte_il_disco(self, confini):
        assert confini.percorso_wsl(r"C:\dev\x\a.shp") == "/mnt/c/dev/x/a.shp"

    def test_la_lettera_del_disco_diventa_minuscola(self, confini):
        assert confini.percorso_wsl(r"D:\dati\a.shp").startswith("/mnt/d/")

    def test_accetta_anche_gli_slash(self, confini):
        assert confini.percorso_wsl("C:/dev/x/a.shp") == "/mnt/c/dev/x/a.shp"

    def test_non_tocca_un_percorso_gia_posix(self, confini):
        # abspath su Windows lo renderebbe C:\..., ma qui non c'e' una lettera di disco
        assert confini.percorso_wsl("/mnt/c/dev/a.shp") == "/mnt/c/dev/a.shp"


class TestComandoOgr2ogr:
    def test_senza_configurazione_usa_ogr2ogr_del_sistema(self, confini, monkeypatch):
        monkeypatch.delenv("OGR2OGR_BACKEND", raising=False)
        prefisso, shp = confini.comando_ogr2ogr(r"C:\dev\a.shp")
        assert prefisso == ["ogr2ogr"]
        assert shp == r"C:\dev\a.shp"  # percorso intatto

    def test_con_wsl_passa_da_wsl_exe_e_traduce_il_percorso(self, confini, monkeypatch):
        monkeypatch.setenv("OGR2OGR_BACKEND", "wsl")
        monkeypatch.delenv("OGR2OGR_WSL_DISTRO", raising=False)
        prefisso, shp = confini.comando_ogr2ogr(r"C:\dev\a.shp")
        assert prefisso == ["wsl", "-d", "Ubuntu", "--", "ogr2ogr"]
        assert shp == "/mnt/c/dev/a.shp"

    def test_la_distribuzione_si_sceglie_con_una_variabile(self, confini, monkeypatch):
        monkeypatch.setenv("OGR2OGR_BACKEND", "WSL")  # maiuscole indifferenti
        monkeypatch.setenv("OGR2OGR_WSL_DISTRO", "Debian")
        assert confini.comando_ogr2ogr(r"C:\a.shp")[0][:3] == ["wsl", "-d", "Debian"]

    def test_non_usa_mai_un_launcher_non_firmato(self, confini, monkeypatch):
        # Il motivo del backend wsl: un .exe generato da pip puo' essere bloccato
        # da un criterio di controllo delle applicazioni (WinError 4551)
        monkeypatch.setenv("OGR2OGR_BACKEND", "wsl")
        prefisso, _ = confini.comando_ogr2ogr(r"C:\a.shp")
        assert prefisso[0] == "wsl"
