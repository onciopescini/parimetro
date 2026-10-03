# mappa-3d-bilanci · pipeline dei dati

Scarica i dati pubblici sui comuni italiani, li porta in un Postgres/PostGIS e li
esporta come file JSON statici. Il sito che li mostra sta nell'altro repository
(`mappa-bilanci`): qui c'è solo la parte che prepara i dati.

```
fonti ufficiali ──► etl/ (Python) ──► Postgres+PostGIS ──► 05_esporta_statico.py ──► public/dati/*.json ──► sito
  ISTAT, SIOPE                          (l'officina)                                                       (statico)
```

Il database serve **solo a chi prepara i dati**: online non gira nessun server. Il
modo di montarlo è in `mappa-bilanci/selfhost/`.

## Cosa c'è

| | |
|---|---|
| `etl/01_import_boundaries.py` | confini comunali ISTAT (via `ogr2ogr`) e nomi di regione e provincia |
| `etl/02_import_population.py` | popolazione residente per comune e anno |
| `etl/04_import_siope.py` | bilanci di **cassa** da SIOPE: incassi e pagamenti |
| `etl/03_import_bdap.py` | bilanci di **competenza** da OpenBDAP, per quando saranno disponibili in blocco |
| `etl/05_esporta_statico.py` | scrive i JSON che legge il sito |
| `etl/scarica_siope.py`, `carica_anni.ps1` | scarico dei CSV SIOPE e caricamento di più anni di fila |
| `etl/tests/` | test: `python -m pytest` |

## Cassa o competenza: la scelta che condiziona tutto

I bilanci per singolo comune di **competenza** (accertamenti e impegni) dal 2016 in poi non
sono scaricabili in blocco da nessuna fonte pubblica: il catalogo open data BDAP si ferma al
2015, OpenBDAP espone solo aggregati regionali e il Ministero dell'Interno un ente alla
volta. **SIOPE** invece copre 2014-2026 comune per comune, ma è contabilità di **cassa**.

Ne discende che `surplus_deficit` è un saldo di cassa e non il risultato di amministrazione;
che `debt_total` e `commitments` restano NULL; e che l'indice mostrato dal sito è un rango
relativo dentro la fascia demografica (`refresh_fhi()`), non un giudizio sulla salute
finanziaria. Il sito lo dichiara all'utente.

## Licenza dei dati

Il codice sarà sotto licenza MIT. **I dati no**: questo repository non ne distribuisce, li
scarica dalle fonti, ciascuna con la propria licenza (confini e popolazione ISTAT, SIOPE
tramite BDAP). Chi li ripubblica deve rispettarle.

## Test

```bash
cd etl && pip install -r requirements.txt -r requirements-dev.txt
python -m pytest
```

I test sui dati caricati (`tests/test_dati_db.py`) richiedono un database e si saltano da
soli senza `TEST_DATABASE_URL`.
