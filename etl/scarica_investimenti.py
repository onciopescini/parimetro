#!/usr/bin/env python3
# Scarica le tre fonti degli investimenti pubblici:
#
#   1. OpenCoesione: progetti_esteso.zip, ~255 MB (CSV da 4,3 GB una volta scompattato; non serve
#      scompattarlo, 08_import_coesione.py lo legge dallo zip). CC BY 4.0.
#   2. Italia Domani: PNRR_Progetti.csv, ~300 MB, tutte le missioni. CC BY 4.0.
#   3. IPA (Indice PA, AgID): enti.xlsx, ~4 MB. CC BY 4.0. Serve solo a collegare il codice fiscale di un
#      soggetto attuatore al suo comune; non finisce nei dati pubblicati.
#
#   python scarica_investimenti.py --dest ../../etl-data
#
# I file si scaricano su .part e si rinominano a fine download: uno interrotto non sembra completo.
import argparse
import os
import sys
import urllib.request

FONTI = {
    "oc/progetti_esteso.zip": "https://opencoesione.gov.it/it/opendata/progetti_esteso.zip",
    "pnrr/PNRR_Progetti.csv": "https://www.italiadomani.gov.it/content/dam/sogei-ng/opendata/PNRR_Progetti.csv",
    "pnrr/ipa_enti.xlsx": "https://indicepa.gov.it/ipa-dati/dataset/enti/resource/d09adf99-dc10-4349-8c53-27b1e5aa97b6/download/enti.xlsx",
}


def scarica(url: str, dest: str) -> int:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (parimetro-etl)"})
    with urllib.request.urlopen(req, timeout=900) as r, open(dest + ".part", "wb") as f:
        while blocco := r.read(1 << 20):
            f.write(blocco)
    os.replace(dest + ".part", dest)
    return os.path.getsize(dest)


def main() -> None:
    ap = argparse.ArgumentParser(description="Scarica le fonti degli investimenti pubblici")
    ap.add_argument("--dest", required=True, help="Cartella di destinazione (crea oc/ e pnrr/)")
    ap.add_argument("--ancora", action="store_true", help="Riscarica anche i file gia' presenti")
    a = ap.parse_args()
    ok = True
    for rel, url in FONTI.items():
        dest = os.path.join(a.dest, rel)
        if os.path.exists(dest) and os.path.getsize(dest) > 0 and not a.ancora:
            print(f"  {rel}: gia' presente ({os.path.getsize(dest) // 1024 // 1024} MB)")
            continue
        try:
            print(f"  {rel}: {scarica(url, dest) // 1024 // 1024} MB")
        except Exception as e:  # noqa: BLE001 - si segnala e si prosegue con il file dopo
            ok = False
            print(f"  {rel}: FALLITO ({type(e).__name__}: {e})", file=sys.stderr)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
