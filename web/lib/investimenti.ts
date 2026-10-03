// Investimenti pubblici di un comune: PNRR (Italia Domani) e coesione (OpenCoesione).
// Forma di get_investimenti_comune() nel file comune/{istat}.json -> "investimenti".

export interface ProgettoPnrr {
  cup: string;
  titolo: string | null;
  misura: string | null;
  fin_pnrr: number | null;
  fin_totale: number | null;
  stato: string | null;
  data_fine: string | null;
}

export interface PnrrComune {
  /** Progetti di cui il comune e' soggetto attuatore */
  n: number;
  fin_pnrr: number;
  fin_totale: number;
  /** Euro PNRR per abitante */
  pc: number;
  mediana_pc: number;
  rango: number;
  n_simili: number;
  conclusi: number;
  missioni: { missione: string; descr: string | null; n: number; fin_pnrr: number }[];
  progetti: ProgettoPnrr[];
}

export interface OperaCoesione {
  titolo: string | null;
  ciclo: number | null;
  tema: string | null;
  fin: number | null;
  pagamenti: number | null;
  stato: string | null;
  inizio: number | null;
  fine: number | null;
  link: string | null;
}

export interface OpereCoesione {
  n: number;
  fin: number;
  pagamenti: number;
  pc: number;
  mediana_pc: number;
  rango: number;
  n_simili: number;
  stati: Record<string, number>;
  cicli: { ciclo: number; n: number; fin: number }[];
  progetti: OperaCoesione[];
}

export interface Investimenti {
  pnrr: PnrrComune;
  coesione: {
    opere: OpereCoesione;
    /** Servizi, beni, contributi e incentivi: solo conteggio e importo, mai i nomi */
    altri: Record<string, { n: number; fin: number }>;
  };
}

export const CICLI: Record<number, string> = {
  1: "2007-2013",
  2: "2014-2020",
  3: "2021-2027",
  9: "2000-2006",
};

/** Il ciclo 2000-2006 ha codice 9 nei dati: in ordine cronologico va per primo. */
export const ordinaCicli = <T extends { ciclo: number }>(cicli: T[]): T[] =>
  [...cicli].sort((a, b) => (a.ciclo === 9 ? 0 : a.ciclo) - (b.ciclo === 9 ? 0 : b.ciclo));

export const GENERI_ALTRI: Record<string, string> = {
  servizi: "servizi",
  beni: "acquisti di beni",
  contributi: "contributi a persone e altri soggetti",
  incentivi: "incentivi alle imprese",
  capitale: "partecipazioni e fondi di garanzia",
  altro: "altri interventi",
};

/**
 * Quanto pesa il progetto piu' grande sul totale: sopra meta' il per-abitante dipende da
 * un'opera sola, e va letto cosi'.
 */
export function quotaDelPrimo(importi: (number | null)[], totale: number): number | null {
  const primo = importi[0];
  if (primo == null || !(totale > 0)) return null;
  return (100 * primo) / totale;
}
