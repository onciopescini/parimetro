// Soglia oltre la quale una sola voce "spiega" l'anno di un comune: sopra il 40%
// il pro capite dipende da un investimento isolato, non dalla gestione ordinaria.
// Stessa soglia del drawer (SpesaPerCategoria) e dell'ETL.
export const SOGLIA_CONCENTRAZIONE = 40;

/** Quante righe di classifica si mostrano. L'esportatore ne scrive di piu' (vedi RIGHE_MOSTRATE). */
export const RIGHE_MOSTRATE = 20;

/** I numeric di Postgres arrivano dal JSON come stringhe ("90.1"): si convertono qui. */
export function eConcentrata(quota: number | string | null | undefined): boolean {
  return quota != null && Number(quota) >= SOGLIA_CONCENTRAZIONE;
}

/**
 * Le righe da mostrare. Con `nascondi` si tolgono i comuni a spesa concentrata e si
 * RINUMERA: sul display non devono comparire buchi (1, 2, 5...).
 */
export function righeVisibili<T extends { posizione: number; concentrata?: number | string | null }>(
  righe: T[],
  nascondi: boolean,
  massimo = RIGHE_MOSTRATE,
): T[] {
  const tenute = nascondi ? righe.filter((r) => !eConcentrata(r.concentrata)) : righe;
  return tenute.slice(0, massimo).map((r, i) => ({ ...r, posizione: i + 1 }));
}
