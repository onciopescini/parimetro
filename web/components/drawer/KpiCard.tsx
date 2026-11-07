"use client";

// Una cella KPI del quadro: valore grande e pillola del confronto in %.
// invert=true → un valore SOTTO la media è positivo (spesa, debito).

import { TrendingDown, TrendingUp } from "lucide-react";

export default function KpiCard({
  label,
  value,
  diff,
  baseline = "vs media nazionale",
  invert = false,
}: {
  label: string;
  value: string;
  diff: number | null;
  /** Contro cosa è calcolato il diff: cambia con la base di confronto scelta */
  baseline?: string;
  invert?: boolean;
}) {
  const good = diff != null && (invert ? diff < 0 : diff > 0);
  return (
    <div className="rounded-3xl border border-[var(--color-bordo)] bg-carta p-4">
      <div className="text-xs uppercase tracking-wide text-grigio">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-inchiostro">{value}</div>
      {diff != null && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-inchiostro ${
            good ? "bg-menta/40" : "bg-pesca/60"
          }`}
        >
          {diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(diff).toFixed(1)}% {baseline}
        </div>
      )}
    </div>
  );
}
