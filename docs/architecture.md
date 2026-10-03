# Architecture

## The idea: a database that is not online

Everything the public sees is a pile of static JSON files plus a Next.js static export. The
PostgreSQL/PostGIS database is a **workshop** on your own machine: you import the open data,
compute the index and the per-category aggregates in SQL, export JSON, and publish. Nothing
queries a database at request time.

Why: hosting costs almost nothing (Cloudflare Pages free tier), there is no server to keep
alive or attack, pages are fast, and anyone can reproduce the site from public sources.

Limits you should know: Cloudflare Pages accepts at most 20,000 files per deployment (we use
~14,000) and 25 MiB per file. If you add more data, group per-entity detail by province or
region instead of one file per entity, or move bulky detail to object storage.

## Pipeline

| Step | Script | Notes |
|---|---|---|
| 1 | `etl/01_import_boundaries.py` | ISTAT shapefile → PostGIS (needs `ogr2ogr`) |
| 2 | `etl/02_import_population.py` | ISTAT resident population per year |
| 3 | `etl/04_import_siope.py` | SIOPE cash flows per municipality, all line items |
| – | `etl/categorie_spesa.py` | hand-written mapping line item → spending area / nature |
| – | `etl/fusioni.py` | municipal mergers: predecessors summed into the successor |
| 4 | `etl/06_import_irpef.py` | MEF IRPEF income per municipality and tax year (`scarica_irpef.py` downloads it) |
| 5 | `etl/05_esporta_statico.py` | writes `web/public/dati/**` |
| – | `db/migrations/*.sql` | schema, `refresh_fhi()`, spending-by-category, rankings |

`etl/03_import_bdap.py` is an alternative importer for accrual-basis (competenza) data, kept
for when a source becomes available.

## Accounting choices (read before trusting a number)

- **Cash, not accrual.** SIOPE publishes collections and payments. Amounts are *cumulative
  from January*: the annual figure is the last available month, never the sum of months.
- Excluded from totals: suspended items (title 0), treasury advances and third-party
  accounts (titles 5/7/9). Loan proceeds and repayments stay in the totals but are stored
  apart (`loans_in`, `loans_out`).
- **The rank (0–100)** is a percentile among municipalities of the same population band,
  combining financial autonomy and the *operating* balance (cash balance net of loans).
  It is relative, not an absolute health score.
- A municipality with payments but no collections in a year has **missing** revenue (NULL),
  not zero.
- A single item above 40% of a year's payments is flagged as *concentrated spending*
  (typically a one-off investment): its per-capita figure is not comparable.
- **Income (IRPEF).** The headline figure is the *taxable income per taxpayer*. Cells with few
  taxpayers are hidden by the publisher (statistical secrecy), mostly the high income brackets and
  some income categories in small towns, so a "total income" rebuilt from brackets would be
  systematically too low there. Taxable income and the taxpayer count are never hidden. Where a town
  has fewer than 100 taxpayers the site warns that its average is unstable.
- Spending areas are an editorial classification (`etl/categorie_spesa.py`). Generic items
  stay in "not attributable" and the share is shown for every town.

## Data contract between `etl/` and `web/`

The exporter writes file names that the site recomputes (slugs, ranking paths). If the two
disagree the page silently stays empty, so both sides are tested against **one** set of
tables: `web/tests/fixtures/{slug-cases,classifica-cases}.json` (read by vitest and by
`etl/tests/test_contratto_con_il_sito.py`). Postgres `numeric` values are serialised as JSON
*strings*; the site converts them with `Number()`.

```
dati/anni.json                      years available
dati/nazionale.json                 national averages per year
dati/indice.json                    search index (code, name, province, population, lon, lat)
dati/comuni-{year}.json             GeoJSON for the map
dati/province-{year}.json           province aggregates
dati/classifiche/filtri-{year}.json filters for the rankings
dati/classifiche/{year}/...json     one file per ranking combination
dati/comune/{istat}.json            history + peers + spending categories + income, per year
```
