# ETL · dal dato ufficiale al sito

Riempie `municipalities` e `budget_records` con i dati veri di ~7.900 comuni e poi esporta
tutto come JSON statici. Panoramica e motivi delle scelte: `../README.md`.

## Prerequisiti

- Python 3.10+ e GDAL (`ogr2ogr`): macOS `brew install gdal` · Ubuntu `sudo apt install gdal-bin`.
  Su Windows senza OSGeo4W: `ogr2ogr-shim/` espone `ogr2ogr` come eseguibile che inoltra a
  Docker (`pip install ./ogr2ogr-shim`).
- `pip install -r requirements.txt` (e `requirements-dev.txt` per i test)
- Un Postgres con PostGIS e le migrazioni applicate (`mappa-bilanci/db/migrations`, vedi
  `mappa-bilanci/selfhost/`). Poi `cp .env.example .env` e compila `DATABASE_URL`.

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

# 4 · Esporta per il sito
python 05_esporta_statico.py --dest ../../mappa-bilanci/public/dati
```

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
| `test_istat.py` | intestazione con a-capo, riga di titolo, riga-totale 999 |
| `test_contratto_con_il_sito.py` | che esportatore e sito calcolino gli stessi nomi di file |
| `test_dati_db.py` | confini delle fasce e invarianti sui dati (richiede `TEST_DATABASE_URL`) |

`tests/fixtures/*.json` esistono in copia identica in `mappa-bilanci/tests/fixtures/`; un test
verifica che restino uguali.
