"""Appalti: conteggi riletti dai CSV ANAC grezzi, confrontati con i file pubblicati.

Non usa il codice di importazione né l'anagrafica IPA: cerca la stazione appaltante per nome ("COMUNE DI X") e conta da zero
(lotti non cancellati, un CIG una volta sola). Dove un nome è condiviso da più comuni il confronto non è affidabile e va letto a mano.
Uso: python controllo_anac.py ANNO NOME [NOME ...]   (cartella dei file: ANAC_DIR, predefinita ../../../etl-data/anac/cig)
"""
import csv
import glob
import io
import json
import os
import sys
import zipfile

csv.field_size_limit(10**8)
ANNO = int(sys.argv[1])
NOMI = [n.upper() for n in sys.argv[2:]]
DIR = os.environ.get("ANAC_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "etl-data", "anac", "cig"))
DATI = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "dati")
indice = json.load(open(os.path.join(DATI, "indice.json"), encoding="utf-8"))
per_nome: dict[str, list[dict]] = {}
for c in indice:
    per_nome.setdefault(c["name"].upper(), []).append(c)

bersagli = {f"COMUNE DI {n}" for n in NOMI}
visti: dict[str, dict] = {}  # cig -> riga più recente
for f in sorted(glob.glob(os.path.join(DIR, f"cig_csv_{ANNO}_*.zip"))):
    with zipfile.ZipFile(f) as z:
        with io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8", errors="replace", newline="") as t:
            rd = csv.DictReader(t, delimiter=";")
            for r in rd:
                if r["denominazione_amministrazione_appaltante"].strip().upper() not in bersagli:
                    continue
                if r.get("DATA_CANCELLAZIONE", "").strip():
                    continue
                if str(r.get("anno_pubblicazione", "")).split(".")[0] != str(ANNO):
                    continue
                cig = r["cig"].strip()
                perf = r.get("DATA_ULTIMO_PERFEZIONAMENTO", "")
                if cig not in visti or perf >= visti[cig]["_p"]:
                    visti[cig] = {"_p": perf, "nome": r["denominazione_amministrazione_appaltante"].strip().upper(), "proc": r["tipo_scelta_contraente"].upper(), "imp": r.get("importo_lotto", "")}

for nome in NOMI:
    righe = [v for v in visti.values() if v["nome"] == f"COMUNE DI {nome}"]
    n = len(righe)
    adesioni = sum("ADESIONE" in v["proc"] for v in righe)
    diretti = sum("ADESIONE" not in v["proc"] and "IN HOUSE" not in v["proc"] and "AFFIDAMENTO DIRETTO" in v["proc"] for v in righe)
    in_house = sum("IN HOUSE" in v["proc"] and "ADESIONE" not in v["proc"] for v in righe)
    diretti += in_house  # come nel metodo: affidamenti diretti e in house sono contati insieme
    aperte = sum("ADESIONE" not in v["proc"] and "APERTA" in v["proc"] for v in righe)
    cand = per_nome.get(nome, [])
    importo = mediano = None
    if len(cand) != 1:
        print(json.dumps({"nome": nome, "nota": f"nome condiviso o assente ({len(cand)} comuni): confronto non affidabile", "grezzo": [n, diretti, aperte, adesioni]}))
        continue
    j = json.load(open(os.path.join(DATI, "comune", f"{cand[0]['istat']}.json"), encoding="utf-8"))
    a = (j.get("appalti") or {}).get("anni", {}).get(str(ANNO)) or {}
    # Importi: solo lotti "attendibili" (non adesioni, importo > 0, non oltre 10 volte i pagamenti annui; senza bilancio, 50 milioni)
    spesa = next((h["expenditure_total"] for h in j["history"] if h["year"] == ANNO), None)
    tetto = 10 * spesa if spesa else 50_000_000
    valori = []
    for v in righe:
        if "ADESIONE" in v["proc"]:
            continue
        try:
            x = float(v["imp"].replace(",", ".")) if v["imp"].strip() else None
        except ValueError:
            x = None
        if x is not None and 0 < x <= tetto:
            valori.append(x)
    valori.sort()
    importo = round(sum(valori), 2)
    mediano = (valori[len(valori) // 2] if len(valori) % 2 else (valori[len(valori) // 2 - 1] + valori[len(valori) // 2]) / 2) if valori else None
    print(json.dumps({"nome": nome, "istat": cand[0]["istat"], "grezzo": {"n": n, "diretti": diretti, "aperte": aperte, "adesioni": adesioni, "in_house": in_house},
                      "importo": [importo, a.get("importo")], "mediano": [mediano, a.get("importo_mediano")],
                      "pubblicato": {"n": a.get("n"), "diretti": a.get("n_diretti"), "aperte": a.get("n_aperte"), "adesioni": a.get("n_adesioni")}}))
