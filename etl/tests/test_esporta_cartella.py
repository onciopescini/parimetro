"""L'export scrive a parte e sostituisce la cartella dei dati solo alla fine."""
import os


def _scrivi(cartella, nomi):
    os.makedirs(cartella, exist_ok=True)
    for n in nomi:
        p = os.path.join(cartella, n)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(n)


def test_la_cartella_nuova_prende_il_posto_della_vecchia(esportatore, tmp_path):
    dest = tmp_path / "public" / "dati"
    nuova = tmp_path / ".dati-in-corso"
    _scrivi(dest, ["vecchio.json", "comune/soppresso.json"])
    _scrivi(nuova, ["anni.json", "comune/015146.json"])

    esportatore.sostituisci_cartella(str(nuova), str(dest))

    assert sorted(os.listdir(dest)) == ["anni.json", "comune"]
    assert os.listdir(dest / "comune") == ["015146.json"]  # nessun file vecchio sopravvive
    assert not nuova.exists()
    assert not (tmp_path / ".dati-in-corso-vecchia").exists()


def test_funziona_anche_la_prima_volta(esportatore, tmp_path):
    dest = tmp_path / "public" / "dati"
    os.makedirs(dest.parent)
    nuova = tmp_path / ".dati-in-corso"
    _scrivi(nuova, ["anni.json"])
    esportatore.sostituisci_cartella(str(nuova), str(dest))
    assert os.listdir(dest) == ["anni.json"]


def test_conta_tutti_i_file_anche_nelle_sottocartelle(esportatore, tmp_path):
    _scrivi(tmp_path / "d", ["a.json", "b.json", "comune/c.json", "classifiche/x/y.json"])
    assert esportatore.conta_file(str(tmp_path / "d")) == 4


def test_il_tetto_lascia_spazio_al_resto_del_sito(esportatore):
    # 20.000 e' il limite di Cloudflare Pages per deploy; pagine, JS e font sono circa 450 file
    assert esportatore.MAX_FILE_DATI <= 20_000 - 500
