#!/usr/bin/env python3
# ============================================================
# ETL 12 · Avvisi sui nuovi bilanci -> email a chi ha salvato un comune
#
# Dopo aver importato e PUBBLICATO un nuovo anno di dati (05_esporta_statico + deploy), questo script dice al sito
# per quali comuni ci sono dati di quell'anno. Il sito (funzione /api/avvisi/invia) cerca chi li ha salvati con
# l'avviso acceso, scrive una sola email a persona con l'elenco dei suoi comuni, e segna di aver gia' avvisato:
# rilanciarlo non manda doppioni.
#
# Il token sta nella variabile d'ambiente ADMIN_TOKEN (nel tuo etl/.env, mai nel repository): e' lo stesso
# segreto impostato sul progetto Pages. L'indirizzo del sito e' SITO_URL (default https://parimetro.it).
#
# Uso:
#   python 12_invia_avvisi.py --anno 2025              # PROVA: dice quanti riceverebbero un avviso, non scrive a nessuno
#   python 12_invia_avvisi.py --anno 2025 --invia      # scrive davvero
# ============================================================
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

import psycopg
from dotenv import load_dotenv


def main() -> None:
    ap = argparse.ArgumentParser(description="Avvisa chi ha salvato i comuni per cui e' uscito un nuovo anno di dati")
    ap.add_argument("--anno", type=int, required=True, help="l'anno di dati appena pubblicato")
    ap.add_argument("--invia", action="store_true", help="senza questo e' solo una prova")
    a = ap.parse_args()

    load_dotenv()
    url_db = os.environ.get("DATABASE_URL")
    token = os.environ.get("ADMIN_TOKEN")
    sito = os.environ.get("SITO_URL", "https://parimetro.it").rstrip("/")
    if not url_db:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")
    if not token:
        sys.exit("ADMIN_TOKEN mancante: impostalo nel .env (stesso valore del segreto sul progetto Pages).")

    with psycopg.connect(url_db) as conn:
        righe = conn.execute(
            """select m.istat_code from municipalities m
               join budget_records b on b.municipality_id = m.id
               where b.year = %s and (b.expenditure_total is not null or b.revenue_total is not null)""",
            (a.anno,),
        ).fetchall()
    istat = sorted({r[0] for r in righe if r[0]})
    if not istat:
        sys.exit(f"Nessun comune con dati per il {a.anno}: hai importato quell'anno?")
    print(f"{len(istat)} comuni con dati {a.anno}.")

    corpo = json.dumps({"anno": a.anno, "istat": istat, "prova": not a.invia}).encode()
    req = urllib.request.Request(
        f"{sito}/api/avvisi/invia",
        data=corpo,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            esito = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Il sito ha risposto {e.code}: {e.read().decode(errors='replace')[:200]}")
    if esito.get("prova"):
        print(f"PROVA: {esito['destinatari']} persone riceverebbero un avviso. Per scrivere davvero aggiungi --invia.")
    else:
        print(f"Avvisi: {esito['destinatari']} destinatari, {esito['inviati']} inviati, {esito['falliti']} falliti.")
        if esito["falliti"]:
            print("I falliti verranno ritentati al prossimo lancio (non sono stati segnati come avvisati).")


if __name__ == "__main__":
    main()
