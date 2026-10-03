// Appalti banditi da un comune (ANAC, CC BY-SA 4.0).
// Forma di get_appalti_comune() nel file comune/{istat}.json -> "appalti".

export interface AppaltiAnno {
  /** Lotti (CIG) banditi dal comune nell'anno di pubblicazione */
  n: number;
  n_per_1000: number | null;
  /** Affidamenti diretti, compresi quelli a societa' in house */
  n_diretti: number;
  quota_diretti: number | null;
  /** Mediana della quota dei comuni della stessa fascia; null se troppo pochi lotti per confrontare */
  mediana_quota_diretti: number | null;
  rango_diretti: number | null;
  n_simili: number;
  n_adesioni: number;
  n_aperte: number;
  /** null se il dato non c'e' per almeno meta' dei lotti */
  quota_piattaforma: number | null;
  n_pnrr: number;
  /** Somma dei SOLI lotti attendibili: vedi la migrazione degli appalti */
  importo: number | null;
  importo_diretti: number | null;
  importo_mediano: number | null;
  /** Importo oltre 10 volte i pagamenti annui del comune: un refuso, escluso dai totali */
  n_importo_anomalo: number;
  /** Lotti senza importo: dato mancante */
  n_senza_importo: number;
}

export interface LottoGrande {
  anno: number;
  oggetto: string | null;
  importo: number;
  tipo: string | null;
  procedura: string | null;
  cig: string;
}

export interface Appalti {
  anni: Record<string, AppaltiAnno>;
  tipi: Record<string, number>;
  famiglie: Record<string, number>;
  maggiori: LottoGrande[];
}

/** Concorrenza nelle gare vere (aperte, ristrette, negoziate) di un anno: get_concorrenza_comune(). */
export interface ConcorrenzaAnno {
  n_gare: number;
  /** Gare di cui si sa quante offerte sono arrivate */
  n_con_offerte: number;
  n_offerta_unica: number;
  /** null sotto 5 gare con l'informazione */
  quota_offerta_unica: number | null;
  mediana_quota_offerta_unica: number | null;
  rango_offerta_unica: number | null;
  n_simili: number;
  offerte_mediane: number | null;
  /** null sotto 5 gare che lo indicano */
  ribasso_mediano: number | null;
}

export type Concorrenza = Record<string, ConcorrenzaAnno>;

export const FAMIGLIE: Record<string, string> = {
  diretto: "affidamenti diretti",
  in_house: "affidamenti in house",
  adesione: "adesioni a convenzioni o accordi quadro",
  aperta: "procedure aperte",
  ristretta: "procedure ristrette",
  negoziata: "procedure negoziate",
  altra: "altre procedure",
};

/**
 * Dal 2024 la rilevazione ANAC cambia (nuovo codice dei contratti, CIG anche per i micro-affidamenti
 * su piattaforme certificate): i lotti, la quota di affidamenti diretti e l'importo mediano non sono
 * confrontabili con gli anni prima. Il confronto con i comuni simili dello STESSO anno resta valido.
 */
export const PRIMO_ANNO_NUOVA_RILEVAZIONE = 2024;

export const nuovaRilevazione = (anno: number) => anno >= PRIMO_ANNO_NUOVA_RILEVAZIONE;

/** L'anno da mostrare: quello richiesto se ci sono dati, altrimenti l'ultimo disponibile. */
export function annoDisponibile(anni: Record<string, unknown>, richiesto: number): number | null {
  if (String(richiesto) in anni) return richiesto;
  const ordinati = Object.keys(anni).map(Number).sort((a, b) => a - b);
  return ordinati.length ? ordinati[ordinati.length - 1] : null;
}
