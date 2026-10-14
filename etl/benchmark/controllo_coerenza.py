"""Controlli di coerenza sui file pubblicati (web/public/dati): numeri che non possono essere veri.

Uso: python controllo_coerenza.py [../../web/public/dati]
Non confronta con le fonti (per quello: controllo a mano a campione): cerca le contraddizioni interne.
"""
import glob
import json
import os
import statistics as st
import sys

DATI = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")

indice = json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))
pop = {c["istat"]: c["population"] for c in indice}
nome = {c["istat"]: c["name"] for c in indice}

problemi: dict[str, list] = {"pc_non_torna": [], "negativi": [], "categorie_oltre_totale": [], "pc_enorme": [], "senza_storico": []}
righe = 0
rapporti = []
for f in sorted(glob.glob(os.path.join(DATI, "comune", "*.json"))):
    istat = os.path.basename(f)[:6]
    j = json.load(open(f, encoding="utf-8"))
    if not j["history"]:
        problemi["senza_storico"].append(istat)
        continue
    for h in j["history"]:
        righe += 1
        if h.get("expenditure_total") and h.get("expenditure_pc") and pop.get(istat):
            r = h["expenditure_total"] / pop[istat] / h["expenditure_pc"]
            rapporti.append(r)
            if abs(r - 1) > 0.15:
                problemi["pc_non_torna"].append((istat, nome.get(istat), h["year"], round(r, 2)))
        if (h.get("expenditure_total") or 0) < 0 or (h.get("revenue_total") or 0) < 0:
            problemi["negativi"].append((istat, nome.get(istat), h["year"]))
        if (h.get("expenditure_pc") or 0) > 60000:
            problemi["pc_enorme"].append((istat, nome.get(istat), h["year"], h["expenditure_pc"]))
    # le aree di spesa non possono sommare molto più della spesa totale dello stesso anno
    cat = j.get("categorie") or {}
    for anno, c in cat.items():
        if not c:
            continue
        h = next((x for x in j["history"] if str(x["year"]) == str(anno)), None)
        tot = (h or {}).get("expenditure_total")
        somma = sum(a.get("importo", 0) or 0 for a in c.get("aree", []))
        if tot and somma > tot * 1.05:
            problemi["categorie_oltre_totale"].append((istat, nome.get(istat), anno, round(somma / tot, 2)))

print(f"anni-comune controllati: {righe}; rapporto mediano totale/popolazione/pro capite: {st.median(rapporti):.3f}")
for k, v in problemi.items():
    print(f"- {k}: {len(v)}")
    for x in v[:8]:
        print("   ", x)
