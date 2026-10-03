// Tipi condivisi della chat. Il modello AI NON calcola ne' scrive numeri: sceglie
// una domanda tra quelle sotto (Intento) e racconta un risultato gia' calcolato
// dal codice (Risultato). Tutto quello che passa dal modello e' validato contro
// questi tipi prima di essere usato.

export const METRICHE = ["fhi", "autonomia", "expenditure_pc", "revenue_pc", "reddito_medio"] as const;
export type Metrica = (typeof METRICHE)[number];

/** Metriche leggibili in una serie storica (quelle di `history` nel file del comune). */
export const METRICHE_STORICO = [
  "revenue_pc",
  "expenditure_pc",
  "fhi",
  "autonomia",
  "surplus_deficit",
  "revenue_total",
  "expenditure_total",
  "reddito_medio",
] as const;
export type MetricaStorico = (typeof METRICHE_STORICO)[number];

export interface RifComune {
  /** Nome, codice ISTAT, oppure "@corrente" per il comune aperto nel sito */
  comune: string;
  provincia?: string;
}

export type Intento =
  | ({ tipo: "scheda_comune"; anno?: number } & RifComune)
  | { tipo: "confronta_comuni"; comuni: RifComune[]; anno?: number }
  | {
      tipo: "classifica";
      metrica: Metrica;
      ordine: "alto" | "basso";
      fascia?: string;
      regione?: string;
      anno?: number;
      senza_concentrate?: boolean;
    }
  | ({ tipo: "spesa_area"; area: string } & RifComune)
  | ({ tipo: "storico_comune"; metrica: MetricaStorico } & RifComune)
  | { tipo: "fuori_ambito" };

export interface Colonna {
  k: string;
  label: string;
  /** numeri e importi a destra */
  dx?: boolean;
}

export interface Fatto {
  label: string;
  /** Gia' formattato dal codice: e' l'unico modo in cui un numero entra nel testo */
  valore: string;
}

export interface Risultato {
  ok: boolean;
  titolo: string;
  colonne: Colonna[];
  /** Celle come si mostrano */
  righe: Record<string, string>[];
  /** Gli stessi valori grezzi (numeri veri) per l'esportazione CSV, stesso ordine di `righe` */
  grezze: Record<string, string | number | null>[];
  fatti: Record<string, Fatto>;
  /** Testo deterministico: e' la risposta se il modello non c'e' o sbaglia */
  riassunto: string;
  note: string[];
  /** Codice ISTAT del comune da aprire sulla mappa, se la risposta riguarda uno solo */
  apri?: string;
  /** Comune ambiguo: opzioni tra cui scegliere */
  candidati?: { istat: string; nome: string; provincia: string; abitanti: number }[];
}

export interface Contesto {
  /** Comune aperto nel sito, per "questo comune" */
  istat?: string;
  nome?: string;
  anno?: number;
}

export type Leggi = (percorso: string) => Promise<unknown>;
