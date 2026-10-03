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
    # Il dettaglio per voce (per le spese): codice del piano dei conti e descrizione
    "col_gestionale": "Codice Gestionale Enti Locali",   # "U1030215004"
    "col_descr": "Descrizione CG",
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


# ---------- MEF · Dichiarazioni IRPEF per comune (Dipartimento delle Finanze) ----------
# Un CSV (in zip) per anno d'imposta. Le intestazioni cambiano un po' da un anno
# all'altro (2020-22 non hanno "Reddito complessivo"; qualche intestazione ha uno
# spazio in fondo): si leggono per NOME, mai per posizione, dopo aver normalizzato
# gli spazi. Le celle con pochi contribuenti sono VUOTE (segreto statistico): NULL, non zero.
IRPEF = {
    "sep": ";",
    "encoding": "utf-8",
    "col_istat": "Codice Istat Comune",
    "col_contribuenti": "Numero contribuenti",
    # nome della voce -> (colonna frequenza, colonna ammontare)
    "voci": {
        "imponibile": ("Reddito imponibile - Frequenza", "Reddito imponibile - Ammontare in euro"),
        "complessivo": ("Reddito complessivo - Frequenza", "Reddito complessivo - Ammontare in euro"),
        "addizionale": ("Addizionale comunale dovuta - Frequenza", "Addizionale comunale dovuta - Ammontare in euro"),
    },
    # solo l'ammontare
    "ammontari": {
        "dipendente": "Reddito da lavoro dipendente e assimilati - Ammontare in euro",
        "pensione": "Reddito da pensione - Ammontare in euro",
        "fabbricati": "Reddito da fabbricati - Ammontare in euro",
        "autonomo": "Reddito da lavoro autonomo (comprensivo dei valori nulli) - Ammontare in euro",
        "partecipazione": "Reddito da partecipazione (comprensivo dei valori nulli) - Ammontare in euro",
    },
    # impresa = ordinaria + semplificata: se una delle due e' oscurata, la somma e' ignota
    "impresa": [
        "Reddito di spettanza dell'imprenditore in contabilita' ordinaria (comprensivo dei valori nulli) - Ammontare in euro",
        "Reddito di spettanza dell'imprenditore in contabilita' semplificata (comprensivo dei valori nulli) - Ammontare in euro",
    ],
    "fasce": [
        ("minore_zero", "Reddito complessivo minore o uguale a zero euro"),
        ("0_10", "Reddito complessivo da 0 a 10000 euro"),
        ("10_15", "Reddito complessivo da 10000 a 15000 euro"),
        ("15_26", "Reddito complessivo da 15000 a 26000 euro"),
        ("26_55", "Reddito complessivo da 26000 a 55000 euro"),
        ("55_75", "Reddito complessivo da 55000 a 75000 euro"),
        ("75_120", "Reddito complessivo da 75000 a 120000 euro"),
        ("oltre_120", "Reddito complessivo oltre 120000 euro"),
    ],
    # riga di riepilogo "contribuenti senza comune": non e' un comune
    "codice_senza_comune": "000000",
}


# ---------- PNRR · Progetti (Italia Domani, Sogei; CC BY 4.0) ----------
# PNRR_Progetti.csv: un CSV con ";" e UTF-8 con BOM. NON ha il comune: solo il soggetto attuatore.
PNRR = {
    "sep": ";",
    "encoding": "utf-8-sig",
    "colonne": {
        "cup": "CUP",
        "misura": "ID Misura",
        "missione": "Missione",
        "descr_missione": "Descrizione Missione",
        "descr_misura": "Descrizione Misura",
        "titolo": "Titolo Progetto",
        "settore": "CUP Descrizione Settore",
        "attuatore": "Soggetto Attuatore",
        "cf_attuatore": "Codice Fiscale Soggetto Attuatore",
        "fin_pnrr": "Finanziamento PNRR",
        "fin_totale": "Finanziamento Totale",
        "stato": "Stato Avanzamento Progetto",
        "data_inizio": "Data Inizio Progetto Effettiva",
        "data_inizio_prevista": "Data Inizio Progetto Prevista",
        "data_fine": "Data Fine Progetto Effettiva",
        "data_fine_prevista": "Data Fine Progetto Prevista",
    },
}

# ---------- OpenCoesione · progetti con tracciato esteso (CC BY 4.0) ----------
# progetti_esteso.zip: ~4,3 GB di CSV (204 colonne), si legge a pezzi.
COESIONE = {
    "sep": ";",
    "encoding": "utf-8",
    "chunk": 250_000,
    "colonne": [
        "COD_LOCALE_PROGETTO", "CUP", "OC_TITOLO_PROGETTO", "OC_COD_CICLO", "OC_TEMA_SINTETICO",
        "CUP_DESCR_NATURA", "CUP_DESCR_SETTORE", "OC_FINANZ_TOT_PUB_NETTO", "TOT_PAGAMENTI",
        "OC_STATO_PROGETTO", "OC_DATA_INIZIO_PROGETTO", "OC_DATA_FINE_PROGETTO_EFFETTIVA",
        "COD_COMUNE", "OC_LINK", "OC_FLAG_VISUALIZZAZIONE",
    ],
}
