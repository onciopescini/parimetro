# Mappa 3D dei Bilanci dei Comuni Italiani

Consegna Moduli 1–3: database Supabase/PostGIS, Edge Function di distribuzione dati e i due componenti React (mappa Deck.gl + drawer analitico).

## Struttura dei file

```
mappa-3d-bilanci/
├── supabase/
│   ├── schema.sql                      → SQL Editor di Supabase
│   └── functions/geo-budget/index.ts   → supabase/functions/geo-budget/index.ts
├── components/
│   ├── map/Map3D.tsx                   → components/map/Map3D.tsx
│   └── drawer/BudgetDrawer.tsx         → components/drawer/BudgetDrawer.tsx
└── README.md
```

Le destinazioni a destra si riferiscono alla root di un progetto Next.js (App Router).

## 1 · Setup del progetto Next.js

```bash
npx create-next-app@latest mappa-bilanci --typescript --tailwind --app
cd mappa-bilanci
npm i deck.gl react-map-gl maplibre-gl recharts framer-motion lucide-react @supabase/supabase-js
```

Crea `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://TUO-PROGETTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Trovi entrambi in Supabase → Settings → API.

## 2 · Database (Modulo 1)

1. Apri l'**SQL Editor** di Supabase e incolla `supabase/schema.sql` per intero, poi esegui. Crea: tabelle + indici PostGIS, funzione e trigger del **Financial Health Index**, le 4 RPC, le policy RLS in sola lettura e **3 comuni demo** (DEMO001–003) con bilanci 2020–2025.
2. Deploya la Edge Function (serve la [CLI Supabase](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy geo-budget --no-verify-jwt
```

3. Test rapido:

```bash
curl "https://TUO-PROGETTO.supabase.co/functions/v1/geo-budget?lod=municipalities&year=2024" --compressed
```

Se torna una FeatureCollection con i 3 comuni demo, la pipeline dati è viva.

## 3 · Frontend (Moduli 2–3)

Copia i due componenti nelle cartelle indicate sopra, poi usa questo `app/page.tsx` per collegarli:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Map3D, { type MunicipalityProps } from "@/components/map/Map3D";
import BudgetDrawer, {
  type MunicipalityDetail,
  type NationalAverages,
} from "@/components/drawer/BudgetDrawer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function Home() {
  const [year] = useState(2024);
  const [detail, setDetail] = useState<MunicipalityDetail | null>(null);
  const [avg, setAvg] = useState<NationalAverages | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSelect(p: MunicipalityProps) {
    const [{ data: history }, { data: nat }] = await Promise.all([
      supabase.rpc("get_municipality_history", { p_istat: p.istat }),
      supabase.rpc("get_national_averages", { p_year: year }),
    ]);
    setDetail({
      istat: p.istat,
      name: p.name,
      region: p.region,
      province: p.province,
      population: p.population,
      history: history ?? [],
    });
    setAvg(nat);
    setOpen(true);
  }

  return (
    <main className="h-dvh w-dvw bg-slate-950">
      <Map3D
        year={year}
        heightMetric="expenditure"
        colorMetric="fhi"
        perCapita
        onSelect={handleSelect}
      />
      <BudgetDrawer
        data={detail}
        year={year}
        nationalAvg={avg}
        open={open}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
```

`npm run dev` → dovresti vedere l'Italia in dark slate con i 3 blocchi demo estrusi; click su un comune → fly-to + drawer con KPI, grafici e alert.

## 4 · Dati reali

**Confini comunali (ISTAT).** Scarica lo shapefile "Confini delle unità amministrative a fini statistici" dal sito ISTAT, poi importalo nel Postgres di Supabase con ogr2ogr (GDAL):

```bash
ogr2ogr -f PostgreSQL \
  PG:"host=db.TUO-PROGETTO.supabase.co port=5432 dbname=postgres user=postgres password=..." \
  Com01012025_WGS84.shp \
  -nln municipalities_raw -t_srs EPSG:4326 -nlt MULTIPOLYGON
```

Poi mappa `municipalities_raw` → `municipalities` (il campo del codice ISTAT nello shapefile è tipicamente `PRO_COM_T`; i nomi variano leggermente per millesimo). Dopo **ogni** import di geometrie rigenera la versione semplificata:

```sql
update municipalities
set geom_simplified = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.004));
```

**Bilanci (OpenBDAP / MEF).** L'ingestione dei rendiconti reali per ~7.900 comuni × anni è il prossimo modulo: una pipeline ETL che scarica da OpenBDAP, normalizza le voci nelle colonne di `budget_records` e fa upsert. Il trigger calcola l'FHI da solo a ogni riga inserita.

## 5 · Note di performance

Il payload dei ~7.900 poligoni passa da decine di MB a pochi MB grazie a semplificazione topologica (0.004°) + gzip; la Edge Function tiene una cache in-memory di 6 ore per LOD × anno e imposta header CDN (24h + stale-while-revalidate). Il LOD scatta a zoom 6.3: sotto vedi colonne provinciali (~107 elementi), sopra i poligoni comunali. Se in futuro servisse ancora più leggerezza, il passo successivo è un tileset vettoriale con `MVTLayer`.

## Correzioni rispetto al master prompt

Nel disegno originale le colonne generate `*_per_capita` leggevano `population` dalla tabella `municipalities`: in Postgres una colonna GENERATED non può riferirsi ad altre tabelle, e comunque la popolazione cambia di anno in anno. Per questo `budget_records` ora porta il proprio snapshot annuale di `population`. Ho inoltre aggiunto le colonne necessarie a FHI e grafici (entrate correnti/conto capitale, entrate proprie, pagamenti e impegni) e spostato il calcolo dell'FHI in un trigger, così qualunque ETL futuro lo ottiene gratis.
