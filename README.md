# Parimetro

**An interactive 3D map of how every Italian municipality spends public money** — and how
it compares with towns of the same size. Open data in, a static website out.

Live: <https://parimetro.pages.dev> · 🇮🇹 [Leggi in italiano](README.it.md)

## What it does

- A 3D map of ~7,900 municipalities: height and colour follow two metrics you choose.
- Click a town: history, comparison with **peer towns** (same population band), and a
  **spending breakdown** by area (waste, roads, schools, social services…) down to the
  individual line item.
- A **relative index** (0–100): where a town stands among towns of its own size — not a
  grade of its management.
- The **income of the people who live there** (IRPEF, from the Ministry of Finance), next to the
  town's spending, with the same peer comparison.
- **Public works and the recovery plan (PNRR)**: which PNRR projects the town itself runs and which
  cohesion-policy works were built there, per inhabitant and against peers.
- **How the town buys**: tenders issued by the municipality (ANAC), the share of direct awards against
  peers, the biggest lots — with the caveats about the 2024 break and unreliable amounts spelled out.
- Rankings (financial health, own revenue, per-capita spending and revenue, average income, PNRR and cohesion funds per inhabitant), search, shareable deep links.
- An **AI chat** where the model never produces numbers: it only picks one of seven
  pre-defined questions and narrates a result that this code computed
  ([how](docs/chat.md)). Every answer comes with a table you can export as CSV.

## Honesty about the data

The figures are **cash** (money actually collected and paid, from SIOPE), not accrual
accounting — they will not match a town's official budget statement. Some spending is
recorded under generic items ("other services") and cannot be assigned to a service; the
site shows how much, for every town. See [`NOTICE`](NOTICE) for sources and licenses.

## How it is built

```
ISTAT + BDAP/SIOPE open data
        │  etl/  (Python)            downloads, cleans, classifies each spending line
        ▼
   PostgreSQL + PostGIS               local "workshop" database, db/migrations/
        │  etl/05_esporta_statico.py  exports ~14,000 small JSON files
        ▼
   web/  (Next.js, static export)    deck.gl map, Recharts, no server
        │
        ▼
   Cloudflare Pages  (+ one Function for the AI chat)
```

The database is **only a local workshop**: nothing runs online except static files. That
makes hosting nearly free and the site very fast. See [`docs/architecture.md`](docs/architecture.md).

| Directory | What is in it |
|---|---|
| `web/` | The Next.js site, the chat engine (`web/lib/chat`) and its Pages Function |
| `etl/` | The data pipeline and its tests |
| `db/` | SQL migrations (schema, ranking, spending-by-category) |
| `selfhost/` | Docker Compose + scripts to run the database workshop and publish |
| `docs/` | Architecture, data contract, chat design, how to adapt it to your country |

## Try it in 2 minutes (no database)

```bash
cd web
npm install
npm run fixture   # 7 clearly fake towns in web/public/dati
npm run dev       # http://localhost:3000
```

## Run it with real data

See [`etl/README.md`](etl/README.md) (data pipeline) and [`selfhost/README.md`](selfhost/README.md)
(database, publishing). Roughly: a Postgres with PostGIS, `pip install -r etl/requirements.txt`,
import boundaries → population → SIOPE years, export, build.

## Tests

```bash
cd web && npm test                 # vitest
cd etl && python -m pytest         # set TEST_DATABASE_URL to also run the SQL tests
```

CI runs both on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Use it for your own country

This stack is meant to be reused: another country's budget open data can feed the same
pipeline. [`docs/adapting-to-your-country.md`](docs/adapting-to-your-country.md) explains
what to replace and what to keep.

## Contributing & license

Contributions are welcome — read [`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues:
[`SECURITY.md`](SECURITY.md). **Code: [MIT](LICENSE). Published data: CC BY-SA 4.0** (it includes ANAC
procurement data, which is share-alike) — sources and attributions in [`NOTICE`](NOTICE).
