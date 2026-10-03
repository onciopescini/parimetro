#!/usr/bin/env python3
# ============================================================
# ETL 01 · Confini comunali ISTAT → municipalities
#
# Importa lo shapefile dei comuni (usa la versione GENERALIZZATA,
# suffisso "_g": pesa 10 volte meno e al web non serve di più) e
# l'Elenco comuni ISTAT per i nomi di regione e provincia. Poi:
#   staging via ogr2ogr → upsert municipalities → geom_simplified
#
# Uso:
#   python 01_import_boundaries.py Com01012025_g_WGS84.shp Elenco-comuni-italiani.csv
#   python 01_import_boundaries.py --inspect Elenco-comuni-italiani.csv
# ============================================================
import argparse
import os
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlparse

import pandas as pd
import psycopg
from dotenv import load_dotenv

from config import BOUNDARIES, ISTAT_ELENCO, inspect_csv

STAGING = "istat_comuni_staging"


def db_url() -> str:
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")
    return url


def ogr_conn(url: str) -> str:
    """Converte l'URL Postgres nel formato connessione di ogr2ogr."""
    u = urlparse(url)
    return (
        f"PG:host={u.hostname} port={u.port or 5432} dbname={u.path.lstrip('/')} "
        f"user={u.username} password={unquote(u.password or '')} sslmode=require"
    )


def percorso_wsl(p: str) -> str:
    r"""Percorso di Windows -> percorso visto dalla WSL: C:\dev\x.shp -> /mnt/c/dev/x.shp"""
    if p.startswith("/"):
        # Gia' un percorso della WSL: abspath su Windows lo trasformerebbe in
        # C:\mnt\c\..., che verrebbe poi tradotto una seconda volta
        return p
    m = re.match(r"^([A-Za-z]):[\\/](.*)$", os.path.abspath(p))
    if not m:
        return p
    return f"/mnt/{m.group(1).lower()}/" + m.group(2).replace("\\", "/")


def comando_ogr2ogr(shp: str) -> tuple[list[str], str]:
    """(prefisso del comando, percorso dello shapefile da passargli).

    Con OGR2OGR_BACKEND=wsl si usa ogr2ogr installato nella WSL (`apt install
    gdal-bin`), chiamato tramite wsl.exe. Su Windows e' la strada piu' semplice:
    wsl.exe e' firmato da Microsoft, mentre un launcher generato da pip
    (ogr2ogr-shim) e' un .exe nuovo e non firmato, che un criterio di controllo
    delle applicazioni puo' bloccare (WinError 4551). Nella WSL "localhost" e' la
    WSL stessa: va bene se il database sta li'.
    """
    if os.environ.get("OGR2OGR_BACKEND", "").lower() == "wsl":
        distro = os.environ.get("OGR2OGR_WSL_DISTRO", "Ubuntu")
        return ["wsl", "-d", distro, "--", "ogr2ogr"], percorso_wsl(shp)
    return ["ogr2ogr"], shp


def run_ogr2ogr(shp: str, url: str) -> None:
    prefisso, shp_cmd = comando_ogr2ogr(shp)
    if prefisso == ["ogr2ogr"] and not shutil.which("ogr2ogr"):
        sys.exit(
            "ogr2ogr non trovato: installa GDAL.\n"
            "  macOS:   brew install gdal\n"
            "  Ubuntu:  sudo apt install gdal-bin\n"
            "  Windows: GDAL nella WSL (OGR2OGR_BACKEND=wsl), OSGeo4W o il shim Docker"
        )
    cmd = prefisso + [
        "-f", "PostgreSQL", ogr_conn(url), shp_cmd,
        "-nln", STAGING, "-overwrite",
        "-t_srs", "EPSG:4326",
        "-nlt", "PROMOTE_TO_MULTI",
        "-lco", "GEOMETRY_NAME=geom",
        # Il DBF ISTAT dichiara shape_area/shape_leng come numeric(18,11) ma ci
        # mette dentro valori a 8 cifre intere: la COPY va in "numeric field
        # overflow". Allo staging servono solo codice e nome, quindi li isolo.
        "-select", f"{BOUNDARIES['col_istat_shp']},{BOUNDARIES['col_nome_shp']}",
        "--config", "PG_USE_COPY", "YES",
    ]
    print(f"→ ogr2ogr: {os.path.basename(shp)} → {STAGING}")
    subprocess.run(cmd, check=True)


def load_elenco(path: str) -> list[tuple[str, str, str]]:
    c = ISTAT_ELENCO
    df = pd.read_csv(path, sep=c["sep"], encoding=c["encoding"], dtype=str)
    missing = [k for k in (c["col_istat"], c["col_regione"], c["col_provincia"])
               if k not in df.columns]
    if missing:
        sys.exit(
            f"Colonne non trovate nell'Elenco comuni: {missing}\n"
            f"Lancia --inspect sul CSV e correggi ISTAT_ELENCO in config.py."
        )
    df = df[[c["col_istat"], c["col_regione"], c["col_provincia"]]].dropna()
    df.columns = ["istat", "regione", "provincia"]
    df["istat"] = df["istat"].str.strip().str.zfill(6)
    df = df.drop_duplicates(subset="istat")
    return list(df.itertuples(index=False, name=None))


def main() -> None:
    ap = argparse.ArgumentParser(description="Import confini comunali ISTAT")
    ap.add_argument("shapefile", nargs="?", help="Shapefile comuni (es. Com01012025_g_WGS84.shp)")
    ap.add_argument("elenco_csv", nargs="?", help="Elenco-comuni-italiani.csv")
    ap.add_argument("--tolerance", type=float, default=0.004,
                    help="Tolleranza semplificazione in gradi (default 0.004 ≈ 400 m)")
    ap.add_argument("--keep-staging", action="store_true",
                    help="Non cancellare la tabella di staging a fine import")
    ap.add_argument("--inspect", metavar="CSV", help="Stampa header e prime righe di un CSV")
    a = ap.parse_args()

    if a.inspect:
        inspect_csv(a.inspect)
        return
    if not (a.shapefile and a.elenco_csv):
        ap.error("servono shapefile e elenco_csv (oppure --inspect FILE)")

    url = db_url()
    run_ogr2ogr(a.shapefile, url)
    elenco = load_elenco(a.elenco_csv)
    print(f"→ Elenco comuni: {len(elenco)} voci lette")

    col_code = BOUNDARIES["col_istat_shp"]
    col_name = BOUNDARIES["col_nome_shp"]

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        # Nomi regione/provincia in una temp table, poi un unico upsert SQL
        cur.execute(
            "create temp table elenco_tmp (istat text primary key, regione text, provincia text)"
        )
        with cur.copy("copy elenco_tmp (istat, regione, provincia) from stdin") as cp:
            for row in elenco:
                cp.write_row(row)

        cur.execute(f"""
            insert into municipalities
                   (istat_code, name, region, province, population, area_sqkm, geom)
            select s.{col_code},
                   s.{col_name},
                   coalesce(e.regione,   'n/d'),
                   coalesce(e.provincia, 'n/d'),
                   0,  -- la popolazione arriva dallo script 02
                   round((ST_Area(s.geom::geography) / 1e6)::numeric, 2),
                   ST_Multi(s.geom)
            from {STAGING} s
            left join elenco_tmp e on e.istat = s.{col_code}
            on conflict (istat_code) do update set
                name      = excluded.name,
                region    = excluded.region,
                province  = excluded.province,
                area_sqkm = excluded.area_sqkm,
                geom      = excluded.geom
        """)
        print(f"→ municipalities: {cur.rowcount} righe inserite/aggiornate")

        print(f"→ genero geom_simplified (tolleranza {a.tolerance}°)…")
        cur.execute(
            "update municipalities "
            "set geom_simplified = ST_Multi(ST_SimplifyPreserveTopology(geom, %s))",
            (a.tolerance,),
        )

        if not a.keep_staging:
            cur.execute(f"drop table if exists {STAGING}")
        conn.commit()

    print("✔ Confini importati. Ricordati di eliminare i comuni demo:")
    print("  delete from municipalities where istat_code like 'DEMO%';")


if __name__ == "__main__":
    main()
