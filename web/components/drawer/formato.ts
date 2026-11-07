// Formattazione comune a tutto il drawer (locale it-IT). Era riscritta a mano
// in cinque file con lo stesso corpo: qui sta una volta sola.
//
// Convenzione visiva: il dato mancante è sempre "—" (trattino lungo), così lo
// si distingue dal "-" del segno meno.

export const eur = (v: number | null | undefined, compact = false) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: 0,
      }).format(v);

// Con un decimale: cifre grandi (PNRR, migliaia di miliardi) senza appiattirle.
export const eurBreve = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v);

export const num = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT").format(v);
