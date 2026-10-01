#!/usr/bin/env python3
# ============================================================
# ETL 04 · SIOPE → budget_records
#
# Alternativa allo script 03 quando i rendiconti di COMPETENZA non
# sono disponibili: i dati di competenza per singolo comune non sono
# scaricabili in blocco da nessuna fonte pubblica (il catalogo BDAP si
# ferma al 2015, OpenBDAP espone solo aggregati regionali, il MinInterno
# solo un ente alla volta). SIOPE invece copre 2014-2026, comune per
# comune, ed è scaricabile con scarica_siope.py.
#
# ⚠ DIFFERENZA CONTABILE DA DICHIARARE SEMPRE ALL'UTENTE FINALE:
#   SIOPE è CASSA (incassi e pagamenti), non COMPETENZA (accertamenti
#   e impegni). Di conseguenza:
#     - revenue_total    = incassi (non accertamenti)
#     - expenditure_total= pagamenti (non impegni)
#     - surplus_deficit  = saldo di CASSA (incassi - pagamenti),
#                          non il risultato di competenza
#     - commitments      = NULL: SIOPE non conosce gli impegni, quindi
#                          il termine "velocità di spesa" dell'FHI resta
#                          neutro invece di essere falsato duplicando i
#                          pagamenti
#     - debt_total       = NULL (come nello script 03)
#
# ⚠ GLI IMPORTI SONO CUMULATI PROGRESSIVI da gennaio: il totale annuo è
#   la riga del mese PIÙ ALTO disponibile per quel comune, non la somma
#   dei dodici mesi. Sommare i mesi gonfierebbe i valori di ~6 volte.
#
# Uso:
#   python 04_import_siope.py --dir ..\..\etl-data\siope_2024 --year 2024
#   python 04_import_siope.py --inspect entrate_Molise.csv
# ============================================================
import argparse
import glob
import os
import re
import sys
from collections import defaultdict

import pandas as pd
import psycopg
from dotenv import load_dotenv

from categorie_spesa import AREE, classifica
from config import (
    SIOPE,
    TITOLI_CAPITALE,
    TITOLI_CORRENTI,
    TITOLI_ENTRATE_ESCLUSE,
    TITOLI_PROPRIE,
    TITOLI_SPESE_ESCLUSE,
    TITOLO_DA_REGOLARIZZARE,
    inspect_csv,
)

# Fuori dai totali: anticipazioni/partite di giro (come nello script 03) più i
# sospesi da regolarizzare, che SIOPE marca con il titolo 0.
ENTRATE_FUORI = TITOLI_ENTRATE_ESCLUSE | {TITOLO_DA_REGOLARIZZARE}
SPESE_FUORI = TITOLI_SPESE_ESCLUSE | {TITOLO_DA_REGOLARIZZARE}

CHUNK = 300_000


def leggi(path: str):
    """Genera i chunk di un CSV SIOPE con le sole colonne che servono."""
    c = SIOPE
    need = [c["col_prov"], c["col_com"], c["col_tipo"],
            c["col_periodo"], c["col_titolo"], c["col_importo"]]
    testa = pd.read_csv(path, sep=c["sep"], encoding=c["encoding"], nrows=0)
    mancanti = [x for x in need if x not in testa.columns]
    if mancanti:
        sys.exit(
            f"{os.path.basename(path)}: colonne non trovate {mancanti}\n"
            "Lancia --inspect sul file e correggi SIOPE in config.py."
        )
    return pd.read_csv(path, sep=c["sep"], encoding=c["encoding"], dtype=str,
                       usecols=need, chunksize=CHUNK)


def aggrega(paths: list[str]) -> dict:
    """(istat, mese, titolo) -> importo cumulato. Tiene solo i Comuni."""
    c = SIOPE
    acc: dict = defaultdict(float)
    for path in paths:
        righe = 0
        for ch in leggi(path):
            ch = ch[ch[c["col_tipo"]].astype(str).str.strip() == c["tipo_comuni"]]
            if ch.empty:
                continue
            ist = (ch[c["col_prov"]].astype(str).str.strip().str.zfill(3)
                   + ch[c["col_com"]].astype(str).str.strip().str.zfill(3))
            # "2024/07" -> 7
            mese = pd.to_numeric(
                ch[c["col_periodo"]].astype(str).str.split("/").str[-1], errors="coerce"
            )
            # "E1000000000" / "S1000000000" -> "1"
            tit = ch[c["col_titolo"]].astype(str).str.extract(r"[A-Za-z](\d)", expand=False)
            val = pd.to_numeric(ch[c["col_importo"]], errors="coerce").fillna(0.0)

            df = pd.DataFrame({"i": ist, "m": mese, "t": tit, "v": val}).dropna(
                subset=["m", "t"]
            )
            for (i, m, t), v in df.groupby(["i", "m", "t"])["v"].sum().items():
                acc[(i, int(m), t)] += float(v)
            righe += len(ch)
        print(f"   {os.path.basename(path):46s} {righe:>9,} righe comuni".replace(",", "."))
    return acc


def ultimo_mese(acc: dict) -> dict:
    """Per ogni comune tiene solo il mese più alto: gli importi sono cumulati."""
    massimo: dict = {}
    for (i, m, _t) in acc:
        if m > massimo.get(i, 0):
            massimo[i] = m
    out: dict = defaultdict(lambda: defaultdict(float))
    for (i, m, t), v in acc.items():
        if m == massimo[i]:
            out[i][t] += v
    return out


CODICE_VOCE = re.compile(r"U\d{10}")


def voci_per_comune(paths: list[str]) -> tuple[dict, dict, int]:
    """Spesa per voce di ogni comune, all'ultimo mese disponibile.

    Ritorna ({istat: {codice: importo}}, {codice: descrizione}, voci_scartate).

    Si riduce file per file: ogni file SIOPE e' una regione e un comune non sta
    in due file, quindi si puo' buttare via tutto tranne l'ultimo mese appena
    finito il file. Tenere in memoria (comune, mese, voce) per un anno intero
    vorrebbe dire ~8 milioni di chiavi e piu' di un gigabyte.

    Restano fuori le voci dei titoli esclusi dai totali (sospesi, chiusura
    anticipazioni, partite di giro), come in totali_comune(), cosi' il dettaglio
    somma esattamente a cio' che e' contato come pagamenti.
    """
    c = SIOPE
    need = [c["col_prov"], c["col_com"], c["col_tipo"], c["col_periodo"], c["col_titolo"],
            c["col_importo"], c["col_gestionale"], c["col_descr"]]
    risultato: dict = {}
    descrizioni: dict = {}
    scartate = 0
    for path in paths:
        testa = pd.read_csv(path, sep=c["sep"], encoding=c["encoding"], nrows=0)
        mancanti = [x for x in need if x not in testa.columns]
        if mancanti:
            sys.exit(
                f"{os.path.basename(path)}: colonne non trovate {mancanti}\n"
                "Lancia --inspect sul file e correggi SIOPE in config.py."
            )
        acc: dict = defaultdict(float)
        for ch in pd.read_csv(path, sep=c["sep"], encoding=c["encoding"], dtype=str,
                              usecols=need, chunksize=CHUNK):
            ch = ch[ch[c["col_tipo"]].astype(str).str.strip() == c["tipo_comuni"]]
            if ch.empty:
                continue
            df = pd.DataFrame({
                "i": (ch[c["col_prov"]].astype(str).str.strip().str.zfill(3)
                      + ch[c["col_com"]].astype(str).str.strip().str.zfill(3)),
                "m": pd.to_numeric(ch[c["col_periodo"]].astype(str).str.split("/").str[-1],
                                   errors="coerce"),
                "t": ch[c["col_titolo"]].astype(str).str.extract(r"[A-Za-z](\d)", expand=False),
                "c": ch[c["col_gestionale"]].astype(str).str.strip(),
                "d": ch[c["col_descr"]].astype(str).str.strip(),
                "v": pd.to_numeric(ch[c["col_importo"]], errors="coerce").fillna(0.0),
            }).dropna(subset=["m", "t"])
            df = df[~df["t"].isin(SPESE_FUORI)]
            valido = df["c"].str.fullmatch(CODICE_VOCE.pattern)
            scartate += int((~valido).sum())
            df = df[valido]
            for (i, m, cod), v in df.groupby(["i", "m", "c"])["v"].sum().items():
                acc[(i, int(m), cod)] += float(v)
            for cod, des in df.drop_duplicates("c")[["c", "d"]].itertuples(index=False):
                descrizioni.setdefault(cod, des)
        risultato.update({i: dict(v) for i, v in ultimo_mese(acc).items()})
        print(f"   {os.path.basename(path):46s} {len(acc):>9,} (comune, mese, voce)".replace(",", "."))
    return risultato, descrizioni, scartate


def importa_voci(cur, per_comune: dict, descrizioni: dict, anno: int) -> dict:
    """Scrive anagrafica delle voci e importi per bilancio. Riscrive l'anno: rilanciabile."""
    cur.executemany(
        "insert into spese_voci (codice, descrizione, natura, area) values (%s,%s,%s,%s) "
        "on conflict (codice) do update set descrizione = excluded.descrizione, "
        "natura = excluded.natura, area = excluded.area",
        [(cod, descrizioni[cod], *classifica(cod)) for cod in sorted(descrizioni)],
    )
    cur.execute(
        "select m.istat_code, b.id from budget_records b "
        "join municipalities m on m.id = b.municipality_id where b.year = %s",
        (anno,),
    )
    bilancio = dict(cur.fetchall())
    senza_bilancio = [i for i in per_comune if i not in bilancio]
    ids = [bilancio[i] for i in per_comune if i in bilancio]
    cur.execute("delete from budget_items where budget_id = any(%s)", (ids,))
    righe = 0
    with cur.copy("copy budget_items (budget_id, codice, importo) from stdin") as cp:
        for ist, voci in per_comune.items():
            b = bilancio.get(ist)
            if b is None:
                continue
            for cod, imp in voci.items():
                if imp != 0:
                    cp.write_row((b, cod, round(imp, 2)))
                    righe += 1
    return {"righe": righe, "comuni": len(ids), "senza_bilancio": senza_bilancio}


def totali_comune(entrate: dict, spese: dict) -> dict:
    """Totali di un comune dai suoi importi per titolo (gia' all'ultimo mese).

    Funzione pura, cosi' si puo' provare senza un database: e' qui che si
    decide cosa entra nei totali e cosa no (anticipazioni, partite di giro,
    sospesi da regolarizzare).
    """
    incassi = sum(v for t, v in entrate.items() if t not in ENTRATE_FUORI)
    pagamenti = sum(v for t, v in spese.items() if t not in SPESE_FUORI)
    return {
        "incassi": incassi,
        "pagamenti": pagamenti,
        "correnti": sum(v for t, v in entrate.items() if t in TITOLI_CORRENTI),
        "capitale": sum(v for t, v in entrate.items() if t in TITOLI_CAPITALE),
        "proprie": sum(v for t, v in entrate.items() if t in TITOLI_PROPRIE),
        "saldo": incassi - pagamenti,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Import SIOPE (cassa) in budget_records")
    ap.add_argument("--dir", help="Cartella con entrate_*.csv e spese_*.csv")
    ap.add_argument("--year", type=int, help="Esercizio di riferimento")
    ap.add_argument("--inspect", metavar="CSV", help="Stampa header e prime righe")
    ap.add_argument("--senza-voci", action="store_true",
                    help="Salta il dettaglio per voce (solo i totali, piu' veloce)")
    a = ap.parse_args()

    if a.inspect:
        inspect_csv(a.inspect)
        return
    if not (a.dir and a.year):
        ap.error("servono --dir e --year (oppure --inspect FILE)")

    f_ent = sorted(glob.glob(os.path.join(a.dir, "entrate_*.csv")))
    f_spe = sorted(glob.glob(os.path.join(a.dir, "spese_*.csv")))
    if not f_ent or not f_spe:
        sys.exit(f"In {a.dir} servono sia entrate_*.csv sia spese_*.csv.")

    print(f"→ entrate: {len(f_ent)} file")
    ent = ultimo_mese(aggrega(f_ent))
    print(f"→ spese: {len(f_spe)} file")
    spe = ultimo_mese(aggrega(f_spe))
    print(f"  {len(ent)} comuni con entrate · {len(spe)} con spese")

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL mancante: copia .env.example in .env e compilalo.")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select istat_code, id, population from municipalities")
        muni = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

        pop_y: dict = {}
        cur.execute("select to_regclass('population_years')")
        if cur.fetchone()[0]:
            cur.execute(
                "select istat_code, population from population_years where year = %s",
                (a.year,),
            )
            pop_y = dict(cur.fetchall())

        righe, non_abbinati, senza_pop = [], [], 0
        for ist, titoli in ent.items():
            if ist not in muni:
                non_abbinati.append(ist)
                continue
            mid, pop_fallback = muni[ist]
            pop = pop_y.get(ist) or pop_fallback or 0
            if not pop:
                senza_pop += 1

            tot = totali_comune(titoli, spe.get(ist, {}))
            incassi, pagamenti = tot["incassi"], tot["pagamenti"]
            correnti, capitale, proprie = tot["correnti"], tot["capitale"], tot["proprie"]

            righe.append((
                mid, a.year, pop,
                round(incassi, 2),               # revenue_total (incassi)
                round(pagamenti, 2),             # expenditure_total (pagamenti)
                round(correnti, 2),
                round(capitale, 2),
                round(proprie, 2),
                None,                            # debt_total → FHI neutro
                round(incassi - pagamenti, 2),   # surplus_deficit = saldo di CASSA
                round(pagamenti, 2),             # payments_made
                None,                            # commitments: SIOPE non li ha
            ))

        cur.executemany(
            """
            insert into budget_records
                (municipality_id, year, population, revenue_total, expenditure_total,
                 revenue_current, revenue_capital, own_revenue, debt_total,
                 surplus_deficit, payments_made, commitments)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            on conflict on constraint unique_muni_year do update set
                population        = excluded.population,
                revenue_total     = excluded.revenue_total,
                expenditure_total = excluded.expenditure_total,
                revenue_current   = excluded.revenue_current,
                revenue_capital   = excluded.revenue_capital,
                own_revenue       = excluded.own_revenue,
                surplus_deficit   = excluded.surplus_deficit,
                payments_made     = excluded.payments_made,
                commitments       = excluded.commitments
            """,
            righe,
        )
        conn.commit()

        # L'indice è il percentile nella fascia demografica, quindi si calcola
        # per coorte e non riga per riga: niente trigger, va lanciato qui.
        cur.execute("select refresh_fhi(%s)", (a.year,))
        print(f"→ indice ricalcolato su {cur.fetchone()[0]} righe")
        conn.commit()

        if not a.senza_voci:
            print("→ dettaglio per voce (secondo passaggio sulle spese)…")
            per_comune, descr, scartate = voci_per_comune(f_spe)
            esito = importa_voci(cur, per_comune, descr, a.year)
            conn.commit()
            cur.execute("select refresh_aree()")
            conn.commit()
            print(f"  {esito['righe']:,} importi in {esito['comuni']} comuni · {len(descr)} voci distinte"
                  .replace(",", "."))
            if scartate:
                print(f"  ⚠ {scartate} righe scartate: codice gestionale fuori formato")
            if esito["senza_bilancio"]:
                print(f"  ⚠ {len(esito['senza_bilancio'])} comuni con spese ma senza bilancio "
                      f"(nessuna entrata): {esito['senza_bilancio'][:5]}")
            # Quanto resta in 'non_attribuibile' e' la misura di cio' che la tabella di
            # corrispondenza non sa classificare: va guardato a ogni import
            tot = nonattr = 0.0
            for voci in per_comune.values():
                for cod, imp in voci.items():
                    tot += imp
                    nonattr += imp if classifica(cod)[1] == "non_attribuibile" else 0
            if tot:
                print(f"  {nonattr / tot:.1%} della spesa resta '{AREE['non_attribuibile']}'")

    print(f"✔ {len(righe)} comuni caricati per il {a.year}.")
    if non_abbinati:
        print(f"⚠ {len(non_abbinati)} codici non abbinati. Primi 10: {non_abbinati[:10]}")
    if senza_pop:
        print(f"⚠ {senza_pop} comuni senza popolazione: i pro capite restano null.")
    print("⚠ Ricorda: questi sono dati di CASSA. surplus_deficit è il saldo di cassa,")
    print("  non il risultato di competenza. Va dichiarato nell'interfaccia.")


if __name__ == "__main__":
    main()
