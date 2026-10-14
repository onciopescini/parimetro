"""PNRR: progetti e finanziamento PNRR per comune riletti dai CSV Italia Domani e confrontati con i file pubblicati.

Cerca il soggetto attuatore per nome ("COMUNE DI X"), senza usare l'anagrafica IPA né il codice di importazione, e conta
CUP distinti e somma "Finanziamento PNRR". Dove il nome è condiviso da più comuni il confronto non è affidabile.
Uso: python controllo_pnrr.py NOME [NOME ...]   (cartella: PNRR_DIR, predefinita ../../../etl-data/pnrr)
"""
import csv
import glob
import json
import os
import sys

csv.field_size_limit(10**8)
NOMI = [n.upper() for n in sys.argv[1:]]
DIR = os.environ.get("PNRR_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "etl-data", "pnrr"))
DATI = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")
indice = json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))
per_nome: dict[str, list[dict]] = {}
for c in indice:
    per_nome.setdefault(c["name"].upper(), []).append(c)


def euro(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return 0.0


ALIAS = {"ROMA": "ROMA CAPITALE"}  # il soggetto attuatore non sempre si chiama "COMUNE DI X"
soggetto = lambda n: ALIAS.get(n, f"COMUNE DI {n}")
bersagli = {soggetto(n) for n in NOMI}
progetti: dict[str, dict[str, float]] = {n: {} for n in bersagli}
for f in sorted(glob.glob(os.path.join(DIR, "PNRR_Progetti*.csv"))):
    with open(f, encoding="utf-8-sig", errors="replace", newline="") as t:
        rd = csv.DictReader(t, delimiter=";")
        for r in rd:
            att = r["Soggetto Attuatore"].strip().upper()
            if att in bersagli:
                cup = r["CUP"].strip()
                # un CUP può comparire in più file/misure: si tiene il finanziamento maggiore
                progetti[att][cup] = max(progetti[att].get(cup, 0.0), euro(r["Finanziamento PNRR"]))

for nome in NOMI:
    p = progetti[soggetto(nome)]
    cand = per_nome.get(nome, [])
    if len(cand) != 1:
        print(json.dumps({"nome": nome, "nota": f"nome condiviso o assente ({len(cand)} comuni)", "grezzo": [len(p), round(sum(p.values()))]}))
        continue
    j = json.load(open(os.path.join(DATI, "comune", f"{cand[0]['istat']}.json"), encoding="utf-8"))
    pn = ((j.get("investimenti") or {}).get("pnrr")) or {}
    print(json.dumps({"nome": nome, "istat": cand[0]["istat"], "grezzo": {"n": len(p), "fin": round(sum(p.values()), 2)},
                      "pubblicato": {"n": pn.get("n"), "fin": pn.get("fin_pnrr")}}))
