#!/usr/bin/env python3
# ============================================================
# ETL 08 · Progetti di coesione (OpenCoesione) -> progetti_coesione
#
# Si tengono solo i progetti:
#   · localizzati su UN comune (COD_COMUNE di 9 cifre: regione + provincia + comune). Quelli su piu'
#     comuni hanno i codici separati da ":::", quelli provinciali o regionali non hanno comune: il costo
#     e' dell'intero progetto e non si puo' dividere (un progetto "nazionale" da 1,4 mld non va
#     attribuito a un paese di 60 abitanti);
#   · pubblicati sul portale (OC_FLAG_VISUALIZZAZIONE = 0): fuori duplicati e grandi progetti ritirati.
#
# Per contributi a persone e incentivi a imprese NON si salva il titolo: sono nomi privati.
#
# Uso:
#   python 08_import_coesione.py --zip ../../etl-data/oc/progetti_esteso.zip
# ============================================================
import argparse
import os
import sys
import zipfile
from collections import Counter
from datetime import date, datetime

import pandas as pd
import psycopg
from dotenv import load_dotenv

from config import COESIONE
from fusioni import rimappa

COLONNE_DB = [
    "codice_locale", "cup", "istat", "natura", "titolo", "ciclo", "tema", "settore",
    "fin_pubblico", "pagamenti", "stato", "data_inizio", "data_fine", "link",
]

# Natura dell'intervento (classificazione CUP) -> genere che ci interessa
NATURA = {
    "REALIZZAZIONE DI LAVORI PUBBLICI (OPERE ED IMPIANTISTICA)": "opere",
    "ACQUISTO O REALIZZAZIONE DI SERVIZI": "servizi",
    "ACQUISTO DI BENI": "beni",
    "CONCESSIONE DI CONTRIBUTI AD ALTRI SOGGETTI (DIVERSI DA UNITA' PRODUTTIVE)": "contributi",
    "CONCESSIONE DI INCENTIVI AD UNITA' PRODUTTIVE": "incentivi",
}
# I generi i cui titoli sono nomi di persone o imprese private: non si pubblicano
SENZA_TITOLO = {"contributi", "incentivi"}


def genere(natura) -> str:
    if not isinstance(natura, str):
        return "altro"
    n = natura.strip().upper()
    if n in NATURA:
        return NATURA[n]
    return "capitale" if n.startswith("SOTTOSCRIZIONE INIZIALE") else "altro"


def istat_da_cod_comune(cod) -> str | None:
    """'002007003' (regione 002 + provincia 007 + comune 003) -> '007003'. None se non e' un solo comune."""
    if not isinstance(cod, str) or len(cod) != 9 or not cod.isdigit():
        return None
    return rimappa(cod[3:])


def numero(v):
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        return float(v.strip().replace(",", "."))
    except ValueError:
        return None


def data(v) -> date | None:
    """aaaammgg -> date."""
    if not isinstance(v, str) or len(v.strip()) != 8:
        return None
    try:
        return datetime.strptime(v.strip(), "%Y%m%d").date()
    except ValueError:
        return None


def testo(v) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def righe_db(df: pd.DataFrame, comuni_noti: set[str]) -> tuple[list[tuple], Counter]:
    """Un pezzo del CSV -> righe da inserire, e il conteggio dei motivi di scarto."""
    scarti: Counter = Counter()
    out: list[tuple] = []
    for r in df.to_dict("records"):
        if r.get("OC_FLAG_VISUALIZZAZIONE") != "0":
            scarti["non_pubblicato"] += 1
            continue
        istat = istat_da_cod_comune(r.get("COD_COMUNE"))
        if istat is None:
            scarti["non_su_un_solo_comune"] += 1
            continue
        if istat not in comuni_noti:
            scarti["comune_soppresso_o_sconosciuto"] += 1
            continue
        codice = testo(r.get("COD_LOCALE_PROGETTO"))
        if not codice:
            scarti["senza_codice"] += 1
            continue
        g = genere(r.get("CUP_DESCR_NATURA"))
        ciclo = testo(r.get("OC_COD_CICLO"))
        out.append((
            codice, testo(r.get("CUP")), istat, g,
            None if g in SENZA_TITOLO else testo(r.get("OC_TITOLO_PROGETTO")),
            int(ciclo) if ciclo and ciclo.isdigit() else None,
            testo(r.get("OC_TEMA_SINTETICO")), testo(r.get("CUP_DESCR_SETTORE")),
            numero(r.get("OC_FINANZ_TOT_PUB_NETTO")), numero(r.get("TOT_PAGAMENTI")),
            testo(r.get("OC_STATO_PROGETTO")),
            data(r.get("OC_DATA_INIZIO_PROGETTO")), data(r.get("OC_DATA_FINE_PROGETTO_EFFETTIVA")),
            testo(r.get("OC_LINK")),
        ))
    return out, scarti


def senza_doppioni(righe: list[tuple], visti: set[str]) -> list[tuple]:
    """Tiene la prima riga di ogni codice locale e aggiorna `visti`. Vale anche dentro lo stesso pezzo."""
    nuove = []
    for r in righe:
        if r[0] in visti:
            continue
        visti.add(r[0])
        nuove.append(r)
    return nuove


def main() -> None:
    ap = argparse.ArgumentParser(description="Import dei progetti OpenCoesione in progetti_coesione")
    ap.add_argument("--zip", required=True, help="progetti_esteso.zip (tutti i cicli)")
    a = ap.parse_args()

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select istat_code from municipalities")
        noti = {r[0] for r in cur.fetchall()}
        cur.execute("truncate progetti_coesione")
        letti = tenuti = 0
        scarti: Counter = Counter()
        visti: set[str] = set()
        with zipfile.ZipFile(a.zip) as z, z.open(z.namelist()[0]) as f:
            lettore = pd.read_csv(
                f, sep=COESIONE["sep"], encoding=COESIONE["encoding"], dtype=str,
                usecols=COESIONE["colonne"], chunksize=COESIONE["chunk"], low_memory=False,
            )
            for pezzo in lettore:
                letti += len(pezzo)
                righe, sc = righe_db(pezzo, noti)
                scarti.update(sc)
                # Il codice locale e' la chiave: un doppione (nello stesso pezzo o in uno precedente) si scarta
                nuove = senza_doppioni(righe, visti)
                scarti["doppione"] += len(righe) - len(nuove)
                with cur.copy(f"copy progetti_coesione ({', '.join(COLONNE_DB)}) from stdin") as cp:
                    for riga in nuove:
                        cp.write_row(riga)
                tenuti += len(nuove)
                print(f"  letti {letti:,} · tenuti {tenuti:,}".replace(",", "."), flush=True)
        cur.execute("select refresh_investimenti()")
        conn.commit()

    print(f"OK: {tenuti:,} progetti su {letti:,} ({100 * tenuti / letti:.0f}%)".replace(",", "."))
    for motivo, n in scarti.most_common():
        print(f"    scartati, {motivo:34s} {n:>9,}".replace(",", "."))


if __name__ == "__main__":
    main()
