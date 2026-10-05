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
| 5 | `etl/07_import_pnrr.py`, `etl/08_import_coesione.py` | PNRR and cohesion-policy projects per municipality (`scarica_investimenti.py` downloads them) |
| – | `etl/investimenti.py` | links a PNRR implementing body to a municipality (fiscal code, then name; never guesses) |
| 6 | `etl/09_import_anac.py` | tenders (CIG lots) issued by municipalities, ANAC (`scarica_anac.py` downloads them) |
| 7 | `etl/05_esporta_statico.py` | writes `web/public/dati/**` |
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
- **Investments (PNRR, cohesion).** Two separate sources, never added together (they share 74 project codes
  in total). *PNRR*: the file does not say where a project is, only who implements it, so a project is
  attributed to a municipality only when the municipality itself is the implementing body
  (about 84,000 projects, 24 of 171 billion euro); work by RFI, ministries, Regions or health authorities
  on its territory cannot be attributed. *Cohesion*: only projects located in exactly one municipality;
  multi-municipality, provincial and regional projects cannot be split and are left out (a 1.4 billion
  "national" project must not land on a village of 60 people). Names of companies and individuals
  receiving incentives or grants are never published, only counts and amounts.
- **Procurement (ANAC).** One row per lot (CIG) whose buyer is the municipality itself; buyers like health
  authorities, central purchasing bodies or municipal companies are not attributed to a town. *Counts and
  shares are reliable; raw amounts are not*: in one month of municipal lots, 11 of 11,730 made two thirds
  of the total (typing errors, and adhesions to framework agreements whose "value" is the agreement's
  ceiling). So amounts are summed only for lots that are not adhesions and not above 10x the town's
  total annual payments; the others are counted apart and the page says how many. The amount is the
  declared tender value, not what was paid. **The series breaks in 2024** (new procurement code, a CIG
  for micro-purchases too): lots triple, the median value falls from 68,000 to 16,000 euro and direct
  awards go from 73% to 89%. Comparison with peers of the *same year* stays valid; across the break it
  does not. The share of direct awards is only compared among towns with at least 5 lots.
  **Competition** comes from ANAC's awards dataset, for real tenders only (open, restricted, negotiated;
  direct awards have no competition to measure): the share awarded with a single bid and the median
  discount. Impossible values (negative discounts down to -2.8 million, years like 3202) become NULL, the
  year is the lot's publication year, and a town needs 5 tenders with the information to be compared.
  The latest year is incomplete because some tenders are not yet awarded. Winning companies are not used.
- **News (Firecrawl, optional).** One search per town; the *code* keeps only results that name the town and
  mention accounts, taxes, procurement or funds (keywords, not a model), no older than 18 months. Only
  title, source, date and link are stored and shown: no article text, no summaries. Towns with homonyms
  must also name the province. The tab appears only for towns already searched, and says the selection
  is automatic and not verified. The API key is an environment variable, never a file in the repo.
  *Why keywords and not a decision model.* Laya (open-weight decision model, Apache 2.0) was tried zero-shot on
  48 hand-labelled real results (`etl/benchmark/`): 60% accuracy and 26% recall at its default threshold,
  against 77% / 57% for the first version of the keyword rules, which were then improved to 92% / 87% by
  looking at the same examples (so that figure is optimistic). Laya may do better fine-tuned on a larger
  labelled set; that is open. Note that the news search returns nothing for quoted phrases or three
  keywords, so each town gets one plain search per topic.
- Spending areas are an editorial classification (`etl/categorie_spesa.py`). Generic items
  stay in "not attributable" and the share is shown for every town.

## Pages for search engines and AI assistants

The map is a single client-rendered page, which search engines and AI assistants cannot read. Every town also has
a plain HTML page, `/comune/{name}-{ISTAT}`, composed on the fly by a Pages Function from the same JSON the map uses
(`web/lib/pagina/`): text with the numbers and their context (median of similar towns, caveats), JSON-LD (`Place` and
`Dataset` with the CC BY-SA licence and a link to the raw JSON), canonical URL. Around it: `/comuni` (one link per
town, by region), `/sitemap.xml`, `/robots.txt` and `/llms.txt`.

They are functions and not static files because Cloudflare Pages accepts 20,000 files per deployment and the data
export already has about 18,000. Absolute URLs come from the request, so they follow whatever domain is attached.
A wrong name in the URL redirects (301) to the canonical one; an unknown code is a 404 with `noindex`. Free-plan
limit to keep in mind: 100,000 function requests a day (shared with the chat), with a one-day edge cache in front.

## Shareable cards

From a town's panel, "Crea la card da condividere" draws an image in the browser (a `<canvas>`, nothing is sent to
a server) and lets people download it, share it with the system share sheet, copy the page link or send it on
WhatsApp. Three cards: *where the money goes* (every 100 euro, 100 squares, 1080x1080), *three numbers against
similar towns* (1080x1920) and *a question for the town* (1200x630). What goes on a card is decided by pure functions
(`web/lib/card/contenuto.ts`), the drawing by `web/lib/card/disegna.ts`; both are tested without a browser.

Rules that are part of the product: the warning line (cash basis, year, which towns it is compared with, source) is
drawn on every card and cannot be removed; the "question" card picks the spending area that differs most from similar
towns, in either direction, and is not offered when one item weighs 40% or more of the year's spending, because the
per-capita figure is then not comparable; a card is simply unavailable (with the reason) when the data is missing.
Cards never contain the user's name. The wording "non è un'accusa: è una domanda" and the mention of *accesso civico*
should be reviewed by someone with legal competence: until then the "question" card is built and tested but switched
off (`ATTIVE` in `web/components/card/CreaCard.tsx`), so only the first two cards are offered.

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
dati/classifiche/{year}/...json     one file per ranking combination (7 metrics; PNRR/cohesion
                                    rank only towns with at least one project)
dati/comune/{istat}.json            history + peers + spending categories + income + investments + procurement + news
```
