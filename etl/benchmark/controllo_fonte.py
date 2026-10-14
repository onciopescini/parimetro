"""Controllo a campione contro la fonte: SIOPE (BDAP) riscaricato da zero per alcune regioni e confrontato con i file pubblicati.

Non usa il codice di importazione: rilegge il CSV grezzo (importi cumulati, riga di dicembre) e somma per comune.
Uso: python controllo_fonte.py ANNO REGIONE [REGIONE ...]
"""
import csv
import io
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from scarica_siope import risorse, scarica  # noqa: E402

ANNO = int(sys.argv[1])
REGIONI = sys.argv[2:]
TMP = os.environ.get("TMP_SIOPE", os.path.join(os.path.dirname(__file__), "_siope_tmp"))
DATI = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")
os.makedirs(TMP, exist_ok=True)

indice = {c["istat"]: c for c in json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))}


def somma_dicembre(percorso: str) -> dict[str, float]:
    """Totale annuale per comune: somma, sulle righe di dicembre, degli importi cumulati dei soli comuni (CO)."""
    tot: dict[str, float] = defaultdict(float)
    with open(percorso, encoding="latin-1", newline="") as f:
        rd = csv.DictReader(f, delimiter=";")
        cols = rd.fieldnames or []
        c_prov = next(c for c in cols if "istat provincia" in c.lower())
        c_com = next(c for c in cols if "istat comune" in c.lower())
        c_imp = next(c for c in cols if c.lower().startswith("importo cumulato"))
        c_tipo = next(c for c in cols if "tipologia ente" in c.lower())
        c_mese = next(c for c in cols if "anno/mese" in c.lower())
        c_desc = next(c for c in cols if "descrizione titolo" in c.lower())
        # Fuori dal totale (come dichiarato nel metodo): anticipazioni di tesoreria, partite di giro e conto terzi, sospesi da regolarizzare
        FUORI = ("anticipazion", "conto terzi", "partite di giro", "regolarizzare")
        righe = [r for r in rd if r[c_tipo].strip() == "CO" and not any(k in r[c_desc].lower() for k in FUORI)]
        ultimo: dict[str, str] = {}
        for r in righe:
            k = r[c_prov].strip().zfill(3) + r[c_com].strip().zfill(3)
            ultimo[k] = max(ultimo.get(k, ""), r[c_mese])
        for r in righe:
            k = r[c_prov].strip().zfill(3) + r[c_com].strip().zfill(3)
            if r[c_mese] == ultimo[k]:
                tot[k] += float(r[c_imp].replace(",", "."))
    return tot


pubblicati = {}
for tipo, regione, url in risorse(ANNO):
    if regione not in REGIONI:
        continue
    dest = os.path.join(TMP, f"{ANNO}_{tipo}_{regione}.csv")
    if not os.path.exists(dest):
        print("scarico", tipo, regione, "...", flush=True)
        scarica(url, dest)
    tot = somma_dicembre(dest)
    for istat, valore in tot.items():
        if istat not in indice:
            continue
        if istat not in pubblicati:
            try:
                j = json.load(open(os.path.join(DATI, "comune", f"{istat}.json"), encoding="utf-8"))
                pubblicati[istat] = next((h for h in j["history"] if h["year"] == ANNO), None)
            except FileNotFoundError:
                pubblicati[istat] = None
        h = pubblicati[istat]
        if not h:
            continue
        chiave = "revenue_total" if tipo == "entrate" else "expenditure_total"
        pub = h.get(chiave)
        if pub is None:
            continue
        rapporto = pub / valore if valore else None
        yield_riga = (istat, indice[istat]["name"], tipo, round(valore), round(pub), rapporto)
        print("RIGA", json.dumps(yield_riga))
