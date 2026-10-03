#!/usr/bin/env python3
# ============================================================
# ETL 11 · Aggiudicazioni (ANAC, dataset "aggiudicazioni") -> aggiudicazioni_comuni
#
# Un solo zip (~150 MB, 4,9 milioni di righe) per tutti gli anni. Si tengono le aggiudicazioni dei lotti
# che gia' sono in appalti_comuni (quindi: importare prima i lotti con 09_import_anac.py). Per ogni CIG
# si tiene l'ultima aggiudicazione valida (esito 1 = aggiudicata). I nomi delle imprese non si leggono.
#
# Dati sporchi, verificati: ribasso negativo o oltre 100 (fino a -2.800.000), date con anni impossibili,
# "offerte ammesse" assente per il 13% delle gare. Qui i valori impossibili diventano NULL.
# Licenza dei dati ANAC: CC BY-SA 4.0.
#
# Uso:
#   python scarica_anac.py --dest ../../etl-data/anac/aggiudicazioni --dataset aggiudicazioni
#   python 11_import_aggiudicazioni.py --zip ../../etl-data/anac/aggiudicazioni/aggiudicazioni_csv.zip
# ============================================================
import argparse
import io
import os
import sys
import zipfile

import pandas as pd
import psycopg
from dotenv import load_dotenv

COLONNE_CSV = {"cig", "cod_esito", "numero_offerte_ammesse", "importo_aggiudicazione", "ribasso_aggiudicazione",
               "id_aggiudicazione"}
AGGIUDICATA = "1"
MAX_OFFERTE = 1000


def numero(v):
    """Un numero finito oppure None."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def ribasso(v):
    """Il ribasso e' una percentuale della base di gara: fuori da 0-100 e' un errore di inserimento."""
    x = numero(v)
    return x if x is not None and 0 <= x <= 100 else None


def offerte(v):
    x = numero(v)
    return int(x) if x is not None and 0 <= x <= MAX_OFFERTE and x == int(x) else None


def importo(v):
    x = numero(v)
    return x if x is not None and x >= 0 else None


def ultime_per_cig(df: pd.DataFrame) -> pd.DataFrame:
    """Solo le aggiudicazioni valide, una per CIG: l'ultima (id_aggiudicazione piu' alto)."""
    d = df[df["cod_esito"].astype(str).str.strip() == AGGIUDICATA].copy()
    d["_id"] = pd.to_numeric(d["id_aggiudicazione"], errors="coerce").fillna(-1)
    return d.sort_values("_id").drop_duplicates("cig", keep="last").drop(columns="_id")


def righe_db(df: pd.DataFrame) -> list[tuple]:
    out = []
    for r in ultime_per_cig(df).itertuples(index=False):
        out.append((r.cig, offerte(r.numero_offerte_ammesse), ribasso(r.ribasso_aggiudicazione),
                    importo(r.importo_aggiudicazione)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Importa le aggiudicazioni ANAC dei lotti dei comuni")
    ap.add_argument("--zip", required=True)
    a = ap.parse_args()
    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cigs = {r[0] for r in cur.execute("select cig from appalti_comuni")}
        if not cigs:
            sys.exit("appalti_comuni e' vuota: importa prima i lotti con 09_import_anac.py")
        cur.execute("create temp table staging (like aggiudicazioni_comuni) on commit drop")
        letti = tenuti = 0
        with zipfile.ZipFile(a.zip) as z:
            nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(nome) as f:
                # Il file e' in latin-1 (accenti), non in UTF-8
                for ch in pd.read_csv(io.TextIOWrapper(f, encoding="latin-1"), sep=";", dtype=str, chunksize=500_000,
                                      usecols=lambda c: c.lower() in COLONNE_CSV):
                    ch.columns = [c.lower() for c in ch.columns]
                    letti += len(ch)
                    ch = ch[ch["cig"].isin(cigs)]
                    righe = righe_db(ch)
                    tenuti += len(righe)
                    with cur.copy("copy staging (cig, offerte, ribasso, importo_agg) from stdin") as cp:
                        for r in righe:
                            cp.write_row(r)
                    print(f"  letti {letti:,} · tenuti {tenuti:,}".replace(",", "."), flush=True)
        cur.execute("""
            insert into aggiudicazioni_comuni (cig, offerte, ribasso, importo_agg)
            select distinct on (cig) cig, offerte, ribasso, importo_agg from staging order by cig
            on conflict (cig) do update set offerte = excluded.offerte, ribasso = excluded.ribasso,
                                            importo_agg = excluded.importo_agg""")
        cur.execute("select refresh_concorrenza()")
        conn.commit()
    print(f"OK: {tenuti:,} aggiudicazioni di lotti dei comuni su {letti:,} righe".replace(",", "."))


if __name__ == "__main__":
    main()
