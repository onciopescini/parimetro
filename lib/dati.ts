// ============================================================
// Accesso ai dati statici.
//
// Online non c'e' un database: l'ETL (05_esporta_statico.py) scrive file
// JSON in public/dati/ e il sito li legge da li'. Questo modulo e' l'unico
// posto che conosce i percorsi, e lo schema dei nomi DEVE restare identico
// a quello dell'esportatore Python.
// ============================================================

export const URL_DATI = "/dati";

/** Stesso slug dell'esportatore: minuscole, tutto cio' che non e' [a-z0-9] -> "-". */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function percorsoClassifica(
  anno: number,
  metric: string,
  desc: boolean,
  fascia: string | null,
  region: string | null,
): string {
  const f = fascia ? slug(fascia) : "tutte";
  const r = region ? slug(region) : "italia";
  return `${URL_DATI}/classifiche/${anno}/${metric}-${desc ? "disc" : "cresc"}-${f}-${r}.json`;
}

/** Scarica un JSON e non lascia passare gli errori come risposte vuote. */
export async function leggi<T>(percorso: string): Promise<T> {
  const r = await fetch(percorso);
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
  return r.json();
}

/** Riga dell'indice dei comuni usato dalla ricerca in browser. */
export interface VoceIndice {
  istat: string;
  name: string;
  region: string;
  province: string;
  population: number;
  lon: number;
  lat: number;
}

let indice: Promise<VoceIndice[]> | null = null;

/** L'indice (~7.900 righe) si scarica una volta sola, alla prima ricerca. */
export function caricaIndice(): Promise<VoceIndice[]> {
  indice ??= leggi<VoceIndice[]>(`${URL_DATI}/indice.json`);
  return indice;
}

/**
 * Ricerca in browser, stessa logica di search_municipalities():
 * codice ISTAT esatto, poi chi inizia col termine, poi inizio di parola;
 * a parita' vince il piu' popoloso.
 */
export async function cerca(q: string, limite = 8): Promise<VoceIndice[]> {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const voci = await caricaIndice();
  const punteggio = (v: VoceIndice) => {
    const n = v.name.toLowerCase();
    if (v.istat === t) return 0;
    if (n.startsWith(t)) return 1;
    if (n.includes(" " + t)) return 2;
    return 99;
  };
  return voci
    .map((v) => ({ v, p: punteggio(v) }))
    .filter((x) => x.p < 99)
    .sort((a, b) => a.p - b.p || b.v.population - a.v.population)
    .slice(0, limite)
    .map((x) => x.v);
}
