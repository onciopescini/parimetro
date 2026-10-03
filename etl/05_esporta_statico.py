#!/usr/bin/env python3
# ============================================================
# ETL 05 · Esporta il database come file statici per il sito
#
# Online non gira nessun database: il sito e' su Cloudflare Pages e legge
# JSON pre-generati. Questo script chiama le stesse funzioni Postgres che
# prima servivano le RPC e ne scrive il risultato su disco.
#
# Lo schema dei nomi DEVE restare identico a web/lib/dati.ts.
#
# Uso:
#   python 05_esporta_statico.py --dest ../web/public/dati
# ============================================================
import argparse
import json
import os
import re
import shutil
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import psycopg
from dotenv import load_dotenv

METRICHE = ("fhi", "autonomia", "expenditure_pc", "revenue_pc", "reddito_medio")
# Se ne esportano piu' di quelle mostrate (20): chi nasconde i comuni con spesa
# concentrata deve comunque trovarne venti, e il filtro lo applica il sito
LIMITE_CLASSIFICA = 50


def senza_accenti(s: str) -> str:
    r"""Minuscolo e senza segni diacritici: "Forlì" -> "forli".

    Identico a senzaAccenti() in lib/dati.ts. NFKD scompone le lettere
    accentate (e le legature), poi si tolgono i soli segni combinanti non
    spaziati (categoria Mn): in JavaScript l'equivalente e' \p{Mn}, non \p{M}.
    """
    scomposto = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in scomposto if unicodedata.category(c) != "Mn")


def slug(s: str) -> str:
    """Chiave di file: solo [a-z0-9] separati da "-". Identica a slug() in lib/dati.ts."""
    return re.sub(r"[^a-z0-9]+", "-", senza_accenti(s)).strip("-")


def percorso_classifica(anno: int, metric: str, desc: bool,
                        fascia: str | None, region: str | None) -> str:
    """Percorso relativo a public/dati/. Identico a percorsoClassifica() in lib/dati.ts
    (che lo fa precedere da "/dati/")."""
    f = slug(fascia) if fascia else "tutte"
    r = slug(region) if region else "italia"
    return f"classifiche/{anno}/{metric}-{'disc' if desc else 'cresc'}-{f}-{r}.json"


def scrivi(percorso: str, dati) -> None:
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    with open(percorso, "w", encoding="utf-8") as f:
        json.dump(dati, f, ensure_ascii=False, separators=(",", ":"), default=str)


def scalare(cur, fn: str, *args):
    cur.execute(f"select {fn}({', '.join('%s' for _ in args)})", args)
    return cur.fetchone()[0]


def tabella(cur, fn: str, *args) -> list[dict]:
    cur.execute(f"select * from {fn}({', '.join('%s' for _ in args)})", args)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main() -> None:
    ap = argparse.ArgumentParser(description="Esporta i dati come JSON statici")
    ap.add_argument("--dest", required=True, help="Cartella di destinazione (public/dati)")
    ap.add_argument("--connessioni", type=int, default=8)
    a = ap.parse_args()

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    dest = os.path.abspath(a.dest)
    # Si rigenera tutto: un file vecchio che sopravvive (un comune soppresso,
    # una classifica di un anno rimosso) sarebbe un dato falso servito online.
    if os.path.basename(dest) != "dati":
        sys.exit(f"Per sicurezza la destinazione deve chiamarsi 'dati', non {dest}")
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest)

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        anni: list[int] = scalare(cur, "get_available_years") or []
        if not anni:
            sys.exit("Nessun esercizio in budget_records: prima l'ETL.")
        scrivi(f"{dest}/anni.json", anni)
        print(f"→ esercizi: {anni}")

        scrivi(f"{dest}/nazionale.json",
               {str(y): scalare(cur, "get_national_averages", y) for y in anni})

        for y in anni:
            scrivi(f"{dest}/comuni-{y}.json", scalare(cur, "get_geo_budget", y))
            scrivi(f"{dest}/province-{y}.json", scalare(cur, "get_province_aggregates", y))
            print(f"→ mappa {y}: {os.path.getsize(f'{dest}/comuni-{y}.json')/1e6:.1f} MB")

        # Indice per la ricerca in browser: le stesse colonne di search_municipalities
        cur.execute("""
            select istat_code, name, region, province, population,
                   ST_X(ST_PointOnSurface(geom)), ST_Y(ST_PointOnSurface(geom))
            from municipalities order by istat_code
        """)
        indice = [dict(istat=i, name=n, region=r, province=p, population=pop,
                       lon=round(lon, 5), lat=round(lat, 5))
                  for i, n, r, p, pop, lon, lat in cur.fetchall()]
        scrivi(f"{dest}/indice.json", indice)
        print(f"→ indice: {len(indice)} comuni")

        # Classifiche: tutte le combinazioni che il pannello puo' chiedere
        n_cl = 0
        for y in anni:
            filtri = scalare(cur, "get_ranking_filters", y)
            scrivi(f"{dest}/classifiche/filtri-{y}.json", filtri)
            fasce = [None] + [f["fascia"] for f in filtri["fasce"]]
            regioni = [None] + list(filtri["regioni"])
            for m in METRICHE:
                for desc in (True, False):
                    for fa in fasce:
                        for re_ in regioni:
                            righe = tabella(cur, "get_ranking", y, m, fa, re_, desc, LIMITE_CLASSIFICA)
                            scrivi(f"{dest}/{percorso_classifica(y, m, desc, fa, re_)}", righe)
                            n_cl += 1
            print(f"→ classifiche {y}: {n_cl} file finora")

    # Un file per comune: storico + confronto per fascia per ogni anno.
    # get_peer_comparison scandisce l'intero anno a ogni chiamata (~50 ms):
    # 7.900 comuni x 5 anni in serie sarebbero mezz'ora, in parallelo pochi minuti.
    def esporta_comune(istat: str) -> None:
        with psycopg.connect(url) as c, c.cursor() as k:
            scrivi(f"{dest}/comune/{istat}.json", {
                "history": scalare(k, "get_municipality_history", istat),
                "peers": {str(y): scalare(k, "get_peer_comparison", istat, y) for y in anni},
                # Spesa per area/natura/voce; null per gli anni senza dettaglio
                "categorie": {str(y): scalare(k, "get_categorie_comune", istat, y) for y in anni},
                # Reddito IRPEF per anno d'imposta (null se il comune non ha dati)
                "reddito": scalare(k, "get_reddito_comune", istat),
            })

    codici = [v["istat"] for v in indice]
    with ThreadPoolExecutor(max_workers=a.connessioni) as ex:
        for i, _ in enumerate(ex.map(esporta_comune, codici), 1):
            if i % 1000 == 0:
                print(f"→ comuni: {i}/{len(codici)}")

    tot = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(dest) for f in fs)
    n = sum(len(fs) for _, _, fs in os.walk(dest))
    print(f"✔ {n} file, {tot/1e6:.0f} MB in {dest}")
    if n > 19000:
        print("⚠ Cloudflare Pages accetta al massimo 20.000 file per deploy: siamo vicini.")


if __name__ == "__main__":
    main()
