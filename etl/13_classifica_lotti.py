#!/usr/bin/env python3
# ============================================================
# ETL 13 · A cosa servono le gare: classifica i lotti ANAC per area di spesa con Jev (TypeSafe)  ->  lotti_area
#
# Per ogni lotto (esclusi le adesioni a convenzioni, che non sono una scelta del comune) Jev legge tipo, oggetto e
# categoria CPV e sceglie una delle aree di spesa (etl/lotti_area.py). E' una classificazione AUTOMATICA: il sito la
# presenta sempre come tale. Il modello sceglie l'area, le somme le fa il codice.
#
# Lotti con lo stesso testo hanno la stessa risposta: si chiede una volta sola. Si puo' fermare e riprendere: i lotti
# gia' classificati si saltano. La chiave sta in JEV_API_KEY nel .env (mai nel codice). Costo: circa 0,05 $ per
# milione di token in ingresso (~220 token a richiesta, cioe' ~11 $ per milione di richieste).
#
# Uso:
#   python 13_classifica_lotti.py --anno 2024                      # stima: quanti lotti, quante richieste, quanto tempo
#   python 13_classifica_lotti.py --anno 2024 --esegui --limite 200   # una prova
#   python 13_classifica_lotti.py --anno 2024 --esegui             # tutti
# ============================================================
import argparse
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import psycopg
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "benchmark"))
import jev  # noqa: E402
from lotti_area import DOMANDA, MODELLO, chiave_testo, risposta_valida, stato_lotto  # noqa: E402

DA_FARE = """
select a.cig, a.tipo, a.oggetto, a.cpv_descr
from appalti_comuni a
where a.anno = %s and a.famiglia <> 'adesione'
  and a.oggetto is not null and length(btrim(a.oggetto)) >= 4
  and not exists (select 1 from lotti_area l where l.cig = a.cig)
"""


def chiedi(testo: tuple):
    tipo, oggetto, cpv = testo
    try:
        return testo, risposta_valida(jev.chiedi(stato_lotto(tipo, oggetto, cpv), DOMANDA, MODELLO)["area"])
    except Exception as e:  # una richiesta fallita non ferma tutto: il lotto resta da fare al prossimo lancio
        return testo, ("errore", str(e)[:80])


def main() -> None:
    ap = argparse.ArgumentParser(description="Classifica i lotti ANAC per area di spesa con Jev")
    ap.add_argument("--anno", type=int, required=True)
    ap.add_argument("--esegui", action="store_true", help="senza questo si stampa solo la stima")
    ap.add_argument("--limite", type=int, default=0, help="massimo di richieste (0 = tutte)")
    ap.add_argument("--connessioni", type=int, default=12)
    a = ap.parse_args()

    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    with psycopg.connect(url) as conn:
        righe = conn.execute(DA_FARE, (a.anno,)).fetchall()
    per_testo: dict[tuple, list[str]] = defaultdict(list)
    for cig, tipo, oggetto, cpv in righe:
        per_testo[chiave_testo(tipo, oggetto, cpv)].append(cig)
    testi = list(per_testo)
    if a.limite:
        testi = testi[: a.limite]
    ore = len(testi) * 0.3 / max(a.connessioni, 1) / 3600
    print(f"{len(righe)} lotti del {a.anno} da classificare, {len(per_testo)} testi distinti; "
          f"{len(testi)} richieste a Jev, circa {ore:.1f} ore con {a.connessioni} in parallelo e {len(testi) * 220 / 1e6 * 0.05:.2f} $.")
    if not a.esegui:
        print("Stima soltanto: aggiungi --esegui per classificare davvero.")
        return

    fatti = errori = 0
    t0 = time.time()
    with psycopg.connect(url) as conn, ThreadPoolExecutor(max_workers=a.connessioni) as ex:
        lotto: list[tuple] = []
        for testo, esito in ex.map(chiedi, testi):
            if esito is None or esito[0] == "errore":
                errori += 1
                if errori in (1, 10, 100):
                    print(f"  ! risposta non usabile ({esito}): il lotto restera' da fare", flush=True)
                if errori > 200 and errori > 0.2 * (fatti + errori):
                    sys.exit("Troppi errori di fila: mi fermo. Controlla chiave, crediti e limiti di richieste.")
                continue
            area, conf = esito
            lotto += [(cig, area, conf, MODELLO) for cig in per_testo[testo]]
            fatti += 1
            if len(lotto) >= 500:
                with conn.transaction():
                    conn.cursor().executemany(
                        "insert into lotti_area (cig, area, confidenza, modello) values (%s,%s,%s,%s) "
                        "on conflict (cig) do update set area = excluded.area, confidenza = excluded.confidenza, "
                        "modello = excluded.modello, classificato_il = current_date", lotto)
                lotto = []
            if fatti % 2000 == 0:
                print(f"→ {fatti}/{len(testi)} testi ({(time.time() - t0) / fatti:.2f} s l'uno), {errori} errori", flush=True)
        if lotto:
            with conn.transaction():
                conn.cursor().executemany(
                    "insert into lotti_area (cig, area, confidenza, modello) values (%s,%s,%s,%s) "
                    "on conflict (cig) do update set area = excluded.area, confidenza = excluded.confidenza, "
                    "modello = excluded.modello, classificato_il = current_date", lotto)
    print(f"✔ {fatti} testi classificati in {(time.time() - t0) / 60:.1f} minuti, {errori} da rifare (rilancia lo script).")


if __name__ == "__main__":
    main()
