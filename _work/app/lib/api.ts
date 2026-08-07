// ============================================================================
// Client API · chiama la Edge Function `geo-budgets`
// Richiede in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
// ============================================================================

import type { MunicipalityDetail, MuniProps, ProvinceAgg } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FN_URL = `${SUPABASE_URL}/functions/v1/geo-budgets`;

export interface GeoFeature {
  type: "Feature";
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  properties: MuniProps;
}

export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

async function call<T>(params: Record<string, string>): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      "Variabili d'ambiente mancanti: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FN_URL}?${qs}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`geo-budgets ${params.mode} → HTTP ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Poligoni comunali semplificati per zoom, filtrati per bounding box. */
export function fetchGeoPolygons(
  year: number,
  zoom: number,
  bbox?: [number, number, number, number],
): Promise<GeoCollection> {
  const params: Record<string, string> = {
    mode: "polygons",
    year: String(year),
    zoom: String(Math.round(zoom)),
  };
  if (bbox) params.bbox = bbox.map((n) => n.toFixed(4)).join(",");
  return call<GeoCollection>(params);
}

/** Aggregati provinciali per la vista nazionale (colonne 3D). */
export function fetchCentroids(year: number): Promise<ProvinceAgg[]> {
  return call<ProvinceAgg[]>({ mode: "centroids", year: String(year) });
}

/** Dettaglio completo di un comune per il Drawer. */
export function fetchMunicipalityDetail(istat: string): Promise<MunicipalityDetail> {
  return call<MunicipalityDetail>({ mode: "detail", istat });
}
