#!/usr/bin/env python3
# ============================================================
# Applica lo schema: le migrazioni di db/migrations, in ordine.
#
# Serve dove non ci sono ne' Docker ne' psql (selfhost/applica-migrazioni.sh
# fa lo stesso dentro il container). Sono tutte idempotenti (create ... if not
# exists, create or replace): rilanciarlo non rompe nulla.
#
# Uso:
#   python applica_migrazioni.py
#   python applica_migrazioni.py --dir ../db/migrations
# ============================================================
import argparse
import os
import pathlib
import sys

import psycopg
from dotenv import load_dotenv

PREDEFINITA = pathlib.Path(__file__).resolve().parents[1] / "db" / "migrations"


def main() -> None:
    ap = argparse.ArgumentParser(description="Applica le migrazioni SQL in ordine di nome")
    ap.add_argument("--dir", type=pathlib.Path, default=PREDEFINITA)
    a = ap.parse_args()

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")
    file = sorted(a.dir.glob("*.sql"))
    if not file:
        sys.exit(f"Nessuna migrazione in {a.dir}")

    with psycopg.connect(url) as conn:
        for f in file:
            try:
                # Una transazione per file: se uno fallisce non lascia mezzo schema
                with conn.transaction():
                    conn.execute(f.read_text(encoding="utf-8"))
            except Exception as e:
                sys.exit(f"ERRORE in {f.name}: {str(e).splitlines()[0]}")
            print(f"  OK  {f.name}")
    print(f"{len(file)} migrazioni applicate")


if __name__ == "__main__":
    main()
