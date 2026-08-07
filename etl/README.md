# Modulo ETL · Dati reali (ISTAT + OpenBDAP)

Pipeline in 3 script Python che riempie `municipalities` e `budget_records` con i dati veri di ~7.900 comuni. Il Financial Health Index non va calcolato: lo fa il trigger del database a ogni riga inserita.

## Prerequisiti

- Python 3.10+ e GDAL (`ogr2ogr`): macOS `brew install gdal` · Ubuntu `sudo apt install gdal-bin` · Windows installer OSGeo4W
- Dipendenze: `pip install -r requirements.txt`
- Connessione DB: `cp .env.example .env` e compila `DATABASE_URL`

## I 4 file da scaricare

1. **Confini comunali (shapefile)** — sito ISTAT, cerca "Confini delle unità amministrative a fini statistici". Scarica la versione **generalizzata** (cartella/suffisso `_g`): pesa ~10 volte meno e per il web è identica. Dal zip serve lo shapefile dei comuni, es. `Com01012025_g_WGS84.shp` (tieni insieme anche .dbf/.shx/.prj).
2. **Elenco comuni (CSV)** — sito ISTAT, "Codici statistici delle unità amministrative territoriali": file `Elenco-comuni-italiani.csv`. Serve per i nomi di regione e provincia, che nello shapefile non ci sono.
3. **Popolazione per comune (CSV)** — demo.istat.it, dataset "Popolazione residente al 1° gennaio" (POSAS), CSV per comuni dell'anno che ti serve. Uno per ogni esercizio che caricherai.
4. **Rendiconti (CSV)** — openbdap.rgs.mef.gov.it → sezione open data → cerca i dataset del **rendiconto della gestione** dei comuni: uno per le **entrate** (accertamenti per titolo) e uno per le **spese** (impegni e pagamenti), per ciascun anno. Sono file grandi: gli script li leggono a blocchi.

## Il workflow anti-sorprese: `--inspect`

Gli open data italiani cambiano intestazioni tra un millesimo e l'altro. Per questo ogni script ha una modalità di ispezione:

```bash
python 03_import_bdap.py --inspect entrate_2023.csv
```

Stampa encoding, separatore, elenco colonne e prime righe. Se un import fallisce per "colonne non trovate", il giro è sempre: `--inspect` → correggi la mappatura in `config.py` → rilancia. Due minuti, nessuna modifica al codice.

## Ordine dei comandi

```bash
# 1 · Confini + nomi (una volta per millesimo)
python 01_import_boundaries.py Com01012025_g_WGS84.shp Elenco-comuni-italiani.csv

# 2 · Popolazione (una volta per anno)
python 02_import_population.py POSAS_2023_it_Comuni.csv --year 2023

# 3 · Bilanci (una volta per anno)
python 03_import_bdap.py --entrate entrate_2023.csv --spese spese_2023.csv --year 2023
```

Ripeti 2 e 3 per ogni anno che vuoi coprire (es. 2019→2023). Riesecuzioni sicure: tutto è upsert.

Quando i dati veri sono dentro, elimina i comuni demo:

```sql
delete from municipalities where istat_code like 'DEMO%';
```

## Verifica

```sql
-- Quanti comuni con bilancio per anno, e FHI medio
select year, count(*) as comuni, round(avg(financial_health_score)) as fhi_medio
from budget_records group by year order by year;

-- I 10 comuni più indebitati pro capite dell'ultimo anno
select m.name, b.debt_per_capita, b.financial_health_score
from budget_records b join municipalities m on m.id = b.municipality_id
where b.year = 2023 order by b.debt_per_capita desc nulls last limit 10;
```

Poi ricontrolla la Edge Function: tiene una **cache di 6 ore** per anno, quindi dopo un import massiccio o aspetti il TTL o rideployi (`supabase functions deploy geo-budget --no-verify-jwt`) per svuotarla.

## Cose da sapere

- **Scelte contabili della v1** — anticipazioni e partite di giro sono escluse dai totali (gonfierebbero entrate e spese senza dire nulla sulla gestione); `surplus_deficit` è il saldo accertamenti−impegni (proxy del risultato di competenza); `debt_total` resta NULL finché non si aggiunge il dataset dell'indebitamento — l'FHI è progettato per trattare il dato mancante come neutro, quindi i punteggi restano sensati.
- **Codici non abbinati** — lo script 03 segnala gli enti che non trovano il comune: quasi sempre sono fusioni/soppressioni (il codice ISTAT del rendiconto è di un millesimo diverso dai confini) o enti non comunali finiti nel CSV. Se sono pochi, ignora; se sono centinaia, probabilmente hai confini e bilanci di millesimi troppo distanti.
- **Spazio su Supabase** — con la versione generalizzata dei confini + `geom_simplified` resti in genere dentro i 500 MB del piano free. Se sfori: alza la tolleranza (`--tolerance 0.006`) o valuta il piano Pro.
