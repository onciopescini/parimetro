#!/usr/bin/env python3
"""Jev (TypeSafe) contro le parole chiave sulla pertinenza delle notizie: stesso banco di prova di confronta_laya.py.

    python etl/benchmark/confronta_jev.py [--soglia 0.5]

La chiave sta in JEV_API_KEY nel .env. Si confronta SOLO la domanda "parla dei conti del comune?"; il controllo
"il comune e' nominato" resta al codice per entrambi i metodi.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from notizie import cita_il_comune, pertinente  # noqa: E402
from benchmark.notizie_etichettate import NOTIZIE  # noqa: E402
from confronta_laya import DOMANDA, metriche, stampa  # noqa: E402
import jev  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--soglia", type=float, default=0.5)
    ap.add_argument("--modello", default="jev-latest")
    a = ap.parse_args()

    vero = [bool(n[4]) for n in NOTIZIE]
    nominato = [cita_il_comune(n[2], n[3], n[0], n[1], False) for n in NOTIZIE]
    regole = [pertinente(n[2], n[3]) and c for n, c in zip(NOTIZIE, nominato)]

    t0 = time.time()
    prob = []
    for n in NOTIZIE:
        r = jev.chiedi(f"Town: {n[0]}. Title: {n[2]}. Excerpt: {n[3]}", DOMANDA, a.modello)
        prob.append(float(r["conti"]["noul"]))
    secondi = time.time() - t0

    print(f"{len(NOTIZIE)} notizie, {sum(vero)} pertinenti per l'etichettatore; Jev ({a.modello}) in {secondi:.1f} s\n")
    stampa("parole chiave + nome", metriche(regole, vero))
    stampa(f"Jev (soglia {a.soglia}) + nome", metriche([p >= a.soglia and c for p, c in zip(prob, nominato)], vero))
    stampa("Jev senza il controllo nome", metriche([p >= a.soglia for p in prob], vero))
    print("\nSoglie diverse (Jev + nome):")
    for s in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        stampa(f"  soglia {s}", metriche([p >= s and c for p, c in zip(prob, nominato)], vero))
    # Insieme: regole E Jev (il modello toglie i falsi positivi delle regole)
    stampa("regole E Jev (soglia)", metriche([r and p >= a.soglia for r, p in zip(regole, prob)], vero))
    stampa("regole O Jev (soglia)+nome", metriche([(r or p >= a.soglia) and c for r, p, c in zip(regole, prob, nominato)], vero))

    print("\nDove non e' d'accordo con l'etichetta:")
    for n, r, p, c in zip(NOTIZIE, regole, prob, nominato):
        j = p >= a.soglia and c
        if bool(n[4]) != r or bool(n[4]) != j:
            print(f"  etichetta {n[4]} | regole {int(r)} | Jev {int(j)} (p={p:.2f}, nome={int(c)}) | {n[0]}: {n[2][:80]}")


if __name__ == "__main__":
    main()
