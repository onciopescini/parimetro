// ============================================================
// /api/geo-budget
// Sostituto locale della Edge Function Supabase `geo-budget`.
// Espone lo STESSO contratto (lod=municipalities|provinces) più
// due lod di comodo per il drawer (history, national), così
// Map3D e BudgetDrawer girano identici senza backend.
//
// Quando .env.local ha le chiavi Supabase, app/page.tsx smette
// di chiamare questa route e usa la Edge Function vera.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { budgetFor, historyFor, DEMO_YEARS } from "@/lib/demo-budget";

export const runtime = "nodejs";

interface Static {
  istat: string;
  name: string;
  region: string;
  province: string;
  population: number;
}

interface Feature {
  type: "Feature";
  geometry: unknown;
  properties: Static;
}

interface ProvinceSeed {
  province: string;
  region: string;
  lon: number;
  lat: number;
  population: number;
}

const DATA = path.join(process.cwd(), "data");

let geoCache: { type: string; features: Feature[] } | null = null;
let provCache: ProvinceSeed[] | null = null;

class DatiMancanti extends Error {}

function leggi(file: string) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
  } catch {
    throw new DatiMancanti(
      `data/${file} non trovato. Rigeneralo con: node scripts/build-demo-data.mjs`,
    );
  }
}

function geo() {
  if (!geoCache) geoCache = leggi("comuni.geo.json");
  return geoCache!;
}

function provinceSeeds() {
  if (!provCache) provCache = leggi("province.json");
  return provCache!;
}

// Le risposte pesano ~12 MB: serializzo una volta per anno.
const municipalitiesByYear = new Map<number, string>();
const provincesByYear = new Map<number, string>();

function municipalitiesJson(year: number) {
  const hit = municipalitiesByYear.get(year);
  if (hit) return hit;
  const fc = {
    type: "FeatureCollection",
    features: geo().features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { ...f.properties, ...budgetFor(f.properties.istat, f.properties.population, year) },
    })),
  };
  const json = JSON.stringify(fc);
  if (municipalitiesByYear.size > 2) municipalitiesByYear.clear();
  municipalitiesByYear.set(year, json);
  return json;
}

function provincesJson(year: number) {
  const hit = provincesByYear.get(year);
  if (hit) return hit;

  const agg = new Map<
    string,
    { revenue: number; expenditure: number; debt: number; surplus: number; pop: number; fhi: number; n: number }
  >();

  for (const f of geo().features) {
    const { istat, population, province } = f.properties;
    const b = budgetFor(istat, population, year);
    const a =
      agg.get(province) ??
      { revenue: 0, expenditure: 0, debt: 0, surplus: 0, pop: 0, fhi: 0, n: 0 };
    a.revenue += b.revenue_total;
    a.expenditure += b.expenditure_total;
    a.debt += b.debt_total;
    a.surplus += b.surplus_deficit;
    a.pop += population;
    a.fhi += b.fhi;
    a.n += 1;
    agg.set(province, a);
  }

  const rows = provinceSeeds().map((p) => {
    const a = agg.get(p.province);
    const pop = Math.max(a?.pop ?? p.population, 1);
    return {
      province: p.province,
      region: p.region,
      lon: p.lon,
      lat: p.lat,
      population: pop,
      revenue_total: a?.revenue ?? 0,
      expenditure_total: a?.expenditure ?? 0,
      debt_total: a?.debt ?? 0,
      surplus_deficit: a?.surplus ?? 0,
      revenue_pc: Math.round((a?.revenue ?? 0) / pop),
      expenditure_pc: Math.round((a?.expenditure ?? 0) / pop),
      debt_pc: Math.round((a?.debt ?? 0) / pop),
      fhi: a?.n ? Math.round(a.fhi / a.n) : 0,
    };
  });

  const json = JSON.stringify(rows);
  if (provincesByYear.size > 2) provincesByYear.clear();
  provincesByYear.set(year, json);
  return json;
}

const asJson = (body: string) =>
  new NextResponse(body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lod = searchParams.get("lod") ?? "municipalities";
  const year = Number(searchParams.get("year")) || DEMO_YEARS[DEMO_YEARS.length - 2];

  try {
    return handle(lod, searchParams, year);
  } catch (e) {
    if (e instanceof DatiMancanti) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
}

/**
 * Punto su cui portare la camera: media dei vertici dell'anello esterno
 * dell'anello più grande. Non è il point-on-surface esatto che usa PostGIS
 * lato Supabase, ma per centrare un comune nella vista basta e avanza.
 */
function puntoDi(geometry: unknown): [number, number] {
  const g = geometry as { type: string; coordinates: number[][][] | number[][][][] };
  const anelli: number[][][] =
    g.type === "MultiPolygon"
      ? (g.coordinates as number[][][][]).map((poly) => poly[0])
      : [(g.coordinates as number[][][])[0]];
  const piuGrande = anelli.reduce((a, b) => (b.length > a.length ? b : a), anelli[0]);
  let lon = 0;
  let lat = 0;
  for (const [x, y] of piuGrande) {
    lon += x;
    lat += y;
  }
  return [lon / piuGrande.length, lat / piuGrande.length];
}

function cerca(q: string) {
  const termine = q.trim().toLowerCase();
  if (termine.length < 2) return [];

  const punteggio = (f: Feature) => {
    const nome = f.properties.name.toLowerCase();
    if (f.properties.istat === termine) return 0; // codice esatto
    if (nome.startsWith(termine)) return 1; // inizia col termine
    if (nome.includes(" " + termine)) return 2; // inizio di una parola
    return 99;
  };

  return geo()
    .features.map((f) => ({ f, p: punteggio(f) }))
    .filter((x) => x.p < 99)
    .sort((a, b) => a.p - b.p || b.f.properties.population - a.f.properties.population)
    .slice(0, 8)
    .map(({ f }) => {
      const [lon, lat] = puntoDi(f.geometry);
      return { ...f.properties, lon, lat };
    });
}

/** Stessa scala di fascia_demografica() lato Supabase: vanno tenute allineate. */
function fasciaDi(pop: number): string {
  if (!pop || pop < 1000) return "sotto 1.000 abitanti";
  if (pop < 5000) return "da 1.000 a 5.000 abitanti";
  if (pop < 20000) return "da 5.000 a 20.000 abitanti";
  if (pop < 60000) return "da 20.000 a 60.000 abitanti";
  if (pop < 250000) return "da 60.000 a 250.000 abitanti";
  return "oltre 250.000 abitanti";
}

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const percentile = (v: number[], x: number) =>
  v.length ? Math.round((100 * v.filter((n) => n <= x).length) / v.length) : null;

/** Speculare a get_peer_comparison(): mediane della fascia demografica. */
function peers(istat: string, year: number) {
  const io = geo().features.find((f) => f.properties.istat === istat);
  if (!io) return null;
  const fascia = fasciaDi(io.properties.population);

  const rpc: number[] = [];
  const epc: number[] = [];
  const dpc: number[] = [];
  const fhi: number[] = [];
  for (const f of geo().features) {
    const pop = f.properties.population;
    if (fasciaDi(pop) !== fascia || !pop) continue;
    const b = budgetFor(f.properties.istat, pop, year);
    rpc.push(b.revenue_total / pop);
    epc.push(b.expenditure_total / pop);
    dpc.push(b.debt_total / pop);
    fhi.push(b.fhi);
  }

  const mio = budgetFor(istat, io.properties.population, year);
  const pop = io.properties.population;
  return {
    fascia,
    n: rpc.length,
    revenue_pc: mediana(rpc),
    expenditure_pc: mediana(epc),
    debt_pc: mediana(dpc),
    fhi: Math.round(mediana(fhi) ?? 0),
    pct_revenue: percentile(rpc, mio.revenue_total / pop),
    pct_expenditure: percentile(epc, mio.expenditure_total / pop),
    pct_fhi: percentile(fhi, mio.fhi),
  };
}

function handle(lod: string, searchParams: URLSearchParams, year: number) {
  if (lod === "municipalities") return asJson(municipalitiesJson(year));
  if (lod === "provinces") return asJson(provincesJson(year));

  // Speculare alla RPC get_available_years() su Supabase: il selettore
  // dell'esercizio si costruisce dai dati, non da un elenco cablato.
  if (lod === "years") return NextResponse.json([...DEMO_YEARS]);

  // Speculare a search_municipalities(): stessa forma di risposta, così la
  // barra di ricerca e il ripristino da deep link non sanno quale sorgente
  // hanno sotto. Accetta il nome o il codice ISTAT.
  if (lod === "search") return NextResponse.json(cerca(searchParams.get("q") ?? ""));

  if (lod === "peers") {
    const r = peers(searchParams.get("istat") ?? "", year);
    if (!r) return NextResponse.json({ error: "comune non trovato" }, { status: 404 });
    return NextResponse.json(r);
  }

  if (lod === "history") {
    const istat = searchParams.get("istat");
    const f = geo().features.find((x) => x.properties.istat === istat);
    if (!f) return NextResponse.json({ error: "comune non trovato" }, { status: 404 });
    return NextResponse.json(historyFor(f.properties.istat, f.properties.population));
  }

  if (lod === "national") {
    let revenue = 0;
    let expenditure = 0;
    let debt = 0;
    let pop = 0;
    let fhi = 0;
    for (const f of geo().features) {
      const b = budgetFor(f.properties.istat, f.properties.population, year);
      revenue += b.revenue_total;
      expenditure += b.expenditure_total;
      debt += b.debt_total;
      pop += f.properties.population;
      fhi += b.fhi;
    }
    const n = geo().features.length;
    return NextResponse.json({
      revenue_pc: Math.round(revenue / pop),
      expenditure_pc: Math.round(expenditure / pop),
      debt_pc: Math.round(debt / pop),
      fhi: Math.round(fhi / n),
    });
  }

  return NextResponse.json({ error: `lod sconosciuto: ${lod}` }, { status: 400 });
}
