#!/usr/bin/env python3
# ============================================================
# ETL 03 · Rendiconti OpenBDAP → budget_records
#
# Legge i CSV del rendiconto (uno per le ENTRATE con gli
# accertamenti per titolo, uno per le SPESE con impegni e
# pagamenti), aggrega per comune, mappa sulle colonne dello
# schema e fa upsert; a fine import lancia refresh_fhi(), che
# ricalcola il rango nella fascia demografica (non e' piu' un
# trigger di riga: un percentile si calcola sulla coorte).
#
# Approssimazioni v1, dichiarate:
#  - surplus_deficit = accertamenti − impegni (proxy del risultato
#    di competenza; sostituibile in futuro col risultato di
#    amministrazione dal quadro riassuntivo)
#  - debt_total = NULL → l'FHI usa il contributo neutro previsto
#    dallo schema (nessuna penalizzazione per dato mancante)
#  - anticipazioni e partite di giro sono ESCLUSE dai totali
#    (titoli entrate 7/9, titoli spese 5/7): gonfierebbero i numeri
#
# Uso:
#   python 03_import_bdap.py --entrate entrate_2023.csv --spese spese_2023.csv --year 2023
#   python 03_import_bdap.py --inspect entrate_2023.csv
# ============================================================
import argparse
import os
import sys
from collections import defaultdict

import pandas as pd
import psycopg
from dotenv import load_dotenv

from config import (
    BDAP_ENTRATE,
    BDAP_SPESE,
    TITOLI_CAPITALE,
    TITOLI_CORRENTI,
    TITOLI_ENTRATE_ESCLUSE,
    TITOLI_PROPRIE,
    TITOLI_SPESE_ESCLUSE,
    inspect_csv,
)

CHUNK = 200_000  # righe per blocco: i CSV BDAP sono grandi


def norm_code(v: str) -> str:
    """Normalizza il codice ISTAT: '1234.0' / '1234' → '001234'."""
    return str(v).strip().split(".")[0].zfill(6)


def to_num(s: pd.Series, cfg: dict) -> pd.Series:
    """Importi come numeri, gestendo la virgola decimale italiana."""
    s = s.astype(str).str.strip()
    if cfg.get("decimal") == ",":
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def check_cols(path: str, cfg: dict, needed: list[str]) -> None:
    head = pd.read_csv(path, sep=cfg["sep"], encoding=cfg["encoding"], nrows=0)
    missing = [c for c in needed if c not in head.columns]
    if missing:
        sys.exit(
            f"{os.path.basename(path)}: colonne non trovate {missing}\n"
            "Lancia --inspect sul file e correggi la mappatura in config.py."
        )


def aggrega_entrate(path: str) -> dict:
    c = BDAP_ENTRATE
    need = [c["col_istat"], c["col_titolo"], c["col_accertamenti"]]
    check_cols(path, c, need)

    acc: dict = defaultdict(lambda: {"tot": 0.0, "corr": 0.0, "cap": 0.0, "proprie": 0.0})
    for ch in pd.read_csv(path, sep=c["sep"], encoding=c["encoding"],
                          dtype=str, usecols=need, chunksize=CHUNK):
        ch["ist"] = ch[c["col_istat"]].map(norm_code)
        # estrae la cifra del titolo ("1", "Titolo 4 - ...", "3.0" → "1","4","3")
        ch["tit"] = ch[c["col_titolo"]].astype(str).str.extract(r"(\d)", expand=False)
        ch["val"] = to_num(ch[c["col_accertamenti"]], c)

        for (ist, tit), v in ch.groupby(["ist", "tit"])["val"].sum().items():
            if not isinstance(tit, str):
                continue
            d = acc[ist]
            if tit not in TITOLI_ENTRATE_ESCLUSE:
                d["tot"] += v
            if tit in TITOLI_CORRENTI:
                d["corr"] += v
            if tit in TITOLI_CAPITALE:
                d["cap"] += v
            if tit in TITOLI_PROPRIE:
                d["proprie"] += v
    return acc


def aggrega_spese(path: str) -> dict:
    c = BDAP_SPESE
    has_tit = bool(c.get("col_titolo"))
    need = [c["col_istat"], c["col_impegni"], c["col_pagamenti"]]
    if has_tit:
        need.append(c["col_titolo"])
    check_cols(path, c, need)

    out: dict = defaultdict(lambda: {"imp": 0.0, "pag": 0.0})
    for ch in pd.read_csv(path, sep=c["sep"], encoding=c["encoding"],
                          dtype=str, usecols=need, chunksize=CHUNK):
        ch["ist"] = ch[c["col_istat"]].map(norm_code)
        if has_tit:
            ch["tit"] = ch[c["col_titolo"]].astype(str).str.extract(r"(\d)", expand=False)
            ch = ch[~ch["tit"].isin(TITOLI_SPESE_ESCLUSE)]
        ch["imp"] = to_num(ch[c["col_impegni"]], c)
        ch["pag"] = to_num(ch[c["col_pagamenti"]], c)

        g = ch.groupby("ist")[["imp", "pag"]].sum()
        for ist, row in g.iterrows():
            out[ist]["imp"] += float(row["imp"])
            out[ist]["pag"] += float(row["pag"])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Import rendiconti OpenBDAP")
    ap.add_argument("--entrate", help="CSV rendiconto entrate (accertamenti per titolo)")
    ap.add_argument("--spese", help="CSV rendiconto spese (impegni e pagamenti)")
    ap.add_argument("--year", type=int, help="Esercizio finanziario dei file")
    ap.add_argument("--inspect", metavar="CSV", help="Stampa header e prime righe di un CSV")
    a = ap.parse_args()

    if a.inspect:
        inspect_csv(a.inspect)
        return
    if not (a.entrate and a.spese and a.year):
        ap.error("servono --entrate, --spese e --year (oppure --inspect FILE)")

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    print("→ aggrego le entrate…")
    entrate = aggrega_entrate(a.entrate)
    print(f"  {len(entrate)} enti trovati")
    print("→ aggrego le spese…")
    spese = aggrega_spese(a.spese)
    print(f"  {len(spese)} enti trovati")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select istat_code, id, population from municipalities")
        muni = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

        pop_y: dict = {}
        cur.execute("select to_regclass('population_years')")
        if cur.fetchone()[0]:
            cur.execute(
                "select istat_code, population from population_years where year = %s",
                (a.year,),
            )
            pop_y = dict(cur.fetchall())
        else:
            print("⚠ population_years non esiste: prima o poi lancia lo script 02.")

        rows, unmatched, no_pop = [], [], 0
        for ist, e in entrate.items():
            if ist not in muni:
                unmatched.append(ist)
                continue
            mid, pop_fallback = muni[ist]
            s = spese.get(ist, {"imp": 0.0, "pag": 0.0})
            pop = pop_y.get(ist) or pop_fallback or 0
            if not pop:
                no_pop += 1
            rows.append((
                mid, a.year, pop,
                round(e["tot"], 2),                 # revenue_total
                round(s["imp"], 2),                 # expenditure_total
                round(e["corr"], 2),                # revenue_current
                round(e["cap"], 2),                 # revenue_capital
                round(e["proprie"], 2),             # own_revenue
                None,                               # debt_total → FHI neutro
                round(e["tot"] - s["imp"], 2),      # surplus_deficit (proxy)
                round(s["pag"], 2),                 # payments_made
                round(s["imp"], 2),                 # commitments
            ))

        cur.executemany(
            """
            insert into budget_records
                (municipality_id, year, population, revenue_total, expenditure_total,
                 revenue_current, revenue_capital, own_revenue, debt_total,
                 surplus_deficit, payments_made, commitments)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            on conflict on constraint unique_muni_year do update set
                population        = excluded.population,
                revenue_total     = excluded.revenue_total,
                expenditure_total = excluded.expenditure_total,
                revenue_current   = excluded.revenue_current,
                revenue_capital   = excluded.revenue_capital,
                own_revenue       = excluded.own_revenue,
                surplus_deficit   = excluded.surplus_deficit,
                payments_made     = excluded.payments_made,
                commitments       = excluded.commitments
            """,
            rows,
        )
        conn.commit()

        # Come nello script 04: l'indice è il percentile nella fascia
        # demografica, si calcola per coorte dopo aver caricato tutte le righe.
        cur.execute("select refresh_fhi(%s)", (a.year,))
        print(f"→ indice ricalcolato su {cur.fetchone()[0]} righe")
        conn.commit()

    print(f"✔ {len(rows)} comuni caricati per l'esercizio {a.year}.")
    if unmatched:
        print(f"⚠ {len(unmatched)} codici non abbinati a municipalities. Primi 10: {unmatched[:10]}")
        print("  (di solito sono unioni/soppressioni di comuni o enti non comunali)")
    if no_pop:
        print(f"⚠ {no_pop} comuni senza popolazione per il {a.year}: i pro capite restano null "
              f"finché non importi la popolazione di quell'anno con lo script 02.")


if __name__ == "__main__":
    main()
