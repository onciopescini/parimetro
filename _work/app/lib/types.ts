// ============================================================================
// Tipi condivisi + configurazione metriche + scala cromatica + formattatori
// ============================================================================

export type MetricKey = "expenditure" | "revenue" | "debt" | "surplus" | "fhi";

/** Proprietà di ogni Feature comunale servita da get_geo_budgets */
export interface MuniProps {
  istat_code: string;
  name: string;
  region: string;
  province: string;
  population: number;
  year: number;
  revenue_total: number | null;
  expenditure_total: number | null;
  debt_total: number | null;
  surplus_deficit: number | null;
  revenue_per_capita: number | null;
  expenditure_per_capita: number | null;
  debt_per_capita: number | null;
  surplus_per_capita: number | null;
  fhi: number | null;
}

/** Aggregato provinciale servito da get_geo_centroids (LOD nazionale) */
export interface ProvinceAgg extends Omit<MuniProps, "istat_code" | "name" | "population"> {
  province: string;
  municipalities_count: number;
  population: number;
  lon: number;
  lat: number;
}

export interface YearRecord {
  year: number;
  population: number | null;
  revenue_total: number | null;
  expenditure_total: number | null;
  debt_total: number | null;
  surplus_deficit: number | null;
  revenue_per_capita: number | null;
  expenditure_per_capita: number | null;
  debt_per_capita: number | null;
  surplus_per_capita: number | null;
  fhi: number | null;
  raw_details: Record<string, number> | null;
}

export interface NationalStats {
  year: number;
  municipalities_count: number;
  avg_revenue_pc: number | null;
  avg_expenditure_pc: number | null;
  avg_debt_pc: number | null;
  avg_surplus_pc: number | null;
  median_debt_pc: number | null;
  avg_fhi: number | null;
}

export interface MunicipalityDetail {
  municipality: {
    istat_code: string;
    name: string;
    region: string;
    province: string;
    population: number;
    area_sqkm: number | null;
  } | null;
  years: YearRecord[];
  national: NationalStats[];
  rank: {
    year: number;
    fhi_national: number;
    of_national: number;
    fhi_regional: number;
    of_regional: number;
  } | null;
}

// ----------------------------------------------------------------------------
// Configurazione metriche
// `invert: true` → valori alti sono positivi (verde), es. entrate, avanzo, FHI
// ----------------------------------------------------------------------------
export interface MetricConfig {
  label: string;
  short: string;
  abs: keyof MuniProps;
  pc: keyof MuniProps | null;
  invert: boolean;
  unit: "eur" | "score";
}

export const METRICS: Record<MetricKey, MetricConfig> = {
  expenditure: { label: "Spesa totale",       short: "Spesa",   abs: "expenditure_total", pc: "expenditure_per_capita", invert: false, unit: "eur" },
  revenue:     { label: "Entrate totali",     short: "Entrate", abs: "revenue_total",     pc: "revenue_per_capita",     invert: true,  unit: "eur" },
  debt:        { label: "Debito totale",      short: "Debito",  abs: "debt_total",        pc: "debt_per_capita",        invert: false, unit: "eur" },
  surplus:     { label: "Avanzo / Disavanzo", short: "Avanzo",  abs: "surplus_deficit",   pc: "surplus_per_capita",     invert: true,  unit: "eur" },
  fhi:         { label: "Indice di Salute Finanziaria", short: "FHI", abs: "fhi",         pc: null,                     invert: true,  unit: "score" },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** Estrae il valore di una metrica (assoluto o pro-capite) da una feature. */
export function getMetricValue(
  props: Partial<MuniProps>,
  key: MetricKey,
  perCapita: boolean,
): number | null {
  const cfg = METRICS[key];
  const field = perCapita && cfg.pc ? cfg.pc : cfg.abs;
  const v = props[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ----------------------------------------------------------------------------
// Scala cromatica divergente dark-friendly (spec di prodotto):
// Smeraldo #10B981 (stabilità) → Ambra #F59E0B → Rosso #EF4444 (criticità)
// ----------------------------------------------------------------------------
export const RAMP: [number, number, number][] = [
  [16, 185, 129],
  [245, 158, 11],
  [239, 68, 68],
];

/** t ∈ [0,1] → colore RGBA interpolato lungo la rampa (t=0 verde, t=1 rosso). */
export function rampColor(t: number, alpha = 210): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const seg = x < 0.5 ? 0 : 1;
  const local = (x - seg * 0.5) / 0.5;
  const [a, b] = [RAMP[seg], RAMP[seg + 1]];
  return [
    Math.round(a[0] + (b[0] - a[0]) * local),
    Math.round(a[1] + (b[1] - a[1]) * local),
    Math.round(a[2] + (b[2] - a[2]) * local),
    alpha,
  ];
}

/** Dominio robusto agli outlier: percentili p5–p95 dei valori osservati. */
export function robustDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const lo = q(0.05);
  const hi = q(0.95);
  return hi > lo ? [lo, hi] : [lo, lo + 1];
}

/** Normalizza un valore nel dominio → t ∈ [0,1], con inversione opzionale. */
export function normalize(v: number, [lo, hi]: [number, number], invert: boolean): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return invert ? 1 - t : t;
}

// ----------------------------------------------------------------------------
// Formattatori it-IT
// ----------------------------------------------------------------------------
const eurFull = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
});
const eurCompact = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1,
});
const intIt = new Intl.NumberFormat("it-IT");

export function formatEur(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return compact ? eurCompact.format(v) : eurFull.format(v);
}

export function formatInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return intIt.format(Math.round(v));
}

/** Scarto % rispetto a un riferimento (es. media nazionale). */
export function deltaPct(value: number | null, ref: number | null): number | null {
  if (value === null || ref === null || !ref) return null;
  return ((value - ref) / Math.abs(ref)) * 100;
}
