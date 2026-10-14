"""Reddito IRPEF: contribuenti e reddito imponibile medio riletti dai file MEF grezzi e confrontati con i file pubblicati, per TUTTI i comuni.

Non usa il codice di importazione. Per le fusioni, il MEF dà ai comuni nuovi o vecchi il loro codice dell'anno: i comuni
che non corrispondono a un codice dell'indice vengono solo contati (non sono un errore).
Uso: python controllo_reddito.py [CARTELLA_IRPEF]
"""
import csv
import io
import json
import os
import sys
import zipfile

csv.field_size_limit(10**8)
CART = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "etl-data", "irpef")
DATI = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")
indice = {c["istat"] for c in json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))}


def num(s: str) -> float | None:
    s = (s or "").strip().replace(".", "").replace(",", ".") if "," in (s or "") else (s or "").strip()
    try:
        return float(s)
    except ValueError:
        return None


pub: dict[str, dict] = {}
for i in indice:
    p = os.path.join(DATI, "comune", f"{i}.json")
    if os.path.exists(p):
        pub[i] = json.load(open(p, encoding="utf-8")).get("reddito") or {}

for anno in range(2020, 2025):
    f = os.path.join(CART, f"irpef_{anno}.zip")
    if not os.path.exists(f):
        continue
    with zipfile.ZipFile(f) as z:
        t = io.TextIOWrapper(z.open(z.namelist()[0]), encoding="latin-1", newline="")
        rd = csv.DictReader(t, delimiter=";")
        cols = rd.fieldnames or []
        c_istat = next(c for c in cols if c.lower().startswith("codice istat comune"))
        c_contr = next(c for c in cols if c.lower() == "numero contribuenti")
        c_imp = next(c for c in cols if c.lower() == "reddito imponibile - ammontare in euro")
        uguali = diversi = senza = non_in_indice = 0
        esempi = []
        for r in rd:
            ist = r[c_istat].strip().zfill(6)
            if ist not in indice:
                non_in_indice += 1
                continue
            contr, imp = num(r[c_contr]), num(r[c_imp])
            p = pub.get(ist, {}).get(str(anno))
            if p is None or not contr or imp is None:
                senza += 1
                continue
            medio = imp / contr
            if abs(medio - p["medio"]) <= 1 and abs(contr - p["contribuenti"]) <= 0:
                uguali += 1
            else:
                diversi += 1
                if len(esempi) < 4:
                    esempi.append((ist, round(medio), p["medio"], contr, p["contribuenti"]))
        print(f"{anno}: uguali {uguali}, diversi {diversi}, senza dato pubblicato {senza}, codici non in indice {non_in_indice}")
        for e in esempi:
            print("   ", e)
