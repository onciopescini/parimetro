// Reddito IRPEF dei residenti (MEF, Dipartimento delle Finanze): tipi e piccole regole.
// Il file dei dati di un comune ha `reddito: { "2024": RedditoAnno, ... }` (anno d'imposta).

export interface RedditoAnno {
  contribuenti: number;
  /** Reddito imponibile medio per contribuente, in euro */
  medio: number | null;
  /** Reddito imponibile per abitante, in euro */
  pc: number | null;
  /** Addizionale comunale IRPEF media per contribuente; null se oscurata dal segreto statistico */
  addizionale_media: number | null;
  /** Percentile (0-100) fra i comuni della stessa fascia di popolazione */
  rango: number | null;
  mediana_simili: number | null;
  n_simili: number | null;
}

/**
 * Sotto questa soglia di contribuenti la media dipende da pochissime persone: un paese
 * con 40 dichiaranti sale in cima alle classifiche se due guadagnano molto. Non e' un
 * errore dei dati, ma la media non e' stabile e il confronto va letto con cautela.
 */
export const POCHI_CONTRIBUENTI = 100;

export const pochiContribuenti = (n: number | null | undefined): boolean =>
  n != null && n < POCHI_CONTRIBUENTI;

/**
 * Quanti euro spende il comune ogni 100 euro di reddito imponibile dei suoi residenti.
 * Null se manca uno dei due o il reddito e' zero.
 */
export function spesaOgniCentoDiReddito(
  spesaPc: number | string | null | undefined,
  redditoPc: number | null | undefined,
): number | null {
  const s = spesaPc == null ? NaN : Number(spesaPc);
  if (!Number.isFinite(s) || !redditoPc || redditoPc <= 0) return null;
  return (100 * s) / redditoPc;
}
