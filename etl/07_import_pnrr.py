#!/usr/bin/env python3
# ============================================================
# ETL 07 · Progetti PNRR (Italia Domani) -> progetti_pnrr
#
# Il file NON ha il comune: solo il soggetto attuatore. Un progetto e' attribuito a un
# comune quando il soggetto attuatore e' il comune stesso (vedi investimenti.py): codice
# fiscale tramite l'anagrafica IPA, altrimenti il nome se e' univoco. Il resto (RFI, ministeri,
# Regioni, ASL...) resta nel database con istat NULL: serve ai totali nazionali, non a un comune.
#
# Uso:
#   python 07_import_pnrr.py --csv ../../etl-data/pnrr/PNRR_Progetti.csv --ipa ../../etl-data/pnrr/ipa_enti.xlsx
# ============================================================
import argparse
import io
import os
import sys
from collections import Counter
from datetime import date, datetime

import pandas as pd
import psycopg
from dotenv import load_dotenv

from config import PNRR
from investimenti import Anagrafica

COLONNE_DB = [
    "cup", "misura", "istat", "missione", "descr_missione", "descr_misura", "titolo", "settore",
    "attuatore", "fin_pnrr", "fin_totale", "stato", "data_inizio", "data_fine",
]


def numero(v):
    """Importi con la virgola decimale ("1033550", "239086,11"); vuoto -> None."""
    if v is None or (isinstance(v, float) and v != v):
        return None
    v = str(v).strip().replace(",", ".")
    try:
        return float(v) if v else None
    except ValueError:
        return None


def data(v) -> date | None:
    """gg/mm/aaaa -> date; vuoto o illeggibile -> None."""
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        return datetime.strptime(v.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def testo(v) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def righe_db(df: pd.DataFrame, anagrafica: Anagrafica) -> tuple[list[tuple], Counter]:
    """DataFrame del CSV -> righe per progetti_pnrr, con il conteggio dei motivi di attribuzione."""
    c = PNRR["colonne"]
    out: list[tuple] = []
    motivi: Counter = Counter()
    visti: set[tuple[str, str]] = set()
    for r in df.to_dict("records"):
        cup, misura = testo(r.get(c["cup"])), testo(r.get(c["misura"]))
        if not cup or not misura or (cup, misura) in visti:
            continue
        visti.add((cup, misura))
        istat, motivo = anagrafica.risolvi(r.get(c["attuatore"]), r.get(c["cf_attuatore"]))
        motivi[motivo] += 1
        out.append((
            cup, misura, istat, testo(r.get(c["missione"])), testo(r.get(c["descr_missione"])),
            testo(r.get(c["descr_misura"])), testo(r.get(c["titolo"])), testo(r.get(c["settore"])),
            testo(r.get(c["attuatore"])), numero(r.get(c["fin_pnrr"])), numero(r.get(c["fin_totale"])),
            testo(r.get(c["stato"])),
            data(r.get(c["data_inizio"])) or data(r.get(c["data_inizio_prevista"])),
            data(r.get(c["data_fine"])) or data(r.get(c["data_fine_prevista"])),
        ))
    return out, motivi


def carica_anagrafica(cur, ipa_xlsx: str) -> Anagrafica:
    cur.execute("select istat_code, name from municipalities")
    comuni = [(i, n, None) for i, n in cur.fetchall()]
    ipa = pd.read_excel(ipa_xlsx, dtype=str)
    ipa = ipa[ipa["Denominazione_ente"].fillna("").str.match(r"(?i)^comune di ")]
    cf = dict(zip(ipa["Codice_fiscale_ente"].str.strip(), ipa["Codice_comune_ISTAT"]))
    return Anagrafica(comuni, cf)


def main() -> None:
    ap = argparse.ArgumentParser(description="Import dei progetti PNRR in progetti_pnrr")
    ap.add_argument("--csv", required=True, help="PNRR_Progetti.csv (tutte le missioni)")
    ap.add_argument("--ipa", required=True, help="enti.xlsx di IPA (codice fiscale -> comune)")
    a = ap.parse_args()

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante.")

    c = PNRR["colonne"]
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        anagrafica = carica_anagrafica(cur, a.ipa)
        df = pd.read_csv(a.csv, sep=PNRR["sep"], encoding=PNRR["encoding"], dtype=str,
                         usecols=list(c.values()), low_memory=False)
        righe, motivi = righe_db(df, anagrafica)
        print(f"  {len(df):,} righe nel file, {len(righe):,} progetti distinti (CUP + misura)".replace(",", "."))

        cur.execute("truncate progetti_pnrr")
        with cur.copy(f"copy progetti_pnrr ({', '.join(COLONNE_DB)}) from stdin") as cp:
            for riga in righe:
                cp.write_row(riga)
        cur.execute("select refresh_investimenti()")
        conn.commit()

    tot = sum(motivi.values())
    attribuiti = sum(v for k, v in motivi.items() if k in {"codice_fiscale", "nome", "alias", "nome_troncato"})
    print(f"  attribuiti a un comune: {attribuiti:,} ({100 * attribuiti / tot:.0f}%)".replace(",", "."))
    for motivo, n in motivi.most_common():
        print(f"    {motivo:18s} {n:>8,}".replace(",", "."))
    print("OK: progetti PNRR importati, vista degli investimenti ricalcolata.")


if __name__ == "__main__":
    main()
