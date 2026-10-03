"use client";

// "Il reddito di chi vive qui": il reddito imponibile IRPEF dei residenti, accanto alla
// spesa del comune. 800 euro a persona pesano diversamente dove il reddito medio e' 14.000
// o 28.000 euro. E' un dato di contesto, non un giudizio.

import { pochiContribuenti, spesaOgniCentoDiReddito, type RedditoAnno } from "@/lib/reddito";

const eur = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const num = (v: number) => new Intl.NumberFormat("it-IT").format(v);

export default function RedditoResidenti({
  reddito,
  anno,
  spesaPc,
}: {
  reddito: RedditoAnno | null;
  anno: number;
  spesaPc: number | string | null | undefined;
}) {
  if (!reddito || reddito.medio == null) return null;

  const diff =
    reddito.mediana_simili && reddito.mediana_simili > 0
      ? ((reddito.medio - reddito.mediana_simili) / reddito.mediana_simili) * 100
      : null;
  const confrontabile = (reddito.n_simili ?? 0) > 1;
  const quota = spesaOgniCentoDiReddito(spesaPc, reddito.pc);

  return (
    <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <h3 className="text-[11px] uppercase tracking-wider text-slate-400">
        Il reddito di chi vive qui · anno d&apos;imposta {anno}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-slate-400">Reddito imponibile medio</div>
          <div className="text-lg font-semibold text-slate-100">{eur(reddito.medio)}</div>
          {confrontabile && diff != null && Math.abs(diff) >= 1 && (
            <div className="text-[11px] text-slate-400">
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(0)}% vs comuni simili
            </div>
          )}
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Addizionale comunale media</div>
          <div className="text-lg font-semibold text-slate-100">{eur(reddito.addizionale_media)}</div>
          {reddito.addizionale_media == null && (
            <div className="text-[11px] text-slate-500">non pubblicata (dato oscurato)</div>
          )}
        </div>
      </div>

      {confrontabile && reddito.rango != null && (
        <div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300">Reddito medio</span>
            <span className="text-slate-400">più alto del {reddito.rango}% dei simili</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${reddito.rango}%` }} />
          </div>
        </div>
      )}

      {quota != null && (
        <p className="text-[11px] leading-snug text-slate-300">
          Ogni 100 € di reddito imponibile dichiarato dai residenti, il comune ne spende{" "}
          <strong className="text-slate-100">{quota.toFixed(0)}</strong> (pagamenti dell&apos;anno).
        </p>
      )}

      {pochiContribuenti(reddito.contribuenti) && (
        <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
          Solo {num(reddito.contribuenti)} contribuenti: la media dipende da poche persone ed è poco stabile
          da un anno all&apos;altro.
        </p>
      )}

      <p className="text-[10px] leading-snug text-slate-500">
        Reddito imponibile dichiarato ai fini IRPEF (MEF, Dipartimento delle Finanze), per contribuente. Non
        comprende chi non presenta dichiarazione né i redditi tassati a parte; non è il tenore di vita.
      </p>
    </section>
  );
}
