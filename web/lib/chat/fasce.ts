import { senzaAccenti } from "../dati";

// Le sei fasce come le scrive il database (fascia_demografica): sono anche i nomi dei file.
export const FASCE = [
  "sotto 1.000 abitanti",
  "da 1.000 a 5.000 abitanti",
  "da 5.000 a 20.000 abitanti",
  "da 20.000 a 60.000 abitanti",
  "da 60.000 a 250.000 abitanti",
  "oltre 250.000 abitanti",
] as const;

/** Dal testo libero scelto dal modello a una fascia vera; null se non riconosciuta. */
export function normalizzaFascia(testo: string | undefined): string | null {
  if (!testo) return null;
  const t = senzaAccenti(testo).replace(/\./g, "").replace(/\s+/g, " ");
  const esatta = FASCE.find((f) => senzaAccenti(f).replace(/\./g, "") === t);
  if (esatta) return esatta;
  if (/sotto|meno di 1000|piccolissim/.test(t)) return FASCE[0];
  if (/1000.*5000/.test(t)) return FASCE[1];
  if (/5000.*20000/.test(t)) return FASCE[2];
  if (/20000.*60000/.test(t)) return FASCE[3];
  if (/60000.*250000/.test(t)) return FASCE[4];
  if (/(oltre|sopra|piu di)( i| gli)? 250000|grandi citta/.test(t)) return FASCE[5];
  return null;
}

/** Dalla regione scritta come capita ("Valle d'Aosta", "trentino") a quella dei dati. */
export function normalizzaRegione(testo: string | undefined, regioni: string[]): string | null {
  if (!testo) return null;
  const f = (s: string) => senzaAccenti(s).replace(/[^a-z0-9]+/g, " ").trim();
  const t = f(testo);
  if (!t) return null;
  return (
    regioni.find((r) => f(r) === t) ??
    regioni.find((r) => f(r).startsWith(t) || t.startsWith(f(r).split(" ")[0])) ??
    null
  );
}

const SOGLIE = [1000, 5000, 20000, 60000, 250000];

/**
 * La fascia che la domanda dice a parole ("sopra i 250.000", "tra 20.000 e 60.000"), letta dal codice:
 * il modello a volte la omette o se ne inventa una. `fascia` e' una fascia vera; `senzaFascia` e' la
 * soglia citata che non coincide con nessuna fascia (es. "sopra i 50.000"), da dichiarare all'utente.
 */
export function fasciaDaDomanda(domanda: string): { fascia: string | null; senzaFascia: string | null } {
  const t = senzaAccenti(domanda).toLowerCase().replace(/(\d)\.(\d{3})/g, "$1$2");
  const nessuna = { fascia: null, senzaFascia: null };
  const tra = t.match(/\b(?:tra|da)\s+(\d{3,6})\s+(?:e|a)\s+(\d{3,6})/);
  if (tra) {
    const [a, b] = [Number(tra[1]), Number(tra[2])];
    const i = SOGLIE.indexOf(a);
    if (i >= 0 && SOGLIE[i + 1] === b) return { fascia: FASCE[i + 1], senzaFascia: null };
    return { fascia: null, senzaFascia: `tra ${a.toLocaleString("it-IT")} e ${b.toLocaleString("it-IT")} abitanti` };
  }
  const sopra = t.match(/\b(?:oltre|sopra|piu di|superiori a|maggiori di)(?:\s+(?:i|gli))?\s+(\d{3,6})/);
  if (sopra) {
    const n = Number(sopra[1]);
    return n === 250000 ? { fascia: FASCE[5], senzaFascia: null }
      : { fascia: null, senzaFascia: `oltre ${n.toLocaleString("it-IT")} abitanti` };
  }
  const sotto = t.match(/\b(?:sotto|meno di|inferiori a|minori di)(?:\s+(?:i|gli))?\s+(\d{3,6})/);
  if (sotto) {
    const n = Number(sotto[1]);
    return n === 1000 ? { fascia: FASCE[0], senzaFascia: null }
      : { fascia: null, senzaFascia: `sotto ${n.toLocaleString("it-IT")} abitanti` };
  }
  return nessuna;
}
