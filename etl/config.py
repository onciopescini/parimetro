# ============================================================
# config.py · Mappature colonne dei file open data
#
# I nomi delle colonne nei CSV di ISTAT e OpenBDAP cambiano tra
# millesimi e dataset. Se uno script segnala colonne mancanti:
#   1. lancia  python <script>.py --inspect file.csv
#   2. leggi gli header reali stampati a video
#   3. correggi QUI la mappatura corrispondente
# ============================================================

# ---------- ISTAT · Shapefile confini comunali ----------
# Campi dello shapefile (ogr2ogr li porta in minuscolo nello staging)
BOUNDARIES = {
    "col_istat_shp": "pro_com_t",   # codice ISTAT a 6 cifre (testo)
    "col_nome_shp":  "comune",      # denominazione del comune
}

# ---------- ISTAT · Elenco comuni (CSV ';' latin-1) ----------
ISTAT_ELENCO = {
    "sep": ";",
    "encoding": "latin-1",
    "col_istat":     "Codice Comune formato alfanumerico",
    "col_regione":   "Denominazione Regione",
    # ISTAT manda a capo questa intestazione DENTRO l'header del CSV: il nome
    # della colonna contiene un \n letterale (verificato con repr sul file 2025).
    "col_provincia": "Denominazione dell'Unità territoriale sovracomunale \n"
                     "(valida a fini statistici)",
}

# ---------- ISTAT · Popolazione residente (POSAS, demo.istat.it) ----------
POSAS = {
    "sep": ";",
    "encoding": "utf-8",
    # Il CSV di demo.istat.it si apre con una riga di titolo ("Popolazione
    # residente per età, sesso e stato civile al 1° gennaio AAAA"): l'header
    # vero è il secondo rigo, quindi ne salto uno.
    "skiprows": 1,
    "col_istat":  "Codice comune",
    # Se il CSV ha già una colonna col totale, impostala qui e verrà usata:
    "col_totale": "",               # es. "Totale"
    # ...altrimenti si filtra la riga-totale per età e si sommano M+F:
    "col_eta":    "Età",
    "eta_totale": "999",
    "col_maschi":  "Totale maschi",
    "col_femmine": "Totale femmine",
}

# ---------- OpenBDAP · Rendiconto ENTRATE (accertamenti) ----------
BDAP_ENTRATE = {
    "sep": ";",
    "encoding": "utf-8",
    "decimal": ",",                  # importi con virgola decimale
    "col_istat":       "CODICE_ISTAT",
    "col_titolo":      "TITOLO",     # basta che contenga la cifra del titolo
    "col_accertamenti": "ACCERTAMENTI",
}

# ---------- OpenBDAP · Rendiconto SPESE (impegni e pagamenti) ----------
BDAP_SPESE = {
    "sep": ";",
    "encoding": "utf-8",
    "decimal": ",",
    "col_istat":    "CODICE_ISTAT",
    "col_titolo":   "TITOLO",        # lascia "" se il file non ha il titolo
    "col_impegni":  "IMPEGNI",
    "col_pagamenti": "PAGAMENTI",
}

# ---------- SIOPE · Movimenti cumulati mensili (open data BDAP) ----------
# ATTENZIONE: SIOPE è contabilità di CASSA (incassi/pagamenti), non di
# competenza (accertamenti/impegni). Vedi le note in cima a 04_import_siope.py.
SIOPE = {
    "sep": ";",
    "encoding": "latin-1",           # verificato: 0xE0 = "à" in "attività"
    "decimal": ".",                  # gli importi usano il punto, non la virgola
    "col_prov":    "Codice istat provincia",   # 3 cifre; va concatenato…
    "col_com":     "Codice istat comune",      # …a queste altre 3 → codice a 6
    "col_tipo":    "Codice Tipologia Ente BDAP",
    "tipo_comuni": "CO",             # tiene solo i Comuni, scarta province e altri enti
    "col_periodo": "Anno/Mese calendario",     # "2024/01" … "2024/12"
    "col_titolo":  "Codice Titolo CG",         # "E1000000000" → titolo 1
    "col_importo": "Importo cumulato",         # progressivo da gennaio!
}

# SIOPE usa anche il titolo 0 = "INCASSI/PAGAMENTI DA REGOLARIZZARE": sospesi non
# ancora attribuiti a un titolo (in Molise ~2,5% degli incassi). Restano fuori dai
# totali classificati, altrimenti gonfiano il denominatore di own_revenue/revenue
# e schiacciano l'autonomia finanziaria nell'FHI.
TITOLO_DA_REGOLARIZZARE = "0"

# ---------- Classificazione bilanci armonizzati (D.Lgs 118/2011) ----------
# Entrate per titolo:
#  1 tributarie · 2 trasferimenti correnti · 3 extratributarie
#  4 in conto capitale · 5 riduzione attività finanziarie
#  6 accensione prestiti · 7 anticipazioni tesoriere · 9 conto terzi
TITOLI_CORRENTI        = {"1", "2", "3"}
TITOLI_CAPITALE        = {"4", "5"}
TITOLI_PROPRIE         = {"1", "3"}      # autonomia finanziaria
TITOLI_ENTRATE_ESCLUSE = {"7", "9"}      # anticipazioni e partite di giro

# Spese per titolo: 5 chiusura anticipazioni · 7 conto terzi → fuori dal totale
TITOLI_SPESE_ESCLUSE   = {"5", "7"}


# ---------- Helper condiviso: ispezione CSV ----------
def inspect_csv(path: str, rows: int = 3) -> None:
    """Prova encoding/separatori comuni e stampa header + prime righe."""
    import pandas as pd

    for enc in ("utf-8", "latin-1"):
        for sep in (";", ",", "\t"):
            try:
                df = pd.read_csv(path, sep=sep, encoding=enc, nrows=rows, dtype=str)
            except Exception:
                continue
            if df.shape[1] > 1:
                print(f"\n=== encoding={enc!r} · sep={sep!r} · {df.shape[1]} colonne ===")
                for c in df.columns:
                    print("  •", c)
                print("\nPrime righe:")
                print(df.head(rows).to_string(index=False)[:2000])
                return
    print("Non riesco a leggere il file: formato o encoding non riconosciuti.")
