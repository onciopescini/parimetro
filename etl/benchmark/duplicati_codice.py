"""Cerca, nei CSV SIOPE scaricati, codici ISTAT condivisi da più enti comunali (stessa coppia provincia+comune, nomi diversi).
Uso: python duplicati_codice.py FILE.csv [FILE.csv ...]"""
import csv
import sys
from collections import defaultdict

for percorso in sys.argv[1:]:
    nomi = defaultdict(set)
    with open(percorso, encoding="latin-1", newline="") as f:
        rd = csv.DictReader(f, delimiter=";")
        for r in rd:
            if r["Codice Tipologia Ente BDAP"].strip() == "CO":
                nomi[r["Codice istat provincia"].zfill(3) + r["Codice istat comune"].zfill(3)].add(r["Descrizione Ente BDAP"].strip())
    for k, v in sorted(nomi.items()):
        if len(v) > 1:
            print(percorso.split("/")[-1].split("\\")[-1], k, sorted(v))
