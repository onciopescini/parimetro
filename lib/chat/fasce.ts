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
  if (/oltre|sopra|piu di 250000|grandi citta/.test(t)) return FASCE[5];
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
