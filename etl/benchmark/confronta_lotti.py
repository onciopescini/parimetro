#!/usr/bin/env python3
"""A quale area di spesa appartiene un lotto ANAC? CPV, parole chiave e (se c'e') Laya a confronto.

150 lotti 2023-2025 pescati a caso (seme 0.42) ed etichettati a mano da una sola persona leggendo
l'oggetto e la descrizione del CPV (`lotti_etichettati.json`). Le classi sono sbilanciate: "funzionamento"
e' un quarto, "rifiuti" un solo lotto. Serve a vedere differenze grandi, non a stimare percentuali precise.

Senza Laya (basta Python):
    python etl/benchmark/confronta_lotti.py
Con Laya (nel WSL, dove PyTorch gira; le risposte si salvano in /tmp per non rifare i calcoli):
    ~/laya-venv/bin/python etl/benchmark/confronta_lotti.py --laya
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from baseline_lotti import AREE, area_da_cpv, area_da_parole  # noqa: E402

QUI = os.path.dirname(__file__)
CACHE = os.path.join(os.environ.get("TMPDIR", "/tmp"), "laya_lotti_cache{}.json")

CRITERI = {
    "rifiuti": "waste collection, street cleaning of waste, landfill, waste disposal",
    "strade_trasporti": "roads, sidewalks, street lighting, road signs, parking, public transport, cycle paths",
    "istruzione": "schools, nurseries, school meals, school transport, school buildings",
    "sociale_sanita": "social services, care for minors, elderly or disabled people, health, poverty support",
    "ambiente_territorio": "public green areas, trees, parks, landslides and hydrogeological risk, sewers, water, forestry",
    "cultura_sport_turismo": "culture, museums, libraries, churches as heritage, sports facilities, tourism, events",
    "utenze": "electricity, gas, heating fuel and vehicle fuel supply",
    "funzionamento": "running the administration: IT, software, offices, treasury, insurance, postage, tax collection support, elections",
    "patrimonio": "maintenance of municipal buildings and property, cemeteries, heating and electrical systems of buildings",
    "altro": "none of the above or unclear",
}


def metriche(pred, vero):
    giuste = sum(p == v for p, v in zip(pred, vero))
    per_area = {}
    for a in AREE:
        tp = sum(p == a and v == a for p, v in zip(pred, vero))
        fp = sum(p == a and v != a for p, v in zip(pred, vero))
        fn = sum(p != a and v == a for p, v in zip(pred, vero))
        per_area[a] = (tp, fp, fn)
    f1 = []
    for a, (tp, fp, fn) in per_area.items():
        if tp + fn == 0:
            continue  # area assente tra le etichette: non fa media
        f1.append(2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0)
    sicuri = [(p, v) for p, v in zip(pred, vero) if p != "altro"]
    return {
        "accuratezza": giuste / len(vero),
        "f1_medio": sum(f1) / len(f1),
        "risponde": len(sicuri) / len(vero),
        "esatte_quando_risponde": (sum(p == v for p, v in sicuri) / len(sicuri)) if sicuri else float("nan"),
    }


def stampa(nome, m):
    print(f"{nome:30s} accuratezza {m['accuratezza']:.0%} | F1 medio {m['f1_medio']:.0%} | "
          f"risponde {m['risponde']:.0%} dei lotti, esatto {m['esatte_quando_risponde']:.0%} quando risponde")


def laya_previsioni(lotti, modello, inverti=False):
    from laya import Router  # import tardivo: serve l'ambiente con Laya

    cache_file = CACHE.format("_inverso" if inverti else "")
    cache = json.load(open(cache_file, encoding="utf-8")) if os.path.exists(cache_file) else {}
    criteri = dict(reversed(list(CRITERI.items()))) if inverti else CRITERI
    router = Router()
    domanda = {"area": {"type": "choice",
                        "instructions": "Which area of the municipal budget does this public procurement lot belong to?",
                        "criteria": criteri}}
    t0 = time.time()
    fatti = 0
    for i, lotto in enumerate(lotti):
        if lotto["cig"] in cache:
            continue
        stato = (f"Public procurement lot of an Italian municipality. Type: {lotto['tipo']}. "
                 f"Object: {lotto['oggetto']}. CPV category: {lotto['cpv_descr']}")
        r = router.predict(stato, domanda, model=modello)["answers"]["area"]
        cache[lotto["cig"]] = r
        fatti += 1
        if fatti % 10 == 0:
            json.dump(cache, open(cache_file, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  Laya: {i + 1}/{len(lotti)} lotti, {(time.time() - t0) / fatti:.1f} s a lotto", flush=True)
    json.dump(cache, open(cache_file, "w", encoding="utf-8"), ensure_ascii=False)
    return [cache[lotto["cig"]] for lotto in lotti]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--laya", action="store_true")
    ap.add_argument("--file", default="lotti_etichettati.json",
                    help="lotti_etichettati.json = sviluppo (le parole chiave sono state scritte guardandolo); lotti_test.json = mai visto")
    ap.add_argument("--modello", default="multilingual")
    ap.add_argument("--inverti", action="store_true", help="elenca le opzioni in ordine inverso (prova del bias di posizione)")
    ap.add_argument("--soglia", type=float, default=0.0, help="sotto questa confidenza Laya risponde 'altro'")
    a = ap.parse_args()

    lotti = json.load(open(os.path.join(QUI, a.file), encoding="utf-8"))
    vero = [x["area"] for x in lotti]
    print(f"{len(lotti)} lotti; etichette: {dict(Counter(vero).most_common())}\n")

    stampa("CPV", metriche([area_da_cpv(x["cpv"]) for x in lotti], vero))
    stampa("parole chiave", metriche([area_da_parole(x["oggetto"], x["cpv_descr"]) for x in lotti], vero))
    senza_dubbi = [x for x in lotti if not x["dubbio"]]
    stampa("parole chiave (no dubbi)", metriche([area_da_parole(x["oggetto"], x["cpv_descr"]) for x in senza_dubbi],
                                                [x["area"] for x in senza_dubbi]))

    if a.laya:
        risposte = laya_previsioni(lotti, a.modello, a.inverti)
        scelte = [r["choice"] for r in risposte]
        conf = [float(r.get("confidence", 1.0)) for r in risposte]
        print()
        for s in (0.0, 0.3, 0.5, 0.7):
            pred = [c if cf >= s else "altro" for c, cf in zip(scelte, conf)]
            stampa(f"Laya (confidenza >= {s})", metriche(pred, vero))
        pred = [c if cf >= a.soglia else "altro" for c, cf in zip(scelte, conf)]
        print("\nSbagli di Laya (soglia %.1f):" % a.soglia)
        for x, p, cf in zip(lotti, pred, conf):
            if p != x["area"]:
                print(f"  vero {x['area']:22s} Laya {p:22s} ({cf:.2f}) {x['oggetto'][:70]}")


if __name__ == "__main__":
    main()
