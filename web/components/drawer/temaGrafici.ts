// Tema "carta" per i grafici Recharts del drawer. Recharts non legge i token
// Tailwind, ma accetta variabili CSS: così i grafici seguono il tema come
// tutto il resto.

export const GRID = "var(--color-bordo)";
export const TICK = { fill: "var(--color-grigio)", fontSize: 12 };
export const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-carta)",
  border: "1px solid var(--color-bordo)",
  borderRadius: 16,
  color: "var(--color-inchiostro)",
  fontSize: 13,
};
