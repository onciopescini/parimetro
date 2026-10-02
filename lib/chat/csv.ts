// CSV pensato per Excel in italiano: separatore ";" e virgola decimale, con BOM UTF-8
// perche' senza Excel rovina gli accenti. I valori sono quelli grezzi (non formattati),
// cosi' restano numeri ordinabili.
import type { Colonna, Risultato } from "./tipi";

const cella = (v: string | number | null | undefined): string => {
  if (v == null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function toCsv(colonne: Colonna[], grezze: Risultato["grezze"]): string {
  // Le colonne "decorative" (etichette senza titolo) non vanno nel file; le colonne
  // extra delle righe grezze (es. codice ISTAT) invece si, in coda.
  const visibili = colonne.filter((c) => c.label);
  const note = grezze.length ? Object.keys(grezze[0]).filter((k) => !colonne.some((c) => c.k === k)) : [];
  const testa = [...visibili.map((c) => c.label), ...note].map((x) => cella(x));
  const righe = grezze.map((r) => [...visibili.map((c) => r[c.k]), ...note.map((k) => r[k])].map(cella).join(";"));
  return "﻿" + [testa.join(";"), ...righe].join("\r\n") + "\r\n";
}
