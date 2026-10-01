#!/usr/bin/env python3
# Riapplica categorie_spesa.py alle voci gia' nel database (natura e area) e
# ricalcola le viste. Serve quando si ritocca la tabella di corrispondenza:
# senza, bisognerebbe reimportare 5 anni di SIOPE solo per cambiare un'etichetta.
#
#   python riclassifica_voci.py
import os
import sys

import psycopg
from dotenv import load_dotenv

from categorie_spesa import classifica


def main() -> None:
    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante.")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select codice, natura, area from spese_voci")
        cambi = []
        for codice, natura, area in cur.fetchall():
            n, a = classifica(codice)
            if (n, a) != (natura, area):
                cambi.append((n, a, codice))
        cur.executemany("update spese_voci set natura = %s, area = %s where codice = %s", cambi)
        cur.execute("select refresh_aree()")
        conn.commit()
    print(f"{len(cambi)} voci riclassificate")


if __name__ == "__main__":
    main()
