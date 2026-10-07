#!/usr/bin/env python3
# ============================================================
# ETL 13 · A cosa servono le gare e che cosa si compra: classifica i lotti ANAC con Jev (TypeSafe)  ->  lotti_area
#
# Per ogni lotto (esclusi le adesioni a convenzioni, che non sono una scelta del comune) Jev legge tipo, oggetto e
# categoria CPV e risponde, nella stessa chiamata, a tre domande semplici:
#   · area      a quale area di spesa appartiene (etl/lotti_area.py)
#   · intervento nuova opera, manutenzione, fornitura, servizio o incarico tecnico
#   · vago      la descrizione e' troppo vaga per capire cosa si compra?
# E' una classificazione AUTOMATICA: il sito la presenta sempre come tale. Il modello sceglie, le somme le fa il codice.
#
# Lotti con lo stesso testo hanno la stessa risposta: si chiede una volta sola. Si puo' fermare e riprendere. I lotti gia'
# classificati per area ma senza tipo di intervento ricevono SOLO le due domande nuove: l'area gia' pubblicata non cambia.
# La chiave sta in JEV_API_KEY nel .env (mai nel codice). Costo: circa 0,05 $ per milione di token in ingresso.
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
from lotti_area import (  # noqa: E402
    DOMANDA,
    DOMANDE_COMPLETE,
    DOMANDE_INTERVENTO,
    MODELLO,
    chiave_testo,
    risposta_intervento,
    risposta_valida,
    stato_lotto,
)

# Lotti da fare: senza riga (area + intervento) oppure con la riga ma senza tipo di intervento (solo intervento)
DA_FARE = """
select a.cig, a.tipo, a.oggetto, a.cpv_descr, (l.cig is null) as manca_area
from appalti_comuni a
left join lotti_area l on l.cig = a.cig
where a.anno = %s and a.famiglia <> 'adesione'
  and a.oggetto is not null and length(btrim(a.oggetto)) >= 4
  and (l.cig is null or l.intervento is null)
"""

SALVA_COMPLETO = (
    "insert into lotti_area (cig, area, confidenza, modello, intervento, intervento_conf, vago) values (%s,%s,%s,%s,%s,%s,%s) "
    "on conflict (cig) do update set area = excluded.area, confidenza = excluded.confidenza, modello = excluded.modello, "
    "intervento = excluded.intervento, intervento_conf = excluded.intervento_conf, vago = excluded.vago, classificato_il = current_date"
)
SALVA_INTERVENTO = "update lotti_area set intervento = %s, intervento_conf = %s, vago = %s where cig = %s"


def chiedi(voce: tuple):
    """voce = (testo, completo). Restituisce (voce, esito) con esito = (area, conf, intervento, ic, vago) | errore."""
    (tipo, oggetto, cpv), completo = voce
    try:
        r = jev.chiedi(stato_lotto(tipo, oggetto, cpv), DOMANDE_COMPLETE if completo else DOMANDE_INTERVENTO, MODELLO)
        iv = risposta_intervento(r)
        if iv is None:
            return voce, None
        if not completo:
            return voce, (None, None, *iv)
        av = risposta_valida(r.get("area") or {})
        return voce, (*av, *iv) if av else None
    except Exception as e:  # una richiesta fallita non ferma tutto: il lotto resta da fare al prossimo lancio
        return voce, ("errore", str(e)[:80])


def main() -> None:
    ap = argparse.ArgumentParser(description="Classifica i lotti ANAC con Jev: area, tipo di intervento, vaghezza")
    ap.add_argument("--anno", type=int, required=True)
    ap.add_argument("--esegui", action="store_true", help="senza questo si stampa solo la stima")
    ap.add_argument("--limite", type=int, default=0, help="massimo di richieste (0 = tutte)")
    ap.add_argument("--connessioni", type=int, default=16)
    a = ap.parse_args()

    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    with psycopg.connect(url) as conn:
        righe = conn.execute(DA_FARE, (a.anno,)).fetchall()
    per_voce: dict[tuple, list[str]] = defaultdict(list)
    for cig, tipo, oggetto, cpv, manca_area in righe:
        per_voce[(chiave_testo(tipo, oggetto, cpv), bool(manca_area))].append(cig)
    voci = list(per_voce)
    if a.limite:
        voci = voci[: a.limite]
    completi = sum(1 for _, c in voci if c)
    ore = len(voci) * 0.3 / max(a.connessioni, 1) / 3600
    print(f"{len(righe)} lotti del {a.anno} da classificare, {len(per_voce)} richieste distinte ({completi} con anche l'area); "
          f"{len(voci)} a Jev, circa {ore:.1f} ore con {a.connessioni} in parallelo e {len(voci) * 330 / 1e6 * 0.05:.2f} $.")
    if not a.esegui:
        print("Stima soltanto: aggiungi --esegui per classificare davvero.")
        return

    fatti = errori = 0
    t0 = time.time()
    completo_buf: list[tuple] = []
    solo_buf: list[tuple] = []

    def svuota(conn):
        nonlocal completo_buf, solo_buf
        with conn.transaction():
            if completo_buf:
                conn.cursor().executemany(SALVA_COMPLETO, completo_buf)
            if solo_buf:
                conn.cursor().executemany(SALVA_INTERVENTO, solo_buf)
        completo_buf, solo_buf = [], []

    with psycopg.connect(url) as conn, ThreadPoolExecutor(max_workers=a.connessioni) as ex:
        for voce, esito in ex.map(chiedi, voci):
            if esito is None or esito[0] == "errore":
                errori += 1
                if errori in (1, 10, 100):
                    print(f"  ! risposta non usabile ({esito}): il lotto restera' da fare", flush=True)
                if errori > 200 and errori > 0.2 * (fatti + errori):
                    sys.exit("Troppi errori di fila: mi fermo. Controlla chiave, crediti e limiti di richieste.")
                continue
            area, conf, interv, iconf, vago = esito
            completo = voce[1]
            for cig in per_voce[voce]:
                if completo:
                    completo_buf.append((cig, area, conf, MODELLO, interv, iconf, vago))
                else:
                    solo_buf.append((interv, iconf, vago, cig))
            fatti += 1
            if len(completo_buf) + len(solo_buf) >= 500:
                svuota(conn)
            if fatti % 2000 == 0:
                print(f"→ {fatti}/{len(voci)} richieste ({(time.time() - t0) / fatti:.2f} s l'una), {errori} errori", flush=True)
        svuota(conn)
    print(f"✔ {fatti} richieste classificate in {(time.time() - t0) / 60:.1f} minuti, {errori} da rifare (rilancia lo script).")


if __name__ == "__main__":
    main()
