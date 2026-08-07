#!/usr/bin/env python3
# ============================================================
# ETL 02 · Popolazione residente → population_years
#
# Legge il CSV della popolazione per comune (POSAS su demo.istat.it
# o equivalente) e:
#   1. fa upsert in population_years (istat_code, year, population)
#      — è la tabella da cui lo script 03 prende lo snapshot annuale
#   2. aggiorna municipalities.population con l'anno più recente
#
# Uso:
#   python 02_import_population.py POSAS_2023_it_Comuni.csv --year 2023
#   python 02_import_population.py --inspect POSAS_2023_it_Comuni.csv
# ============================================================
import argparse
import os
import sys

import pandas as pd
import psycopg
from dotenv import load_dotenv

from config import POSAS, inspect_csv


def main() -> None:
    ap = argparse.ArgumentParser(description="Import popolazione per comune/anno")
    ap.add_argument("csv", nargs="?", help="CSV popolazione (POSAS o equivalente)")
    ap.add_argument("--year", type=int, help="Anno di riferimento della popolazione")
    ap.add_argument("--inspect", metavar="CSV", help="Stampa header e prime righe di un CSV")
    a = ap.parse_args()

    if a.inspect:
        inspect_csv(a.inspect)
        return
    if not (a.csv and a.year):
        ap.error("servono csv e --year (oppure --inspect FILE)")

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    c = POSAS
    df = pd.read_csv(
        a.csv,
        sep=c["sep"],
        encoding=c["encoding"],
        dtype=str,
        skiprows=c.get("skiprows", 0),
    )
    if c["col_istat"] not in df.columns:
        sys.exit(
            f"Colonna '{c['col_istat']}' assente nel CSV.\n"
            "Lancia --inspect e correggi la mappatura POSAS in config.py."
        )

    # Caso A: il CSV ha già una colonna col totale per comune
    if c.get("col_totale") and c["col_totale"] in df.columns:
        df["pop"] = pd.to_numeric(df[c["col_totale"]], errors="coerce")
    # Caso B (POSAS classico): righe per età → tengo la riga-totale e sommo M+F
    else:
        for col in (c["col_eta"], c["col_maschi"], c["col_femmine"]):
            if col not in df.columns:
                sys.exit(
                    f"Colonna '{col}' assente nel CSV.\n"
                    "Lancia --inspect e correggi la mappatura POSAS in config.py."
                )
        df = df[df[c["col_eta"]].astype(str).str.strip() == str(c["eta_totale"])]
        df["pop"] = (
            pd.to_numeric(df[c["col_maschi"]], errors="coerce").fillna(0)
            + pd.to_numeric(df[c["col_femmine"]], errors="coerce").fillna(0)
        )

    df["istat"] = df[c["col_istat"]].astype(str).str.strip().str.zfill(6)
    df = df.dropna(subset=["pop"])
    agg = df.groupby("istat", as_index=False)["pop"].sum()
    rows = [(i, a.year, int(p)) for i, p in zip(agg["istat"], agg["pop"])]
    if not rows:
        sys.exit("Nessuna riga di popolazione estratta: controlla la mappatura in config.py.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("""
            create table if not exists population_years (
                istat_code varchar(10) not null,
                year       int not null,
                population int not null,
                primary key (istat_code, year)
            )
        """)
        cur.executemany(
            """
            insert into population_years (istat_code, year, population)
            values (%s, %s, %s)
            on conflict (istat_code, year) do update
            set population = excluded.population
            """,
            rows,
        )
        # municipalities.population = ultimo anno disponibile
        cur.execute("""
            update municipalities m
            set population = p.population
            from population_years p
            where p.istat_code = m.istat_code
              and p.year = (select max(year) from population_years)
        """)
        aggiornati = cur.rowcount
        conn.commit()

        cur.execute(
            "select count(*) from population_years where year = %s", (a.year,)
        )
        n = cur.fetchone()[0]

    print(f"✔ {n} comuni con popolazione {a.year} in population_years.")
    print(f"✔ municipalities.population aggiornata per {aggiornati} comuni.")


if __name__ == "__main__":
    main()
