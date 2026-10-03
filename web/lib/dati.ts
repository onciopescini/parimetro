// ============================================================
// Accesso ai dati statici.
//
// Online non c'e' un database: l'ETL (05_esporta_statico.py) scrive file
// JSON in public/dati/ e il sito li legge da li'. Questo modulo e' l'unico
// posto che conosce i percorsi, e lo schema dei nomi DEVE restare identico
// a quello dell'esportatore Python (etl/05_esporta_statico.py).
//
// La parita' e' verificata da tests/fixtures/*.json, che esiste in copia
// identica nell'altro repository: vedi i test su entrambi i lati.
// ============================================================

export const URL_DATI = "/dati";

/**
 * Minuscolo e senza segni diacritici: "Forlì" -> "forli".
 * NFKD scompone le lettere accentate (e le legature: "ﬁ" -> "fi"), poi si
 * tolgono i soli segni combinanti non spaziati (categoria Mn), che e' anche
 * cio' che fa il Python: con \p{M} (che include Mc e Me) i due potrebbero
 * divergere su alfabeti non latini.
 */
export function senzaAccenti(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/\p{Mn}/gu, "");
}

/** Chiave di file: solo [a-z0-9] separati da "-". Identica a slug() in 05_esporta_statico.py. */
export function slug(s: string): string {
  return senzaAccenti(s)
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

/** Forma di confronto: senza accenti e con ogni segno ridotto a uno spazio ("Sant'Agata" -> "sant agata"). */
const forma = (s: string) => senzaAccenti(s).replace(/[^a-z0-9]+/g, " ").trim();

let indice: Promise<{ v: VoceIndice; n: string }[]> | null = null;

/**
 * L'indice (~7.900 righe) si scarica una volta sola, alla prima ricerca, e le
 * forme di confronto si calcolano subito: a ogni tasto premuto sarebbero
 * 7.900 normalizzazioni inutili.
 */
function caricaIndice() {
  indice ??= leggi<VoceIndice[]>(`${URL_DATI}/indice.json`).then((voci) =>
    voci.map((v) => ({ v, n: forma(v.name) })),
  );
  // Se il download fallisce non si deve ricordare il fallimento per sempre
  indice.catch(() => {
    indice = null;
  });
  return indice;
}

/**
 * Ricerca in browser, stessa graduatoria di search_municipalities():
 * codice ISTAT esatto, poi chi inizia col termine, poi inizio di parola;
 * a parita' vince il piu' popoloso. Insensibile ad accenti e apostrofi.
 */
export async function cerca(q: string, limite = 8): Promise<VoceIndice[]> {
  const t = forma(q);
  if (t.length < 2) return [];
  const voci = await caricaIndice();
  const punteggio = ({ v, n }: { v: VoceIndice; n: string }) => {
    if (v.istat === t) return 0;
    if (n.startsWith(t)) return 1;
    if (n.includes(" " + t)) return 2;
    return 99;
  };
  return voci
    .map((x) => ({ x, p: punteggio(x) }))
    .filter((r) => r.p < 99)
    .sort((a, b) => a.p - b.p || b.x.v.population - a.x.v.population)
    .slice(0, limite)
    .map((r) => r.x.v);
}

/** Solo per i test: dimentica l'indice scaricato. */
export function _azzeraIndice() {
  indice = null;
}
