#!/usr/bin/env python3
# ============================================================
# ETL 06 · IRPEF per comune (MEF, Dipartimento delle Finanze) -> irpef_comuni
#
# Un file per anno d'imposta, ~1 MB l'uno, scaricabile senza autenticazione da
# https://www1.finanze.gov.it/finanze/analisi_stat/public/index.php?opendata=yes
# (scarica_irpef.py li prende tutti).
#
# ⚠ Le celle con pochi contribuenti sono VUOTE: il MEF le oscura per il segreto
#   statistico. Qui diventano NULL, mai zero. In pratica mancano le fasce di
#   reddito alte e varie categorie (autonomi, imprenditori) nei comuni piccoli;
#   il numero di contribuenti e il reddito imponibile ci sono sempre.
#
# ⚠ Le intestazioni cambiano da un anno all'altro: si leggono per nome.
#
# Uso:
#   python 06_import_irpef.py --dir ..\..\etl-data\irpef
#   python 06_import_irpef.py --dir ../../etl-data/irpef --anni 2023 2024
# ============================================================
import argparse
import csv
import glob
import io
import json
import os
import re
import sys
import zipfile

import psycopg
from dotenv import load_dotenv

from config import IRPEF
from fusioni import rimappa

CAMPI = (
    ["contribuenti"]
    + [f"{v}_{t}" for v in IRPEF["voci"] for t in ("freq", "euro")]
    + [f"{k}_euro" for k in IRPEF["ammontari"]]
    + ["impresa_euro"]
)


def norm(s: str) -> str:
    """Intestazioni: spazi multipli e in fondo (ce n'e' una con uno spazio finale) -> uno solo."""
    return re.sub(r"\s+", " ", s).strip()


def numero(v):
    """Cella -> int, oppure None se oscurata o illeggibile. Mai 0 al posto di vuoto."""
    if v is None:
        return None
    v = v.strip()
    if not v or v.lower() in {"n.d.", "nd", "-"}:
        return None
    try:
        return int(round(float(v.replace(",", "."))))
    except ValueError:
        return None


def decodifica(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def leggi_anno(testo: str) -> tuple[int | None, dict[str, dict]]:
    """CSV di un anno -> (anno d'imposta, {codice ISTAT a 6 cifre: record})."""
    c = IRPEF
    lettore = csv.reader(io.StringIO(testo), delimiter=c["sep"])
    intestazione = [norm(x) for x in next(lettore)]
    ix = {nome: i for i, nome in enumerate(intestazione) if nome}
    for obbligatoria in (c["col_istat"], c["col_contribuenti"]):
        if obbligatoria not in ix:
            sys.exit(f"Colonna non trovata: {obbligatoria!r}. Correggi IRPEF in config.py.")

    def cella(r, nome):
        i = ix.get(nome)
        return numero(r[i]) if i is not None and i < len(r) else None

    anno = None
    out: dict[str, dict] = {}
    for r in lettore:
        if len(r) < 5 or not r[0].strip():
            continue
        if anno is None:
            anno = numero(r[0])
        codice = r[ix[c["col_istat"]]].strip().zfill(6)
        if codice == c["codice_senza_comune"]:
            continue
        contribuenti = cella(r, c["col_contribuenti"])
        if contribuenti is None:
            continue
        rec: dict = {"contribuenti": contribuenti}
        for voce, (col_f, col_a) in c["voci"].items():
            rec[f"{voce}_freq"] = cella(r, col_f)
            rec[f"{voce}_euro"] = cella(r, col_a)
        for k, col in c["ammontari"].items():
            rec[f"{k}_euro"] = cella(r, col)
        parti = [cella(r, col) for col in c["impresa"]]
        # ordinaria + semplificata: con una delle due oscurata la somma non si conosce
        rec["impresa_euro"] = None if any(p is None for p in parti) else sum(parti)
        rec["fasce"] = {chiave: cella(r, f"{col} - Frequenza") for chiave, col in c["fasce"]}
        out[codice] = rec
    return anno, out


def _somma(a, b):
    """Somma con NULL contagioso: un addendo ignoto rende ignoto il totale."""
    return None if a is None or b is None else a + b


def fondi_irpef(per_comune: dict[str, dict]) -> dict[str, dict]:
    """Comuni nati da fusioni: i predecessori si sommano al successore (vedi fusioni.py)."""
    out: dict[str, dict] = {}
    for codice, rec in per_comune.items():
        dest = rimappa(codice)
        if dest not in out:
            out[dest] = {**rec, "fasce": dict(rec["fasce"])}
            continue
        acc = out[dest]
        for campo in CAMPI:
            acc[campo] = _somma(acc.get(campo), rec.get(campo))
        acc["fasce"] = {k: _somma(acc["fasce"].get(k), rec["fasce"].get(k)) for k in rec["fasce"]}
    return out


def apri(path: str) -> str:
    if path.lower().endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            return decodifica(z.read(nome))
    with open(path, "rb") as f:
        return decodifica(f.read())


COLONNE_DB = ["istat_code", "year", *CAMPI, "fasce"]


def righe_db(anno: int, per_comune: dict[str, dict]) -> list[tuple]:
    return [
        (codice, anno, *[rec.get(c) for c in CAMPI], json.dumps(rec["fasce"]))
        for codice, rec in sorted(per_comune.items())
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description="Import IRPEF per comune in irpef_comuni")
    ap.add_argument("--dir", required=True, help="Cartella con i file irpef_AAAA.zip (o i CSV)")
    ap.add_argument("--anni", type=int, nargs="*", help="Solo questi anni d'imposta")
    a = ap.parse_args()

    file = sorted(glob.glob(os.path.join(a.dir, "*.zip")) + glob.glob(os.path.join(a.dir, "*.csv")))
    if not file:
        sys.exit(f"Nessun file in {a.dir}")

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select istat_code from municipalities")
        noti = {r[0] for r in cur.fetchall()}
        for path in file:
            anno, grezzo = leggi_anno(apri(path))
            if anno is None:
                print(f"  {os.path.basename(path)}: anno non riconosciuto, salto")
                continue
            if a.anni and anno not in a.anni:
                continue
            per_comune = fondi_irpef(grezzo)
            sconosciuti = sorted(c for c in per_comune if c not in noti)
            tenuti = {c: r for c, r in per_comune.items() if c in noti}
            cur.execute("delete from irpef_comuni where year = %s", (anno,))
            segnaposti = ", ".join(["%s"] * len(COLONNE_DB))
            cur.executemany(
                f"insert into irpef_comuni ({', '.join(COLONNE_DB)}) values ({segnaposti})",
                righe_db(anno, tenuti),
            )
            oscurati = sum(1 for r in tenuti.values() if r["complessivo_euro"] is None)
            print(
                f"  {anno}: {len(tenuti):,} comuni".replace(",", ".")
                + (f" · {len(sconosciuti)} codici senza comune: {sconosciuti[:5]}" if sconosciuti else "")
                + (f" · reddito complessivo non pubblicato/oscurato in {oscurati}" if oscurati else "")
            )
        cur.execute("select refresh_reddito()")
        conn.commit()
    print("OK: IRPEF importata, vista dei redditi ricalcolata.")


if __name__ == "__main__":
    main()
