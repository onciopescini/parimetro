#!/usr/bin/env python3
r"""Scarica i CSV SIOPE (movimenti cumulati mensili) dal catalogo open data BDAP.

Un file per regione e per tipo (Entrata/Spesa). Gli URL delle risorse sono
dichiarati in http nel catalogo, ma su http la connessione cade: vanno forzati
a https.

Uso:
    python scarica_siope.py --anno 2024 --dest .\siope_2024
    python scarica_siope.py --anno 2024 --dest .\siope_2024 --solo-elenco
"""
import argparse
import os
import sys
import time
import urllib.request

API = "https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/action/package_search"


def catalogo() -> list:
    import json

    url = f"{API}?q=SIOPE&rows=1000"
    with urllib.request.urlopen(url, timeout=180) as r:
        return json.load(r)["result"]["results"]


def risorse(anno: int) -> list[tuple[str, str, str]]:
    """Ritorna (tipo, regione, url) per i dataset dell'anno richiesto."""
    out = []
    for p in catalogo():
        t = p.get("title", "")
        if not t.startswith(f"{anno} -") or "SIOPE Movimenti cumulati" not in t:
            continue
        tipo = "entrate" if t.rstrip().endswith("Entrata") else (
            "spese" if t.rstrip().endswith("Spesa") else None
        )
        if tipo is None:          # "Movimenti mensili delle disponibilità liquide"
            continue
        regione = t.split(" - ")[1].strip()
        for res in p.get("resources", []):
            u = res.get("url", "")
            if "/datastore/dump/" in u and u.lower().endswith(".csv"):
                out.append((tipo, regione, u.replace("http://", "https://", 1)))
                break
    return sorted(out)


def scarica(url: str, dest: str) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "parimetro-etl/1.0"})
    # Su un file .part e poi rinomina: un download interrotto non deve sembrare completo
    with urllib.request.urlopen(req, timeout=1800) as r, open(dest + ".part", "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(dest + ".part", dest)
    return os.path.getsize(dest)


def main() -> None:
    ap = argparse.ArgumentParser(description="Scarica i CSV SIOPE per un esercizio")
    ap.add_argument("--anno", type=int, required=True)
    ap.add_argument("--dest", required=True, help="Cartella di destinazione")
    ap.add_argument("--solo-elenco", action="store_true", help="Elenca senza scaricare")
    a = ap.parse_args()

    lista = risorse(a.anno)
    if not lista:
        sys.exit(f"Nessun dataset SIOPE trovato per il {a.anno}.")
    print(f"{len(lista)} file trovati per il {a.anno}")
    if a.solo_elenco:
        for tipo, reg, _ in lista:
            print(f"  {tipo:8s} {reg}")
        return

    os.makedirs(a.dest, exist_ok=True)
    totale = 0
    for i, (tipo, reg, url) in enumerate(lista, 1):
        nome = f"{tipo}_{reg.replace(' ', '-').replace(chr(39), '')}.csv"
        out = os.path.join(a.dest, nome)
        if os.path.exists(out) and os.path.getsize(out) > 0:
            totale += os.path.getsize(out)
            print(f"[{i:2d}/{len(lista)}] {nome:52s} già presente")
            continue
        for tentativo in (1, 2, 3):
            try:
                n = scarica(url, out)
                totale += n
                print(f"[{i:2d}/{len(lista)}] {nome:52s} {n/1024/1024:8.1f} MB")
                break
            except Exception as e:
                if tentativo == 3:
                    print(f"[{i:2d}/{len(lista)}] {nome:52s} FALLITO: {type(e).__name__}")
                else:
                    time.sleep(5 * tentativo)
    print(f"\nTotale scaricato: {totale/1024/1024:.1f} MB in {a.dest}")


if __name__ == "__main__":
    main()
