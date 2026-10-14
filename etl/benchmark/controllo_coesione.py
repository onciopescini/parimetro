"""Coesione (OpenCoesione): progetti e finanziamento per comune riletti dal CSV grezzo e confrontati con i file pubblicati, per TUTTI i comuni.

Tiene i progetti pubblicati sul portale (OC_FLAG_VISUALIZZAZIONE = 0) localizzati su UN solo comune (COD_COMUNE di 9 cifre, senza ':::');
il codice ISTAT è formato dalle ultime 6 cifre. Confronta numero di progetti e OC_FINANZ_TOT_PUB_NETTO con opere + altri nei file pubblicati.
Non usa il codice di importazione. Uso: python controllo_coesione.py [progetti_esteso.zip]
"""
import csv
import io
import json
import os
import sys
import zipfile
from collections import defaultdict

csv.field_size_limit(10**8)
ZIP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "etl-data", "oc", "progetti_esteso.zip")
DATI = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")
indice = {c["istat"] for c in json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))}


def euro(s: str) -> float:
    s = (s or "").strip()
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return 0.0


n: dict[str, int] = defaultdict(int)
fin: dict[str, float] = defaultdict(float)
visti: set[str] = set()
with zipfile.ZipFile(ZIP) as z:
    with io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8-sig", errors="replace", newline="") as t:
        for r in csv.DictReader(t, delimiter=";"):
            if r["OC_FLAG_VISUALIZZAZIONE"].strip() not in ("0", "0.0"):
                continue
            cod = r["COD_COMUNE"].strip()
            if len(cod) != 9 or not cod.isdigit():
                continue
            chiave = r["COD_LOCALE_PROGETTO"].strip()
            if chiave in visti:
                continue
            visti.add(chiave)
            ist = cod[-6:]
            n[ist] += 1
            fin[ist] += euro(r["OC_FINANZ_TOT_PUB_NETTO"])

uguali = diversi = 0
esempi = []
tot_raw = tot_pub = 0.0
for ist in sorted(indice):
    p = os.path.join(DATI, "comune", f"{ist}.json")
    inv = (json.load(open(p, encoding="utf-8")).get("investimenti") or {}).get("coesione") or {}
    pn = (inv.get("opere") or {}).get("n", 0) + sum(v.get("n", 0) for v in (inv.get("altri") or {}).values())
    pf = (inv.get("opere") or {}).get("fin", 0) + sum(v.get("fin", 0) for v in (inv.get("altri") or {}).values())
    tot_raw += fin.get(ist, 0.0)
    tot_pub += pf
    if n.get(ist, 0) == pn and abs(fin.get(ist, 0.0) - pf) <= 1:
        uguali += 1
    else:
        diversi += 1
        if len(esempi) < 8:
            esempi.append((ist, n.get(ist, 0), pn, round(fin.get(ist, 0.0)), round(pf)))
print(f"comuni uguali {uguali}, diversi {diversi}; finanziamento totale grezzo {tot_raw / 1e9:.2f} mld, pubblicato {tot_pub / 1e9:.2f} mld")
for e in esempi:
    print("   ", e, "(istat, n grezzo, n pubblicato, fin grezzo, fin pubblicato)")
