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
    <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
      <h3 className="text-xs uppercase tracking-wider text-grigio">
        Il reddito di chi vive qui · anno d&apos;imposta {anno}
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-grigio">Reddito imponibile medio</div>
          <div className="text-lg font-semibold text-inchiostro">{eur(reddito.medio)}</div>
          {confrontabile && diff != null && Math.abs(diff) >= 1 && (
            <div className="text-xs text-grigio">
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(0)}% vs comuni simili
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-grigio">Addizionale comunale media</div>
          <div className="text-lg font-semibold text-inchiostro">{eur(reddito.addizionale_media)}</div>
          {reddito.addizionale_media == null && (
            <div className="text-xs text-grigio">non pubblicata (dato oscurato)</div>
          )}
        </div>
      </div>

      {confrontabile && reddito.rango != null && (
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-inchiostro">Reddito medio</span>
            <span className="text-grigio">più alto del {reddito.rango}% dei simili</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sabbia/50">
            <div className="h-full rounded-full bg-menta/25" style={{ width: `${reddito.rango}%` }} />
          </div>
        </div>
      )}

      {quota != null && (
        <p className="text-xs leading-snug text-inchiostro">
          Ogni 100 € di reddito imponibile dichiarato dai residenti, il comune ne spende{" "}
          <strong className="text-inchiostro">{quota.toFixed(0)}</strong> (pagamenti dell&apos;anno).
        </p>
      )}

      {pochiContribuenti(reddito.contribuenti) && (
        <p className="rounded-2xl bg-limone/30 px-2 py-1.5 text-xs leading-snug text-inchiostro">
          Solo {num(reddito.contribuenti)} contribuenti: la media dipende da poche persone ed è poco stabile
          da un anno all&apos;altro.
        </p>
      )}

      <p className="text-xs leading-snug text-grigio">
        Reddito imponibile dichiarato ai fini IRPEF (MEF, Dipartimento delle Finanze), per contribuente. Non
        comprende chi non presenta dichiarazione né i redditi tassati a parte; non è il tenore di vita.
      </p>
    </section>
  );
}
