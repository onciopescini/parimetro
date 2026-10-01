"use client";

// "In cosa spende": la spesa dell'anno per area funzionale, confrontata con la
// mediana dei comuni della stessa fascia, e le voci piu' pesanti.
// L'area "Non attribuibile" si mostra sempre: nasconderla farebbe sembrare il
// resto piu' preciso di quanto sia.

import { AREE, NATURE, type CategorieComune } from "@/lib/categorie";

const eur = (v: number, compact = false) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(v);

export default function SpesaPerCategoria({
  categorie,
  year,
}: {
  categorie: CategorieComune | null;
  year: number;
}) {
  if (!categorie) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-400">
        Il dettaglio per voce di spesa non è disponibile per il {year}.
      </p>
    );
  }

  const { totale, aree, nature, voci, altre_voci } = categorie;
  const aree_con_spesa = aree.filter((a) => a.importo > 0);
  const massimo = Math.max(...aree_con_spesa.map((a) => a.importo), 1);
  const na = aree.find((a) => a.area === "non_attribuibile");
  const quotaNa = na && totale > 0 ? (100 * na.importo) / totale : 0;

  // Un comune piccolo che compra un immobile spende in un anno quanto in dieci:
  // il pro capite e il confronto con i simili diventano fuorvianti, e va detto.
  const prima = voci[0];
  const concentrata = prima && totale > 0 && prima.importo / totale >= 0.4 ? prima : null;

  return (
    <div className="space-y-4">
      {concentrata && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          Il {Math.round((100 * concentrata.importo) / totale)}% della spesa dell&apos;anno è una sola
          voce (&ldquo;{concentrata.descrizione}&rdquo;, {eur(concentrata.importo, true)}): un
          investimento isolato, non la spesa corrente. I confronti con i comuni simili
          vanno letti con cautela.
        </p>
      )}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          In cosa spende · pagamenti {year}
        </h3>
        <ul className="space-y-2.5">
          {aree_con_spesa.map((a) => {
            const delta = a.mediana_pc > 0 ? ((a.pc - a.mediana_pc) / a.mediana_pc) * 100 : null;
            return (
              <li key={a.area}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-slate-200">{AREE[a.area] ?? a.area}</span>
                  <span className="shrink-0 text-slate-400">
                    {eur(a.importo, true)} · {eur(a.pc)}/ab
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/60">
                  <div
                    className={`h-full rounded-full ${
                      a.area === "non_attribuibile" ? "bg-slate-500" : "bg-sky-400/70"
                    }`}
                    style={{ width: `${(100 * a.importo) / massimo}%` }}
                  />
                </div>
                {a.area !== "non_attribuibile" && a.n_simili > 1 && (
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    mediana dei simili {eur(a.mediana_pc)}/ab
                    {delta != null && Math.abs(delta) >= 1 && (
                      <>
                        {" "}
                        · {delta > 0 ? "+" : "−"}
                        {Math.abs(delta).toFixed(0)}%
                      </>
                    )}
                    {" "}· spende più del {a.rango}% dei {a.n_simili - 1} altri
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {quotaNa >= 1 && (
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Il {quotaNa.toFixed(0)}% della spesa ({eur(na!.importo, true)}) è registrato con voci
            generiche (&ldquo;altri servizi&rdquo;, &ldquo;altre spese&rdquo;) che non permettono di
            dire a quale servizio vada.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Per natura della spesa
        </h3>
        <ul className="space-y-1">
          {nature
            .filter((n) => n.importo > 0)
            .map((n) => (
              <li key={n.natura} className="flex justify-between text-[11px]">
                <span className="text-slate-300">{NATURE[n.natura] ?? n.natura}</span>
                <span className="text-slate-400">
                  {eur(n.importo, true)} · {((100 * n.importo) / totale).toFixed(0)}%
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Le voci più pesanti
        </h3>
        <ol className="space-y-1.5">
          {voci.slice(0, 10).map((v) => (
            <li key={v.codice} className="text-[11px] leading-snug">
              <div className="flex justify-between gap-2">
                <span className="text-slate-300">{v.descrizione}</span>
                <span className="shrink-0 text-slate-400">{eur(v.importo, true)}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {AREE[v.area] ?? v.area} · {v.codice}
              </div>
            </li>
          ))}
        </ol>
        {voci.length > 10 && (
          <p className="mt-2 text-[10px] text-slate-500">
            Altre {voci.length - 10 + altre_voci.n} voci per {eur(
              voci.slice(10).reduce((s, v) => s + v.importo, 0) + altre_voci.importo,
              true,
            )}.
          </p>
        )}
      </section>

      <p className="text-[10px] leading-snug text-slate-500">
        Dati di cassa SIOPE (pagamenti). L&apos;attribuzione di ogni voce a un&apos;area è una scelta
        redazionale, pubblicata e verificabile nel repository.
      </p>
    </div>
  );
}
