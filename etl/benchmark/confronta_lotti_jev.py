#!/usr/bin/env python3
"""Jev (TypeSafe) sui lotti ANAC: a quale area di spesa appartiene? Stesso banco di prova di confronta_lotti.py.

    python etl/benchmark/confronta_lotti_jev.py --file lotti_test.json     # il campione mai visto: qui vale il confronto
    python etl/benchmark/confronta_lotti_jev.py --file lotti_etichettati.json

La chiave sta in JEV_API_KEY nel .env. Le risposte si salvano in una cache (non si spende due volte per lo stesso lotto).
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from baseline_lotti import area_da_cpv, area_da_parole  # noqa: E402
from confronta_lotti import CRITERI, QUI, metriche, stampa  # noqa: E402
import jev  # noqa: E402

CACHE = os.path.join(os.environ.get("TEMP", os.environ.get("TMPDIR", "/tmp")), "jev_lotti_cache.json")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="lotti_test.json")
    ap.add_argument("--modello", default="jev-latest")
    a = ap.parse_args()

    lotti = json.load(open(os.path.join(QUI, a.file), encoding="utf-8"))
    vero = [x["area"] for x in lotti]
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    domanda = {"area": {"type": "choice",
                        "instructions": "Which area of the municipal budget does this public procurement lot belong to?",
                        "criteria": CRITERI}}
    t0, fatti = time.time(), 0
    for x in lotti:
        k = f"{a.modello}|{x['cig']}"
        if k in cache:
            continue
        stato = (f"Public procurement lot of an Italian municipality. Type: {x['tipo']}. "
                 f"Object: {x['oggetto']}. CPV category: {x['cpv_descr']}")
        cache[k] = jev.chiedi(stato, domanda, a.modello)["area"]
        fatti += 1
        if fatti % 25 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  {fatti} richieste, {(time.time() - t0) / fatti:.2f} s l'una", flush=True)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    risposte = [cache[f"{a.modello}|{x['cig']}"] for x in lotti]
    scelte = [r["choice"] for r in risposte]
    conf = [float(r.get("confidence", 1.0)) for r in risposte]
    print(f"{len(lotti)} lotti ({a.file}), {fatti} richieste nuove\n")
    stampa("CPV", metriche([area_da_cpv(x["cpv"]) for x in lotti], vero))
    parole = [area_da_parole(x["oggetto"], x["cpv_descr"]) for x in lotti]
    stampa("parole chiave", metriche(parole, vero))
    for s in (0.0, 0.3, 0.5, 0.7):
        stampa(f"Jev (confidenza >= {s})", metriche([c if cf >= s else "altro" for c, cf in zip(scelte, conf)], vero))
    # Insieme: dove le parole chiave tacciono ("altro") risponde Jev
    mix = [p if p != "altro" else c for p, c in zip(parole, scelte)]
    stampa("parole chiave, poi Jev", metriche(mix, vero))
    mix2 = [p if p != "altro" else (c if cf >= 0.5 else "altro") for p, c, cf in zip(parole, scelte, conf)]
    stampa("parole chiave, poi Jev (>=0.5)", metriche(mix2, vero))

    print("\nSbagli di Jev (primi 15):")
    n = 0
    for x, c, cf in zip(lotti, scelte, conf):
        if c != x["area"] and n < 15:
            n += 1
            print(f"  vero {x['area']:22s} Jev {c:22s} ({cf:.2f}) | {x['oggetto'][:70]}")


if __name__ == "__main__":
    main()
