# Parimetro

**Una mappa 3D interattiva di come ogni comune italiano spende i soldi pubblici**, e di come
si colloca rispetto ai comuni della sua taglia. Dati aperti in ingresso, un sito statico in uscita.

Online: <https://parimetro.pages.dev> · 🇬🇧 [Read in English](README.md)

## Cosa fa

- Una mappa 3D di ~7.900 comuni: altezza e colore seguono due metriche a scelta.
- Cliccando un comune: storico, confronto con i **comuni simili** (stessa fascia di popolazione)
  e **spesa per categoria** (rifiuti, strade, scuole, sociale…) fino alla singola voce.
- Un **indice relativo** (0–100): dove sta il comune fra quelli della sua taglia. Non è un voto
  alla gestione.
- Il **reddito di chi ci vive** (IRPEF, dal Ministero delle Finanze) accanto alla spesa del comune,
  con lo stesso confronto con i simili.
- **Opere pubbliche e PNRR**: quali progetti del PNRR gestisce il comune e quali opere di coesione sono
  state fatte sul suo territorio, per abitante e rispetto ai simili.
- Classifiche, ricerca, link condivisibili.
- Una **chat AI** in cui il modello non produce mai numeri: sceglie una di sei domande
  previste e racconta un risultato calcolato dal codice ([come](docs/chat.md)). Ogni risposta
  ha una tabella esportabile in CSV.

## Onestà sui dati

I numeri sono **di cassa** (soldi incassati e pagati davvero, da SIOPE), non di competenza: non
coincidono con il rendiconto del comune. Una parte della spesa è registrata con voci generiche
("altri servizi") e non si può attribuire a un servizio; il sito dice quanta, per ogni comune.
Fonti e licenze in [`NOTICE`](NOTICE).

## Com'è fatto

```
Dati aperti ISTAT + BDAP/SIOPE
        │  etl/  (Python)            scarica, pulisce, classifica ogni voce di spesa
        ▼
   PostgreSQL + PostGIS               database "officina" locale, db/migrations/
        │  etl/05_esporta_statico.py  esporta ~14.000 piccoli file JSON
        ▼
   web/  (Next.js, export statico)   mappa deck.gl, Recharts, nessun server
        │
        ▼
   Cloudflare Pages  (+ una Function per la chat AI)
```

Il database è **solo un'officina locale**: online girano solo file statici. Hosting quasi gratis
e sito velocissimo. Dettagli in [`docs/architecture.md`](docs/architecture.md).

| Cartella | Contenuto |
|---|---|
| `web/` | Il sito Next.js, il motore della chat (`web/lib/chat`) e la sua Pages Function |
| `etl/` | La pipeline dei dati e i suoi test |
| `db/` | Migrazioni SQL (schema, indice, spesa per categoria) |
| `selfhost/` | Docker Compose e script per l'officina dati e la pubblicazione |
| `docs/` | Architettura, contratto sui dati, chat, come adattarlo al tuo paese |

## Provarlo in 2 minuti (senza database)

```bash
cd web
npm install
npm run fixture   # 7 comuni volutamente finti in web/public/dati
npm run dev       # http://localhost:3000
```

## Con i dati veri

[`etl/README.md`](etl/README.md) (pipeline) e [`selfhost/README.md`](selfhost/README.md)
(database e pubblicazione): un Postgres con PostGIS, `pip install -r etl/requirements.txt`,
import di confini → popolazione → anni SIOPE, export, build.

## Test

```bash
cd web && npm test                 # vitest
cd etl && python -m pytest         # con TEST_DATABASE_URL esegue anche i test SQL
```

## Usalo per il tuo paese

Lo stack è pensato per essere riusato: i dati di bilancio di un altro paese possono alimentare la
stessa pipeline. [`docs/adapting-to-your-country.md`](docs/adapting-to-your-country.md) spiega cosa
sostituire e cosa tenere.

## Contribuire e licenza

I contributi sono benvenuti: leggi [`CONTRIBUTING.md`](CONTRIBUTING.md). Problemi di sicurezza:
[`SECURITY.md`](SECURITY.md). Codice: [MIT](LICENSE). Dati: vedi [`NOTICE`](NOTICE).
