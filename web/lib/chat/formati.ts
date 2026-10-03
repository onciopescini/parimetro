// Formattazione italiana dei numeri. E' l'unico punto in cui un valore diventa testo:
// il modello AI non lo fa mai.
const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

const n = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export const numero = (v: unknown): number | null => n(v);

export const fNum = (v: unknown) => (n(v) == null ? "n.d." : nf0.format(n(v)!));
export const fEur = (v: unknown) => (n(v) == null ? "n.d." : `${nf0.format(n(v)!)} €`);
export const fPct = (v: unknown) => (n(v) == null ? "n.d." : `${nf1.format(n(v)!)}%`);

/** Importi grandi in forma breve: 1,2 mln €, 3,4 mld € */
export function fEurBreve(v: unknown): string {
  const x = n(v);
  if (x == null) return "n.d.";
  const a = Math.abs(x);
  if (a >= 1e9) return `${nf1.format(x / 1e9)} mld €`;
  if (a >= 1e6) return `${nf1.format(x / 1e6)} mln €`;
  if (a >= 1e3) return `${nf0.format(x / 1e3)} mila €`;
  return `${nf0.format(x)} €`;
}

export function formattaMetrica(metrica: string, v: unknown): string {
  switch (metrica) {
    case "fhi":
      return n(v) == null ? "n.d." : String(Math.round(n(v)!));
    case "autonomia":
      return fPct(v);
    case "population":
      return fNum(v);
    case "revenue_pc":
    case "expenditure_pc":
      return fEur(v);
    case "surplus_deficit":
    case "revenue_total":
    case "expenditure_total":
      return fEurBreve(v);
    default:
      return String(v ?? "n.d.");
  }
}

export const ETICHETTE_METRICA: Record<string, string> = {
  fhi: "Rango nella fascia (0-100)",
  autonomia: "Autonomia finanziaria",
  expenditure_pc: "Spesa pro capite",
  revenue_pc: "Entrate pro capite",
  surplus_deficit: "Avanzo/disavanzo di cassa",
  revenue_total: "Entrate totali",
  expenditure_total: "Spesa totale",
  population: "Abitanti",
};
