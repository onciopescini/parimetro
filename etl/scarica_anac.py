#!/usr/bin/env python3
# Scarica i lotti (CIG) degli appalti dal portale open data ANAC: un zip al mese per anno.
#
#   python scarica_anac.py --dest ../../etl-data/anac/cig --da 2020 --a 2024
#
# Pesi: 2020 ~320 MB, 2021 ~370, 2022 ~430, 2023 ~580, 2024 ~980, 2025 ~1,2 GB (solo CSV).
# Il portale rifiuta le richieste senza un User-Agent da browser (risponde 200 con una pagina
# "Request Rejected"): per questo l'intestazione sotto. Licenza dei dati: CC BY-SA 4.0.
# I file si scaricano su .part e si rinominano a fine download.
import argparse
import os
import sys
import time
import urllib.request

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
}
URL = "https://dati.anticorruzione.it/opendata/download/dataset/cig-{anno}/filesystem/cig_csv_{anno}_{mese:02d}.zip"


def scarica(anno: int, mese: int, dest: str, tentativi: int = 4) -> int | None:
    out = os.path.join(dest, f"cig_csv_{anno}_{mese:02d}.zip")
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return os.path.getsize(out)
    for t in range(tentativi):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL.format(anno=anno, mese=mese), headers=UA), timeout=900) as r, \
                    open(out + ".part", "wb") as f:
                while blocco := r.read(1 << 20):
                    f.write(blocco)
            # Una pagina d'errore con status 200 non e' uno zip
            with open(out + ".part", "rb") as f:
                if f.read(2) != b"PK":
                    raise ValueError("la risposta non e' uno zip (richiesta respinta?)")
            os.replace(out + ".part", out)
            return os.path.getsize(out)
        except Exception as e:  # noqa: BLE001 - si riprova, poi si segnala
            print(f"  {anno}-{mese:02d}: {type(e).__name__}, riprovo", file=sys.stderr)
            time.sleep(10 * (t + 1))
    return None


URL_DATASET = "https://dati.anticorruzione.it/opendata/download/dataset/{nome}/filesystem/{nome}_csv.zip"


def scarica_dataset(nome: str, dest: str, tentativi: int = 30) -> int | None:
    """Un dataset intero (es. "aggiudicazioni", ~760 MB), con ripresa se il download si interrompe."""
    out = os.path.join(dest, f"{nome}_csv.zip")
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return os.path.getsize(out)
    part = out + ".part"
    for t in range(tentativi):
        fatti = os.path.getsize(part) if os.path.exists(part) else 0
        intest = dict(UA, **({"Range": f"bytes={fatti}-"} if fatti else {}))
        try:
            with urllib.request.urlopen(urllib.request.Request(URL_DATASET.format(nome=nome), headers=intest), timeout=120) as r:
                if fatti and r.status != 206:  # il server non riprende: si riparte da zero
                    fatti = 0
                with open(part, "ab" if fatti else "wb") as f:
                    while blocco := r.read(1 << 20):
                        f.write(blocco)
            with open(part, "rb") as f:
                if f.read(2) != b"PK":
                    raise ValueError("la risposta non e' uno zip (richiesta respinta?)")
            os.replace(part, out)
            return os.path.getsize(out)
        except Exception as e:  # noqa: BLE001
            print(f"  {nome}: {type(e).__name__} dopo {os.path.getsize(part) // 1024 // 1024 if os.path.exists(part) else 0} MB, riprendo", file=sys.stderr, flush=True)
            time.sleep(min(60, 5 * (t + 1)))
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Scarica i CIG dell'ANAC")
    ap.add_argument("--dest", required=True)
    ap.add_argument("--da", type=int, default=2020)
    ap.add_argument("--a", type=int, default=2024)
    ap.add_argument("--dataset", help="scarica un dataset intero (es. aggiudicazioni) invece dei CIG mensili")
    a = ap.parse_args()
    os.makedirs(a.dest, exist_ok=True)
    if a.dataset:
        n = scarica_dataset(a.dataset, a.dest)
        print(f"  {a.dataset}: {'FALLITO' if n is None else f'{n // 1024 // 1024} MB'}")
        sys.exit(1 if n is None else 0)
    ko = 0
    for anno in range(a.da, a.a + 1):
        for mese in range(1, 13):
            n = scarica(anno, mese, a.dest)
            if n is None:
                ko += 1
                print(f"  {anno}-{mese:02d}: FALLITO", file=sys.stderr)
            else:
                print(f"  {anno}-{mese:02d}: {n // 1024 // 1024} MB", flush=True)
    sys.exit(1 if ko else 0)


if __name__ == "__main__":
    main()
