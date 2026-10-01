"use client";

// ============================================================
// Map3D.tsx · Modulo 2
// Viewport Deck.gl a schermo intero: estrusione dual-metric
// (altezza = una metrica, colore = un'altra), LOD dinamico
// (colonne provinciali → poligoni comunali), luci direzionali,
// tooltip glassmorphism e fly-to al click.
//
// Dipendenze: npm i deck.gl react-map-gl maplibre-gl
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ColumnLayer, GeoJsonLayer } from "@deck.gl/layers";
import {
  AmbientLight,
  DirectionalLight,
  FlyToInterpolator,
  LightingEffect,
  type MapViewState,
  type PickingInfo,
} from "@deck.gl/core";
import { Map as BaseMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * maplibre-gl 6 cerca il worker accanto a se' stesso, ma Turbopack sposta il
 * codice in altri chunk: senza questo la mappa base non si disegna ("Worker
 * failed to load"). I file li copia scripts/copia-worker-maplibre.mjs.
 *
 * L'URL va impostato PRIMA che la mappa nasca, per questo lo si fa dentro la
 * promessa che react-map-gl aspetta come `mapLib`. Lato server non si importa
 * nulla: maplibre-gl ha bisogno del browser.
 */
let maplibrePronto: Promise<typeof import("maplibre-gl")> | null = null;
function caricaMaplibre() {
  maplibrePronto ??= import("maplibre-gl").then((m) => {
    m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    return m;
  });
  return maplibrePronto;
}

// ---------------------------------------------------------- //
// Tipi
// ---------------------------------------------------------- //
export type MetricKey = "debt" | "expenditure" | "revenue" | "surplus" | "fhi";

export interface MunicipalityProps {
  istat: string;
  name: string;
  region: string;
  province: string;
  population: number;
  revenue_total: number | null;
  expenditure_total: number | null;
  debt_total: number | null;
  surplus_deficit: number | null;
  revenue_pc: number | null;
  expenditure_pc: number | null;
  debt_pc: number | null;
  fhi: number | null;
}

export interface ProvinceAgg {
  province: string;
  region: string;
  lon: number;
  lat: number;
  population: number;
  revenue_total: number;
  expenditure_total: number;
  debt_total: number;
  surplus_deficit: number;
  revenue_pc: number;
  expenditure_pc: number;
  debt_pc: number;
  fhi: number;
}

interface MuniFeature {
  type: "Feature";
  geometry: unknown;
  properties: MunicipalityProps;
}
interface MuniFC {
  type: "FeatureCollection";
  features: MuniFeature[];
}

interface Map3DProps {
  year: number;
  /** Metrica che guida l'ALTEZZA dell'estrusione 3D */
  heightMetric?: MetricKey;
  /** Metrica che guida il GRADIENTE cromatico */
  colorMetric?: MetricKey;
  perCapita?: boolean;
  onSelect?: (m: MunicipalityProps) => void;
  /** Cartella dei file statici (comuni-<anno>.json, province-<anno>.json) */
  dataUrl?: string;
  /**
   * Zoom oltre il quale le colonne provinciali lasciano il posto ai
   * poligoni comunali. Metti 0 per avere i comuni da subito (vista
   * nazionale "a spilli"), un valore alto per restare sulle province.
   */
  lodThreshold?: number;
  /**
   * Scala di normalizzazione di altezza e colore.
   * - "robust" (default): lineare tagliata al 5°–95° percentile. Giusta per
   *   i valori pro capite, dove pochi outlier schiaccerebbero la scala.
   * - "log": logaritmica sul 1°–99° percentile. I totali assoluti seguono
   *   una power-law (Roma vale ~10× la seconda città): in lineare si vede
   *   un solo picco e il resto piatto, in log tutta la gerarchia urbana.
   * - "full": lineare su min–max reale, per confronti senza clipping.
   */
  scale?: "robust" | "log" | "full";
  /** Rampa cromatica: "health" per l'FHI, "cost" per gli importi. */
  palette?: PaletteKey;
  /**
   * Porta la camera su un punto, con la stessa animazione del click sulla
   * mappa. Usato dalla barra di ricerca e dal ripristino da deep link.
   * `nonce` va cambiato a ogni richiesta di volo, così si può volare due
   * volte di seguito sullo stesso comune.
   */
  flyTo?: { lon: number; lat: number; nonce: number } | null;
}

// ---------------------------------------------------------- //
// Metriche: etichette, direzione e accessor unificato
// (comuni e province condividono le stesse chiavi JSON)
// ---------------------------------------------------------- //
export const METRIC_LABELS: Record<MetricKey, string> = {
  debt: "Debito",
  expenditure: "Spesa",
  revenue: "Entrate",
  surplus: "Avanzo/Disavanzo",
  // Non più "salute finanziaria": il punteggio è la posizione del comune fra
  // quelli della sua fascia demografica, quindi è relativo per costruzione.
  fhi: "Posizione nella fascia",
};

const HIGHER_IS_WORSE: Record<MetricKey, boolean> = {
  debt: true,
  expenditure: true,
  revenue: false,
  surplus: false,
  fhi: false,
};

const METRIC_KEYS: Record<"debt" | "revenue" | "expenditure", [string, string]> = {
  debt: ["debt_total", "debt_pc"],
  revenue: ["revenue_total", "revenue_pc"],
  expenditure: ["expenditure_total", "expenditure_pc"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metricValue(p: any, metric: MetricKey, perCapita: boolean): number {
  if (!p) return 0;
  if (metric === "fhi") return p.fhi ?? 0;
  if (metric === "surplus") {
    const v = p.surplus_deficit ?? 0;
    return perCapita ? v / Math.max(p.population ?? 1, 1) : v;
  }
  const [abs, pc] = METRIC_KEYS[metric];
  return (perCapita ? p[pc] : p[abs]) ?? 0;
}

// ---------------------------------------------------------- //
// Color ramp divergente dark-friendly
// #10B981 (stabilità) → #F59E0B (attenzione) → #EF4444 (criticità)
// ---------------------------------------------------------- //
export type PaletteKey = "health" | "cost";

const RAMPS: Record<PaletteKey, [number, number, number][]> = {
  // Salute finanziaria: verde stabilità → ambra attenzione → rosso criticità
  health: [
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
  ],
  // Grandezze monetarie: blu/verde in basso → rosso in alto
  cost: [
    [37, 99, 235],
    [14, 165, 233],
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
  ],
};

const CSS_STOPS: Record<PaletteKey, string> = {
  health: "#10B981,#F59E0B,#EF4444",
  cost: "#2563EB,#0EA5E9,#10B981,#F59E0B,#EF4444",
};

function mix(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function rampColor(
  stops: [number, number, number][],
  t: number,
  alpha = 205,
): [number, number, number, number] {
  // Un valore non finito (dato mancante, dominio degenere) non deve far
  // esplodere il layer: lo si tratta come estremo basso della rampa.
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const segments = stops.length - 1;
  const i = Math.min(segments - 1, Math.floor(x * segments));
  const c = mix(stops[i], stops[i + 1], x * segments - i);
  return [c[0], c[1], c[2], alpha];
}

// Normalizzazione robusta agli outlier (5°–95° percentile di default;
// lo=0/hi=1 restituiscono il min–max reale)
function quantiles(values: number[], lo = 0.05, hi = 0.95): [number, number] {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return [0, 1];
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  const a = q(lo);
  const b = q(hi);
  return a === b ? [a, a + 1] : [a, b];
}

function norm(v: number, [lo, hi]: [number, number]): number {
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

// ---------------------------------------------------------- //
// Illuminazione e materiali (specularità minima per dark mode)
// ---------------------------------------------------------- //
const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.55 }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 0.9, direction: [-1, -2, -1] }),
  fill: new DirectionalLight({ color: [176, 196, 255], intensity: 0.3, direction: [2, 1, -0.4] }),
});

const MATERIAL = {
  ambient: 0.45,
  diffuse: 0.75,
  shininess: 6,
  specularColor: [25, 25, 30] as [number, number, number],
};

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 12.5,
  latitude: 42.2,
  zoom: 5.3,
  pitch: 50,
  bearing: -8,
  minZoom: 4,
  maxZoom: 15,
};

const LOD_THRESHOLD = 6.3; // default: sotto colonne provinciali · sopra poligoni comunali
const MAX_ELEVATION = 26000; // metri al 95° percentile della metrica

const EMPTY_FC: MuniFC = { type: "FeatureCollection", features: [] };

// ---------------------------------------------------------- //
// Componente
// ---------------------------------------------------------- //
export default function Map3D({
  year,
  heightMetric = "expenditure",
  colorMetric = "fhi",
  perCapita = true,
  onSelect,
  dataUrl = "/dati",
  lodThreshold = LOD_THRESHOLD,
  scale = "robust",
  palette = "health",
  flyTo = null,
}: Map3DProps) {
  // undefined sul server (non influisce sull'HTML), la promessa nel browser
  const [mapLib] = useState(() => (typeof window === "undefined" ? undefined : caricaMaplibre()));
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [munis, setMunis] = useState<MuniFC | null>(null);
  const [provinces, setProvinces] = useState<ProvinceAgg[]>([]);
  // Quale combinazione anno/cartella ha gia' finito di caricare. "Sta
  // caricando" si deriva da qui, senza impostarlo all'inizio dell'effetto.
  const [caricatoPer, setCaricatoPer] = useState<string | null>(null);
  const chiaveDati = `${dataUrl}|${year}`;
  const loading = caricatoPer !== chiaveDati;

  // ---- Volo comandato dall'esterno (ricerca, deep link) ----
  const ultimoVolo = useRef<number | null>(null);
  useEffect(() => {
    if (!flyTo || flyTo.nonce === ultimoVolo.current) return;
    ultimoVolo.current = flyTo.nonce;
    setViewState((v) => ({
      ...v,
      longitude: flyTo.lon,
      latitude: flyTo.lat,
      zoom: Math.max(v.zoom as number, 9.6),
      pitch: 55,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
  }, [flyTo]);

  // ---- Fetch dei due livelli LOD: file statici generati dall'ETL ----
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${dataUrl}/comuni-${year}.json`).then((r) => r.json()),
      fetch(`${dataUrl}/province-${year}.json`).then((r) => r.json()),
    ])
      .then(([fc, prov]) => {
        if (!alive) return;
        setMunis(fc ?? EMPTY_FC);
        setProvinces(Array.isArray(prov) ? prov : []);
      })
      .catch(console.error)
      .finally(() => alive && setCaricatoPer(chiaveDati));
    return () => {
      alive = false;
    };
  }, [year, dataUrl, chiaveDati]);

  const showPolygons = viewState.zoom >= lodThreshold;

  // ---- Domini di normalizzazione condivisi tra i due LOD ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source: any[] = useMemo(
    () => (munis?.features?.length ? munis.features.map((f) => f.properties) : provinces),
    [munis, provinces],
  );

  const [qLo, qHi] =
    scale === "full" ? [0, 1] : scale === "log" ? [0.01, 0.99] : [0.05, 0.95];

  // In log si lavora sul valore trasformato, non su quello grezzo: il
  // segno è preservato per metriche che possono andare sotto zero (avanzo).
  const tx = useCallback(
    (v: number) => (scale === "log" ? Math.sign(v) * Math.log10(1 + Math.abs(v)) : v),
    [scale],
  );

  const heightDomain = useMemo(
    () => quantiles(source.map((p) => tx(metricValue(p, heightMetric, perCapita))), qLo, qHi),
    [source, heightMetric, perCapita, qLo, qHi, tx],
  );
  const colorDomain = useMemo(
    () => quantiles(source.map((p) => tx(metricValue(p, colorMetric, perCapita))), qLo, qHi),
    [source, colorMetric, perCapita, qLo, qHi, tx],
  );

  const elevationOf = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) =>
      Math.max(0, norm(tx(metricValue(p, heightMetric, perCapita)), heightDomain)) * MAX_ELEVATION,
    [heightMetric, perCapita, heightDomain, tx],
  );

  const colorOf = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => {
      let t = norm(tx(metricValue(p, colorMetric, perCapita)), colorDomain);
      if (!HIGHER_IS_WORSE[colorMetric]) t = 1 - t; // metriche "alto = buono" invertono la rampa
      return rampColor(RAMPS[palette], t);
    },
    [colorMetric, perCapita, colorDomain, tx, palette],
  );

  // ---- Layers con transizioni animate (timeline-ready) ----
  const layers = useMemo(
    () => [
      new ColumnLayer<ProvinceAgg>({
        id: "province-columns",
        data: provinces,
        visible: !showPolygons,
        diskResolution: 24,
        radius: 9000,
        extruded: true,
        pickable: true,
        getPosition: (d) => [d.lon, d.lat],
        getElevation: (d) => elevationOf(d) * 1.4,
        getFillColor: (d) => colorOf(d),
        material: MATERIAL,
        transitions: { getElevation: 600, getFillColor: 600 },
        updateTriggers: {
          getElevation: [heightMetric, perCapita, heightDomain],
          getFillColor: [colorMetric, perCapita, colorDomain],
        },
      }),
      new GeoJsonLayer({
        id: "municipality-polygons",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (munis ?? EMPTY_FC) as any,
        visible: showPolygons,
        extruded: true,
        filled: true,
        stroked: true,
        wireframe: false,
        getLineColor: [255, 255, 255, 22],
        lineWidthMinPixels: 0.5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getElevation: (f: any) => elevationOf(f.properties) * 0.45,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getFillColor: (f: any) => colorOf(f.properties),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 70],
        material: MATERIAL,
        transitions: { getElevation: 600, getFillColor: 600 },
        updateTriggers: {
          getElevation: [heightMetric, perCapita, heightDomain],
          getFillColor: [colorMetric, perCapita, colorDomain],
        },
      }),
    ],
    [
      provinces,
      munis,
      showPolygons,
      elevationOf,
      colorOf,
      heightMetric,
      colorMetric,
      perCapita,
      heightDomain,
      colorDomain,
    ],
  );

  // ---- Tooltip contestuale glassmorphism ----
  const getTooltip = useCallback(
    ({ object }: PickingInfo) => {
      if (!object) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = (object as any).properties ?? object;
      const name = p.name ?? p.province;
      const unit = perCapita ? " €/ab" : " €";
      const fmt = (v: number | null | undefined) =>
        v == null ? "—" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(v);
      const hVal = metricValue(p, heightMetric, perCapita);
      const cVal = metricValue(p, colorMetric, perCapita);
      const fhiCol = p.fhi >= 70 ? "#10B981" : p.fhi >= 40 ? "#F59E0B" : "#EF4444";
      return {
        html: `
          <div style="font-family:ui-sans-serif,system-ui;min-width:190px;padding:10px 12px;border-radius:12px;
                      background:rgba(15,23,42,.85);backdrop-filter:blur(8px);
                      border:1px solid rgba(255,255,255,.12);color:#E2E8F0;
                      box-shadow:0 8px 24px rgba(0,0,0,.4)">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">${name}</div>
            <div style="font-size:11px;color:#94A3B8;margin-bottom:8px">${p.name ? p.province : p.region} · ${fmt(p.population)} ab.</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;gap:12px">
              <span style="color:#94A3B8">${METRIC_LABELS[heightMetric]}</span>
              <span>${fmt(hVal)}${heightMetric === "fhi" ? "" : unit}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;gap:12px">
              <span style="color:#94A3B8">${METRIC_LABELS[colorMetric]}</span>
              <span>${fmt(cVal)}${colorMetric === "fhi" ? "" : unit}</span>
            </div>
            ${p.fhi != null ? `<div style="margin-top:8px;font-size:11px;color:${fhiCol}">FHI ${p.fhi}/100</div>` : ""}
          </div>`,
        style: { background: "transparent" },
      };
    },
    [heightMetric, colorMetric, perCapita],
  );

  // ---- Fly-to al click + notifica selezione al parent (drawer) ----
  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (!info.object || !info.coordinate) return;
      const [longitude, latitude] = info.coordinate;
      setViewState((v) => ({
        ...v,
        longitude,
        latitude,
        zoom: Math.max(v.zoom as number, 9.6),
        pitch: 55,
        transitionDuration: 900,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = (info.object as any).properties ?? info.object;
      if (p?.istat && onSelect) onSelect(p as MunicipalityProps);
    },
    [onSelect],
  );

  return (
    <div className="relative h-full w-full bg-slate-950">
      <DeckGL
        viewState={viewState}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onViewStateChange={(e: any) => setViewState(e.viewState as MapViewState)}
        controller={{ inertia: 300, touchRotate: true }}
        layers={layers}
        effects={[LIGHTING]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getTooltip={getTooltip as any}
        onClick={handleClick}
      >
        <BaseMap
          mapLib={mapLib}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json"
          reuseMaps
          attributionControl={false}
        />
      </DeckGL>

      {/* Legenda cromatica */}
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 backdrop-blur-md">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">
          {METRIC_LABELS[colorMetric]}
        </div>
        <div
          className="h-1.5 w-36 rounded-full"
          style={{
            background: `linear-gradient(90deg,${
              HIGHER_IS_WORSE[colorMetric]
                ? CSS_STOPS[palette]
                : CSS_STOPS[palette].split(",").reverse().join(",")
            })`,
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>min</span>
          <span>max</span>
        </div>
      </div>

      {loading && (
        <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md">
          Caricamento bilanci {year}…
        </div>
      )}
    </div>
  );
}
