#!/usr/bin/env python3
# ============================================================
# ETL 09 · Appalti (ANAC, dataset "cig") -> appalti_comuni
#
# Un file zip al mese per anno (cig_csv_AAAA_MM.zip, 5-100 MB l'uno). Si tengono solo i lotti il cui
# committente (stazione appaltante) E' un comune: codice fiscale tramite l'anagrafica IPA, altrimenti
# il nome (stesse regole del PNRR, vedi investimenti.py). Gli altri enti (ASL, ministeri, centrali di
# committenza, societa') non finiscono su un comune.
#
# Licenza dei dati ANAC: CC BY-SA 4.0 (condivisione alla pari): vedi NOTICE.
#
# ⚠ L'importo del lotto non e' sommabile cosi' com'e': vedi la migrazione 20261003300000_appalti.sql.
#
# Uso:
#   python 09_import_anac.py --dir ../../etl-data/anac/cig --ipa ../../etl-data/pnrr/ipa_enti.xlsx
#   python 09_import_anac.py --dir ... --ipa ... --anni 2023 2024
# ============================================================
import argparse
import glob
import os
import re
import sys
import zipfile
from collections import Counter
from datetime import date, datetime

import pandas as pd
import psycopg
from dotenv import load_dotenv

from investimenti import Anagrafica

COLONNE_CSV = {
    "cig", "oggetto_lotto", "importo_lotto", "oggetto_principale_contratto", "data_pubblicazione",
    "tipo_scelta_contraente", "cf_amministrazione_appaltante", "denominazione_amministrazione_appaltante",
    "cod_cpv", "descrizione_cpv", "anno_pubblicazione", "data_cancellazione", "data_ultimo_perfezionamento",
    "strumento_svolgimento", "flag_urgenza", "esito", "flag_pnrr_pnc",
}
COLONNE_DB = [
    "cig", "istat", "anno", "data_pubblicazione", "oggetto", "importo", "tipo", "procedura", "famiglia",
    "cpv", "cpv_descr", "aggiudicata", "urgenza", "pnrr", "piattaforma", "perfezionamento",
]


def famiglia(procedura) -> str:
    """Dalla etichetta ANAC del tipo di scelta del contraente a una famiglia che si possa confrontare.

    Le etichette cambiano un po' da un anno all'altro, quindi si ragiona sul testo e non sul codice.
    "In adesione" a una convenzione o a un accordo quadro viene PRIMA di "affidamento diretto": la
    scelta del fornitore e' gia' fatta dall'accordo, e il suo importo e' il massimale, non la spesa.
    """
    if not isinstance(procedura, str):
        return "altra"
    t = procedura.upper()
    if "ADESIONE" in t:
        return "adesione"
    if "IN HOUSE" in t:
        return "in_house"
    if "AFFIDAMENTO DIRETTO" in t:
        return "diretto"
    if "APERTA" in t:
        return "aperta"
    if "RISTRETTA" in t:
        return "ristretta"
    if "NEGOZIATA" in t or "COTTIMO" in t:
        return "negoziata"
    return "altra"


def testo(v) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def numero(v) -> float | None:
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        x = float(v.strip())
    except ValueError:
        return None
    return x if x >= 0 else None  # un importo negativo e' un errore di inserimento


def data(v) -> date | None:
    t = testo(v)
    if not t:
        return None
    try:
        return datetime.strptime(t[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def flag(v) -> bool | None:
    """'1', '1.0' -> True; '0', '0.0' -> False; vuoto -> None (non e' un "no": non lo sappiamo)."""
    t = testo(v)
    if t is None:
        return None
    try:
        return float(t) == 1
    except ValueError:
        return None


def righe_db(df: pd.DataFrame, risolvi) -> tuple[list[tuple], Counter]:
    """Un pezzo di CSV -> righe di appalti_comuni. `risolvi(denominazione, cf)` -> codice ISTAT o None."""
    scarti: Counter = Counter()
    out: list[tuple] = []
    for r in df.to_dict("records"):
        cig = testo(r.get("cig"))
        if not cig:
            scarti["senza_cig"] += 1
            continue
        if testo(r.get("data_cancellazione")):
            scarti["cancellato"] += 1
            continue
        istat = risolvi(r.get("denominazione_amministrazione_appaltante"), r.get("cf_amministrazione_appaltante"))
        if istat is None:
            scarti["committente_non_comune"] += 1
            continue
        d = data(r.get("data_pubblicazione"))
        anno = testo(r.get("anno_pubblicazione"))
        try:
            anno_i = int(float(anno)) if anno else (d.year if d else None)
        except ValueError:
            anno_i = d.year if d else None
        if anno_i is None:
            scarti["senza_anno"] += 1
            continue
        proc = testo(r.get("tipo_scelta_contraente"))
        esito = testo(r.get("esito"))
        strumento = testo(r.get("strumento_svolgimento"))
        out.append((
            cig, istat, anno_i, d, testo(r.get("oggetto_lotto")), numero(r.get("importo_lotto")),
            testo(r.get("oggetto_principale_contratto")), proc, famiglia(proc),
            testo(r.get("cod_cpv")), testo(r.get("descrizione_cpv")),
            None if esito is None else esito.upper() == "AGGIUDICATA",
            flag(r.get("flag_urgenza")), flag(r.get("flag_pnrr_pnc")),
            None if strumento is None else "PIATTAFORM" in strumento.upper(),
            data(r.get("data_ultimo_perfezionamento")),
        ))
    return out, scarti


def costruisci_risolutore(cur, ipa_xlsx: str):
    """Funzione denominazione+CF -> ISTAT, con memoria: le stesse stazioni appaltanti ricorrono migliaia di volte."""
    cur.execute("select istat_code, name from municipalities")
    comuni = [(i, n, None) for i, n in cur.fetchall()]
    ipa = pd.read_excel(ipa_xlsx, dtype=str)
    ipa = ipa[ipa["Denominazione_ente"].fillna("").str.match(r"(?i)^comune di ")]
    anagrafica = Anagrafica(comuni, dict(zip(ipa["Codice_fiscale_ente"].str.strip(), ipa["Codice_comune_ISTAT"])))
    memoria: dict[tuple, str | None] = {}

    def risolvi(denominazione, cf):
        chiave = (denominazione if isinstance(denominazione, str) else None, cf if isinstance(cf, str) else None)
        if chiave not in memoria:
            memoria[chiave] = anagrafica.risolvi(*chiave)[0]
        return memoria[chiave]

    return risolvi


def mesi(directory: str, anni: list[int] | None) -> list[str]:
    file = sorted(glob.glob(os.path.join(directory, "cig_csv_*.zip")))
    if anni:
        file = [f for f in file if any(f"_{a}_" in os.path.basename(f) for a in anni)]
    return file


def main() -> None:
    ap = argparse.ArgumentParser(description="Import dei lotti ANAC dei comuni in appalti_comuni")
    ap.add_argument("--dir", required=True, help="Cartella con i cig_csv_AAAA_MM.zip")
    ap.add_argument("--ipa", required=True, help="enti.xlsx di IPA (codice fiscale -> comune)")
    ap.add_argument("--anni", type=int, nargs="*", help="Solo questi anni")
    a = ap.parse_args()

    file = mesi(a.dir, a.anni)
    if not file:
        sys.exit(f"Nessun cig_csv_*.zip in {a.dir}")

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        risolvi = costruisci_risolutore(cur, a.ipa)
        cur.execute("create temp table staging (like appalti_comuni) on commit drop")
        letti = tenuti = 0
        scarti: Counter = Counter()
        for path in file:
            with zipfile.ZipFile(path) as z, z.open(z.namelist()[0]) as f:
                for pezzo in pd.read_csv(
                    f, sep=";", dtype=str, chunksize=200_000, low_memory=False,
                    usecols=lambda c: c.lower() in COLONNE_CSV,
                ):
                    pezzo.columns = [c.lower() for c in pezzo.columns]
                    letti += len(pezzo)
                    righe, sc = righe_db(pezzo, risolvi)
                    scarti.update(sc)
                    with cur.copy(f"copy staging ({', '.join(COLONNE_DB)}) from stdin") as cp:
                        for riga in righe:
                            cp.write_row(riga)
                    tenuti += len(righe)
            print(f"  {os.path.basename(path)}: letti {letti:,} · tenuti {tenuti:,}".replace(",", "."), flush=True)

        # Lo stesso CIG compare in piu' mesi (aggiornamenti): vince l'ultimo perfezionamento
        cur.execute(f"""
            insert into appalti_comuni ({', '.join(COLONNE_DB)})
            select distinct on (cig) {', '.join(COLONNE_DB)} from staging
            order by cig, perfezionamento desc nulls last
            on conflict (cig) do update set
              {', '.join(f'{c} = excluded.{c}' for c in COLONNE_DB if c != 'cig')}
            where coalesce(excluded.perfezionamento, date '1900-01-01') >= coalesce(appalti_comuni.perfezionamento, date '1900-01-01')
        """)
        cur.execute("select refresh_appalti()")
        conn.commit()

    print(f"OK: {tenuti:,} lotti di comuni su {letti:,} letti".replace(",", "."))
    for motivo, n in scarti.most_common():
        print(f"    scartati, {motivo:24s} {n:>10,}".replace(",", "."))


if __name__ == "__main__":
    main()
