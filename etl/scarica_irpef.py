#!/usr/bin/env python3
# Scarica i CSV IRPEF per comune del MEF (Dipartimento delle Finanze), uno per anno d'imposta.
#
#   python scarica_irpef.py --dest ../../etl-data/irpef --da 2020 --a 2024
#
# I file pesano ~1 MB l'uno. Il portale e' https://www1.finanze.gov.it/finanze/analisi_stat/public/
# (sezione Open Data, "Principali variabili IRPEF su base comunale").
import argparse
import os
import sys
import urllib.request

URL = (
    "https://www1.finanze.gov.it/finanze/analisi_stat/public/v_4_0_0/contenuti/"
    "Redditi_e_principali_variabili_IRPEF_su_base_comunale_CSV_{anno}.zip?d=1615465800"
)


def scarica(anno: int, dest: str) -> str:
    out = os.path.join(dest, f"irpef_{anno}.zip")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    req = urllib.request.Request(URL.format(anno=anno), headers={"User-Agent": "parimetro-etl/1.0"})
    # Su file .part e poi rinomina: un download interrotto non deve sembrare completo
    with urllib.request.urlopen(req, timeout=180) as r, open(out + ".part", "wb") as f:
        f.write(r.read())
    os.replace(out + ".part", out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Scarica l'IRPEF per comune (MEF)")
    ap.add_argument("--dest", required=True)
    ap.add_argument("--da", type=int, default=2020)
    ap.add_argument("--a", type=int, default=2024)
    a = ap.parse_args()
    os.makedirs(a.dest, exist_ok=True)
    for anno in range(a.da, a.a + 1):
        try:
            p = scarica(anno, a.dest)
            print(f"  {anno}: {os.path.getsize(p) // 1024} KB")
        except Exception as e:  # noqa: BLE001 - si segnala e si prosegue con l'anno dopo
            print(f"  {anno}: FALLITO ({type(e).__name__})", file=sys.stderr)


if __name__ == "__main__":
    main()
