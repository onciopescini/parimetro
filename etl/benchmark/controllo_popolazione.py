"""Popolazione dell'indice pubblicato contro ISTAT POSAS (1 gennaio 2024), riletta dal file grezzo.
Uso: python controllo_popolazione.py [POSAS_2024_it_Comuni.zip]"""
import csv
import io
import json
import os
import sys
import zipfile
from collections import defaultdict

zip_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "etl-data", "POSAS_2024_it_Comuni.zip")
indice = {c["istat"]: c for c in json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati", "indice.json"), encoding="utf-8"))}

z = zipfile.ZipFile(zip_path)
testo = io.TextIOWrapper(z.open(z.namelist()[0]), encoding="latin-1")
next(testo)  # titolo
tot: dict[str, int] = defaultdict(int)
nomi: dict[str, str] = {}
for r in csv.DictReader(testo, delimiter=";"):
    eta = next(v for k, v in r.items() if k.startswith("Et"))
    if eta.strip() == "999":
        continue
    tot[r["Codice comune"].zfill(6)] += int(r["Totale"])
    nomi[r["Codice comune"].zfill(6)] = r["Comune"]

diversi = [(i, indice[i]["name"], indice[i]["population"], tot[i]) for i in indice if i in tot and indice[i]["population"] != tot[i]]
mancanti = [i for i in indice if i not in tot]
print(f"comuni in indice: {len(indice)}; in ISTAT POSAS 2024: {len(tot)}; uguali: {len(indice) - len(mancanti) - len(diversi)}; diversi: {len(diversi)}; non in POSAS: {len(mancanti)}")
for x in sorted(diversi, key=lambda x: -abs(x[2] - x[3]))[:8]:
    print("  ", x)
print("  non in POSAS:", [(i, indice[i]["name"]) for i in mancanti[:8]])
