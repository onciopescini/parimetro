// Controlli sui dati che arrivano dal browser: mai fidarsi, sempre ripulire.

export const MAX_DOMANDA_SALVATA = 400;
export const MAX_COMUNI_SALVATI = 100;
export const TIPI_CARD = ["cento", "tre", "confronto"] as const;

/** Email in minuscolo e senza spazi; null se non ha l'aspetto di un indirizzo. */
export function normalizzaEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return null;
  // Volutamente semplice: l'unica prova vera che l'indirizzo esiste e' il link che gli mandiamo
  if (!/^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[a-z]{2,}$/i.test(e)) return null;
  return e;
}

export const istatValido = (v: unknown): v is string => typeof v === "string" && /^\d{6}$/.test(v);

/** Il nome del comune serve solo per mostrarlo nell'elenco: si tiene corto e senza tag. */
export function nomeComune(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const n = v.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 80);
  return n.length ? n : null;
}

export function tipoCardValido(v: unknown): v is (typeof TIPI_CARD)[number] {
  return typeof v === "string" && (TIPI_CARD as readonly string[]).includes(v);
}

export function testoDomanda(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_DOMANDA_SALVATA);
  return t.length >= 3 ? t : null;
}

export const annoValido = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100;
