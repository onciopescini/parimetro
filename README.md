# mappa-bilanci

Mappa 3D interattiva dei bilanci dei comuni italiani: altezza e colore di ogni comune
seguono due metriche a scelta, e cliccando si apre il dettaglio con storico, confronto
con i comuni della stessa fascia demografica e classifiche.

Il sito è **interamente statico** (`output: "export"`): online non gira nessun server né
database. Legge file JSON da `public/dati/`, prodotti dalla pipeline nell'altro repository
(`mappa-3d-bilanci/etl`).

## Provarlo senza i dati veri

```bash
npm install
npm run fixture   # genera 7 comuni finti in public/dati (cartella ignorata da git)
npm run dev       # http://localhost:3000
```

I comuni della fixture sono inventati e con nomi volutamente finti: non scambiarli per dati.
La fixture riusa `slug()` e `percorsoClassifica()` del sito, quindi non può divergere dai
nomi di file che la pagina cerca.

## Con i dati veri

Si prepara con la pipeline ETL (`mappa-3d-bilanci/etl/README.md`) e si esporta qui:

```bash
python 05_esporta_statico.py --dest ../../mappa-bilanci/public/dati
```

Poi `selfhost/pubblica.sh` fa export, build e deploy su Cloudflare Pages. Come montare il
database dell'officina: `selfhost/README.md`.

## Sviluppo

```bash
npm test          # 38 test (vitest)
npm run lint
npx tsc --noEmit
npm run build     # produce out/
```

`predev` e `prebuild` copiano in `public/maplibre/` i file del worker di maplibre-gl: la
versione 6 è solo ESM e Turbopack sposta il codice in chunk diversi, quindi senza questo la
mappa base non si disegna ("Worker failed to load").

## Com'è fatto

| | |
|---|---|
| `app/page.tsx` | stato della vista (nella query string: ogni schermata è un link), ricerca, classifiche |
| `components/map/Map3D.tsx` | mappa deck.gl con estrusione a due metriche e due livelli di dettaglio |
| `components/drawer/BudgetDrawer.tsx` | dettaglio di un comune: KPI, confronto, grafici, alert |
| `components/ranking/RankingPanel.tsx` | classifiche per fascia e regione |
| `components/drawer/SpesaPerCategoria.tsx` | tab "Spese": aree funzionali vs mediana dei simili, nature, voci più pesanti |
| `lib/categorie.ts` | etichette e tipi delle categorie (le chiavi sono testate contro `etl/categorie_spesa.py`) |
| `lib/dati.ts` | **unico** posto che conosce i percorsi dei file di dati |
| `db/migrations/` | schema e funzioni del database dell'officina |
| `tests/fixtures/` | tabelle condivise con l'ETL: stessi slug, stessi nomi di file |

## Cosa tenere a mente

- **I dati sono di cassa** (SIOPE): incassi e pagamenti, non accertamenti e impegni. Il sito lo
  dichiara. Il "rango" è la posizione del comune tra quelli della sua fascia demografica,
  non un giudizio sulla salute finanziaria.
- **`lib/dati.ts` e `etl/05_esporta_statico.py` devono calcolare gli stessi nomi di file.**
  Lo garantiscono le fixture condivise, presenti in copia identica nei due repository.
- Pages accetta al massimo 20.000 file per deploy.
