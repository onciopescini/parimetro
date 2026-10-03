# ETL · dal dato ufficiale al sito

Riempie `municipalities` e `budget_records` con i dati veri di ~7.900 comuni e poi esporta
tutto come JSON statici. Panoramica e motivi delle scelte: `../README.md`.

## Prerequisiti

- Python 3.10+ e GDAL (`ogr2ogr`): macOS `brew install gdal` · Ubuntu `sudo apt install gdal-bin`.
  Su Windows senza OSGeo4W: `ogr2ogr-shim/` espone `ogr2ogr` come eseguibile che inoltra a
  Docker (`pip install ./ogr2ogr-shim`).
  Con `OGR2OGR_BACKEND=wsl` lo script chiama invece l'`ogr2ogr` installato nella WSL
  (`sudo apt install gdal-bin`) tramite `wsl.exe`: più semplice, e non passa da un `.exe`
  generato da pip, che un criterio di controllo delle applicazioni può bloccare
  (WinError 4551).
- `pip install -r requirements.txt` (e `requirements-dev.txt` per i test)
- Un Postgres con PostGIS: Docker (`selfhost/`) oppure un cluster nella WSL
  (attenzione alle porte: su una macchina Windows con un PostgreSQL già installato la 5432
  è occupata, ne serve un'altra). Poi `cp .env.example .env`, compila `DATABASE_URL` e applica
  lo schema, senza bisogno di `psql`:

  ```bash
  python applica_migrazioni.py
  ```

## Le fonti

1. **Confini comunali** — ISTAT, "Confini delle unità amministrative a fini statistici",
   versione **generalizzata** (`_g`): pesa ~10 volte meno e per il web è identica.
   Serve `Com01012025_g_WGS84.shp` con .dbf/.shx/.prj.
2. **Elenco comuni** — ISTAT, `Elenco-comuni-italiani.csv`: i nomi di regione e provincia.
3. **Popolazione** — demo.istat.it, POSAS "Popolazione residente per età, sesso e stato
   civile", CSV dei comuni: uno per ogni anno.
4. **Bilanci** — SIOPE (cassa) tramite il catalogo open data BDAP; vedi `scarica_siope.py`.

## Ordine dei comandi

```bash
# 1 · Confini + nomi (una volta per millesimo)
python 01_import_boundaries.py Com01012025_g_WGS84.shp Elenco-comuni-italiani.csv

# 2 · Popolazione (una volta per anno)
python 02_import_population.py POSAS_2024_it_Comuni.csv --year 2024

# 3 · Bilanci SIOPE: scarica i 40 file (20 regioni x entrate/spese) e importa
python scarica_siope.py --anno 2024 --dest ./siope_2024
python 04_import_siope.py --dir ./siope_2024 --year 2024

# 4 · Redditi IRPEF per comune (MEF, un file da ~1 MB per anno d'imposta)
python scarica_irpef.py --dest ../../etl-data/irpef --da 2020 --a 2024
python 06_import_irpef.py --dir ../../etl-data/irpef

# 5 · Investimenti: PNRR e opere di coesione (~560 MB da scaricare, 3 file)
python scarica_investimenti.py --dest ../../etl-data
python 07_import_pnrr.py --csv ../../etl-data/pnrr/PNRR_Progetti.csv --ipa ../../etl-data/pnrr/ipa_enti.xlsx
python 08_import_coesione.py --zip ../../etl-data/oc/progetti_esteso.zip

# 6 · Appalti dei comuni (ANAC, ~2,7 GB per il 2020-2024)
python scarica_anac.py --dest ../../etl-data/anac/cig --da 2020 --a 2024
python 09_import_anac.py --dir ../../etl-data/anac/cig --ipa ../../etl-data/pnrr/ipa_enti.xlsx

# 7 · Esporta per il sito
python 05_esporta_statico.py --dest ../web/public/dati
```

### Spesa per categoria e prestiti

`04_import_siope.py` carica anche il **dettaglio per voce** della spesa (`budget_items`, piano
dei conti `U\d{10}`). Ogni voce e' classificata da `categorie_spesa.py` in una *natura* (dalla
gerarchia del codice) e in un'*area* funzionale (tabella scritta a mano, in repo, verificabile).
Dopo ogni import si guarda la percentuale che resta in "non attribuibile". Ritoccata la
tabella: `python riclassifica_voci.py` riapplica le regole al database senza reimportare nulla.

I prestiti (accensione tra gli incassi, rimborso tra i pagamenti) restano nei totali ma sono
salvati a parte (`loans_in`, `loans_out`): il rango usa il saldo **di gestione** senza di loro.
Per riempirli su un anno gia' caricato bastano gli entrate: `04_import_siope.py --dir ... --year
2024 --solo-prestiti`. Se un comune ha spese ma nessun incasso, le entrate sono *dato mancante*
(NULL), non zero.

Più anni di fila, cancellando i CSV man mano (ogni esercizio pesa ~3 GB): `carica_anni.ps1`.
Gli import sono sicuri da rilanciare: tutto è upsert. Dopo ogni import l'indice si ricalcola
da solo (`refresh_fhi`); l'esportatore **cancella e rigenera** `public/dati`, perché un
file vecchio che sopravvive sarebbe un dato falso servito online.

## Il workflow anti-sorprese: `--inspect`

Gli open data italiani cambiano intestazioni tra un millesimo e l'altro. Ogni script ha:

```bash
python 04_import_siope.py --inspect entrate_Molise.csv
```

Stampa encoding, separatore, colonne e prime righe. Se un import fallisce per "colonne non
trovate": `--inspect` → correggi la mappatura in `config.py` → rilancia.

## Le trappole già incontrate

Ciascuna è costata un errore vero ed è coperta da un test in `tests/`.

- **ISTAT, Elenco comuni**: il nome di una colonna contiene un a-capo letterale.
- **ISTAT, POSAS**: una riga di titolo prima dell'intestazione; il totale del comune è la
  riga con età `999`, non la somma delle età.
- **ISTAT, shapefile**: il DBF dichiara `shape_area` come `numeric(18,11)` ma ci mette valori
  a 8 cifre intere, e la COPY va in overflow (per questo `-select` sui soli campi utili).
- **SIOPE, importi cumulati**: sono progressivi da gennaio. Sommare i dodici mesi gonfia i
  valori di ~6 volte; il totale annuo è il mese più alto.
- **SIOPE, enti**: nei file ci sono anche province, unioni e comunità montane (si tiene solo
  `CO`), con una vecchia codifica dei titoli a 5 caratteri.
- **SIOPE, titolo 0**: sono incassi e pagamenti *da regolarizzare*, non entrate: restano fuori
  dai totali, altrimenti gonfiano il denominatore dell'autonomia finanziaria.
- **SIOPE, URL**: nel catalogo sono in `http` ma la connessione cade; vanno forzati a `https`.
- **WAF di ANAC** (per le fonti future): risponde HTTP 200 con una pagina "Request Rejected" a
  un User-Agent non da browser. Controllare il tipo di contenuto, non il codice di stato.

## Test

```bash
python -m pytest
```

| File | Cosa protegge |
|---|---|
| `test_siope.py` | cumulati, filtro sui comuni, esclusione dei sospesi |
| `test_categorie_spesa.py` | tabella voce -> area/natura, prefisso piu' lungo, voci generiche non indovinate |
| `test_categorie_db.py` | confronto tra pari, schede per comune, rango al netto dei prestiti (esercizio fittizio 2099) |
| `test_istat.py` | intestazione con a-capo, riga di titolo, riga-totale 999 |
| `test_contratto_con_il_sito.py` | che esportatore e sito calcolino gli stessi nomi di file |
| `test_dati_db.py` | confini delle fasce e invarianti sui dati (richiede `TEST_DATABASE_URL`) |

Le tabelle del contratto con il sito (`slug-cases.json`, `classifica-cases.json`) stanno in
**una sola copia**, `web/tests/fixtures/`: le leggono sia questi test sia quelli TypeScript.
