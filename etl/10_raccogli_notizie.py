#!/usr/bin/env python3
# ============================================================
# ETL 10 · Notizie sui conti dei comuni (Firecrawl) -> notizie_comuni
#
# Per ogni comune una ricerca di notizie ("Comune di X" bilancio tributi appalti); il CODICE tiene
# solo quelle che nominano il comune e parlano di conti, tributi, appalti o fondi (vedi notizie.py)
# e salva titolo, fonte, data e link. Niente testo degli articoli, niente riassunti.
#
# La chiave di Firecrawl sta nella variabile d'ambiente FIRECRAWL_API_KEY (la metti tu nel .env o nella
# shell: non va scritta in file del repository). Costo: circa 2 crediti a ricerca, cioe' ~16.000 crediti
# per tutti i comuni. Senza --esegui lo script stampa la stima e si ferma.
#
# Uso:
#   python 10_raccogli_notizie.py                       # stima, non spende nulla
#   python 10_raccogli_notizie.py --esegui --min-abitanti 20000 --limite 20   # una prova
#   python 10_raccogli_notizie.py --esegui              # tutti, saltando chi e' gia' stato cercato da meno di 7 giorni
# ============================================================
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import psycopg
from dotenv import load_dotenv

from notizie import forma, interrogazione, seleziona

API = "https://api.firecrawl.dev/v2/search"
CREDITI_A_RICERCA = 2


def cerca(chiave: str, testo: str, tentativi: int = 4) -> list[dict]:
    """Le notizie grezze per una ricerca; solleva l'ultimo errore se non riesce."""
    corpo = json.dumps({"query": testo, "sources": ["news"], "limit": 10, "location": "Italy"}).encode()
    for t in range(tentativi):
        req = urllib.request.Request(API, data=corpo, headers={
            "Authorization": f"Bearer {chiave}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                dati = json.load(r)
            return (dati.get("data") or {}).get("news") or []
        except urllib.error.HTTPError as e:
            if e.code in (402, 401):  # crediti finiti o chiave sbagliata: inutile riprovare
                raise SystemExit(f"Firecrawl ha risposto {e.code}: controlla la chiave e i crediti.") from e
            if t == tentativi - 1:
                raise
            time.sleep(5 * (t + 1) if e.code == 429 else 2 * (t + 1))
        except (urllib.error.URLError, TimeoutError):
            if t == tentativi - 1:
                raise
            time.sleep(2 * (t + 1))
    return []


def main() -> None:
    ap = argparse.ArgumentParser(description="Raccoglie le notizie sui conti dei comuni")
    ap.add_argument("--esegui", action="store_true", help="senza questo si stampa solo la stima")
    ap.add_argument("--min-abitanti", type=int, default=0)
    ap.add_argument("--limite", type=int, default=0, help="massimo di comuni (0 = tutti)")
    ap.add_argument("--max-eta-giorni", type=int, default=7, help="salta i comuni cercati da meno di cosi'")
    ap.add_argument("--connessioni", type=int, default=4)
    a = ap.parse_args()

    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    with psycopg.connect(url) as conn:
        comuni = conn.execute(
            """select m.istat_code, m.name, m.province, coalesce(m.population, 0)
               from municipalities m
               left join notizie_raccolte r on r.istat = m.istat_code
               where coalesce(m.population, 0) >= %s
                 and (r.raccolta_il is null or r.raccolta_il < current_date - %s)
               order by m.population desc nulls last""",
            (a.min_abitanti, a.max_eta_giorni)).fetchall()
        tutti = conn.execute("select name from municipalities").fetchall()
    if a.limite:
        comuni = comuni[: a.limite]
    omonimi = Counter(forma(n.split("/")[0]) for (n,) in tutti)

    print(f"{len(comuni)} comuni da cercare, circa {len(comuni) * CREDITI_A_RICERCA} crediti Firecrawl.")
    if not a.esegui:
        print("Stima soltanto: aggiungi --esegui per cercare davvero.")
        return
    chiave = os.environ.get("FIRECRAWL_API_KEY")
    if not chiave:
        sys.exit("FIRECRAWL_API_KEY mancante: impostala nella shell o nel .env (non incollarla in chat).")

    def lavora(c):
        istat, nome, provincia, _ = c
        ambiguo = omonimi[forma(nome.split("/")[0])] > 1
        grezze = cerca(chiave, interrogazione(nome, provincia, ambiguo))
        return istat, seleziona(grezze, nome, provincia, ambiguo)

    fatte = trovate = 0
    with psycopg.connect(url) as conn, ThreadPoolExecutor(max_workers=a.connessioni) as ex:
        for istat, notizie in ex.map(lavora, comuni):
            with conn.transaction():
                # La ricerca nuova sostituisce la vecchia: una notizia sparita dai risultati non resta li' per sempre
                conn.execute("delete from notizie_comuni where istat = %s", (istat,))
                for n in notizie:
                    conn.execute(
                        "insert into notizie_comuni (istat, url, titolo, fonte, data) values (%s,%s,%s,%s,%s) "
                        "on conflict do nothing", (istat, n["url"], n["titolo"], n["fonte"], n["data"]))
                conn.execute(
                    "insert into notizie_raccolte (istat, raccolta_il, trovate) values (%s,%s,%s) "
                    "on conflict (istat) do update set raccolta_il = excluded.raccolta_il, trovate = excluded.trovate",
                    (istat, date.today(), len(notizie)))
            fatte += 1
            trovate += len(notizie)
            if fatte % 100 == 0:
                print(f"→ {fatte}/{len(comuni)} comuni, {trovate} notizie")
    print(f"✔ {fatte} comuni cercati, {trovate} notizie tenute ({trovate / max(fatte, 1):.1f} a comune)")


if __name__ == "__main__":
    main()
