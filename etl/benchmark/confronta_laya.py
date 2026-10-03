#!/usr/bin/env python3
"""Laya contro le parole chiave sulla pertinenza delle notizie (banco di prova a mano, 48 esempi).

Va eseguito con l'ambiente che ha Laya (non fa parte delle dipendenze del progetto):
    laya-venv/Scripts/python.exe etl/benchmark/confronta_laya.py [--soglia 0.5]

Si confronta SOLO la domanda "parla dei conti del comune?". Il controllo "il comune e' nominato" resta
al codice per entrambi i metodi, cosi' il confronto riguarda un'unica cosa.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from notizie import cita_il_comune, pertinente  # noqa: E402
from benchmark.notizie_etichettate import NOTIZIE  # noqa: E402

DOMANDA = {
    "conti": {
        "type": "noul",
        "instructions": (
            "Does this news item report on the finances, taxes, budget, public contracts or public funds of the "
            "municipal administration of the named town? Answer no if it is about an event, a private company, "
            "a different town, crime, culture or politics without money decisions, or if 'bilancio' only means 'summary'."
        ),
    }
}


def metriche(pred, vero):
    tp = sum(p and v for p, v in zip(pred, vero))
    fp = sum(p and not v for p, v in zip(pred, vero))
    fn = sum((not p) and v for p, v in zip(pred, vero))
    tn = sum((not p) and (not v) for p, v in zip(pred, vero))
    prec = tp / (tp + fp) if tp + fp else float("nan")
    rec = tp / (tp + fn) if tp + fn else float("nan")
    return {"accuratezza": (tp + tn) / len(vero), "precisione": prec, "richiamo": rec, "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def stampa(nome, m):
    print(f"{nome:28s} accuratezza {m['accuratezza']:.0%}  precisione {m['precisione']:.0%}  richiamo {m['richiamo']:.0%}"
          f"   (veri+ {m['tp']}, falsi+ {m['fp']}, falsi- {m['fn']}, veri- {m['tn']})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--soglia", type=float, default=0.5)
    ap.add_argument("--modello", default="multilingual")
    a = ap.parse_args()

    from laya import Router  # import tardivo: serve l'ambiente con Laya

    router = Router()
    vero = [bool(n[4]) for n in NOTIZIE]
    nominato = [cita_il_comune(n[2], n[3], n[0], n[1], False) for n in NOTIZIE]
    regole = [pertinente(n[2], n[3]) and c for n, c in zip(NOTIZIE, nominato)]

    t0 = time.time()
    prob = []
    for n in NOTIZIE:
        stato = f"Town: {n[0]}. Title: {n[2]}. Excerpt: {n[3]}"
        r = router.predict(stato, DOMANDA, model=a.modello)
        prob.append(float(r["answers"]["conti"]["noul"]))
    secondi = time.time() - t0

    print(f"{len(NOTIZIE)} notizie, {sum(vero)} pertinenti per l'etichettatore; Laya ({a.modello}) in {secondi:.1f} s\n")
    stampa("parole chiave + nome", metriche(regole, vero))
    stampa(f"Laya (soglia {a.soglia}) + nome", metriche([p >= a.soglia and c for p, c in zip(prob, nominato)], vero))
    stampa("Laya senza il controllo nome", metriche([p >= a.soglia for p in prob], vero))
    print("\nSoglie diverse (Laya + nome):")
    for s in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
        stampa(f"  soglia {s}", metriche([p >= s and c for p, c in zip(prob, nominato)], vero))

    print("\nDove i due metodi non sono d'accordo con l'etichetta:")
    for n, r, p, c in zip(NOTIZIE, regole, prob, nominato):
        lay = p >= a.soglia and c
        if bool(n[4]) != r or bool(n[4]) != lay:
            print(f"  etichetta {n[4]} | regole {int(r)} | Laya {int(lay)} (p={p:.2f}, nome={int(c)}) | {n[0]}: {n[2][:80]}")


if __name__ == "__main__":
    main()
