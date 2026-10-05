"use client";

// "In cosa spende": la spesa dell'anno per area funzionale, confrontata con la
// mediana dei comuni della stessa fascia, e le voci piu' pesanti.
// L'area "Non attribuibile" si mostra sempre: nasconderla farebbe sembrare il
// resto piu' preciso di quanto sia.

import { AREE, NATURE, type CategorieComune } from "@/lib/categorie";
import { COLORE_AREA } from "@/lib/card/contenuto";

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
      <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-3 text-sm leading-relaxed text-grigio">
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
        <p className="rounded-3xl border border-limone bg-limone/30 p-3 text-sm leading-relaxed text-inchiostro">
          Il {Math.round((100 * concentrata.importo) / totale)}% della spesa dell&apos;anno è una sola
          voce (&ldquo;{concentrata.descrizione}&rdquo;, {eur(concentrata.importo, true)}): un
          investimento isolato, non la spesa corrente. I confronti con i comuni simili
          vanno letti con cautela.
        </p>
      )}
      {/* Indice di spesa non classificata: quanto di cio' che il comune ha pagato si
          riesce a ricondurre a un servizio e quanto no. Dice quanto fidarsi delle
          barre qui sotto, e vale per tutti i comuni, non solo per i casi estremi. */}
      <section className="rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-inchiostro">Spesa riconducibile a un servizio</span>
          <span className="font-semibold text-inchiostro">{(100 - quotaNa).toFixed(0)}%</span>
        </div>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-sabbia/50">
          <div className="h-full bg-menta" style={{ width: `${100 - quotaNa}%` }} />
        </div>
        <p className="mt-1.5 text-xs leading-snug text-grigio">
          {quotaNa < 1
            ? "Quasi tutta la spesa ha una voce che dice a cosa serve."
            : `Il ${quotaNa.toFixed(0)}% (${eur(na!.importo, true)}) è registrato con voci generiche: non si può dire a quale servizio sia andato.`}{" "}
          Più il numero è basso, meno le aree qui sotto raccontano il comune.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
          In cosa spende · pagamenti {year}
        </h3>
        <ul className="space-y-2.5">
          {aree_con_spesa.map((a) => {
            const delta = a.mediana_pc > 0 ? ((a.pc - a.mediana_pc) / a.mediana_pc) * 100 : null;
            return (
              <li key={a.area}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-inchiostro">{AREE[a.area] ?? a.area}</span>
                  <span className="shrink-0 text-grigio">
                    {eur(a.importo, true)} · {eur(a.pc)}/ab
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sabbia/50">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(100 * a.importo) / massimo}%`,
                      backgroundColor: a.area === "non_attribuibile" ? "#CFC6B3" : (COLORE_AREA[a.area] ?? "#3B3BD6"),
                    }}
                  />
                </div>
                {a.area !== "non_attribuibile" && a.n_simili > 1 && (
                  <div className="mt-0.5 text-xs text-grigio">
                    mediana dei simili {eur(a.mediana_pc)}/ab
                    {delta != null && Math.abs(delta) >= 1 && (
                      <>
                        {" "}
                        {Math.abs(delta) >= 1000
                          ? `${(a.pc / a.mediana_pc).toFixed(0)} volte`
                          : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)}%`}
                      </>
                    )}
                    {" "}· spende più del {a.rango}% dei {a.n_simili - 1} altri
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
          Per natura della spesa
        </h3>
        <ul className="space-y-1">
          {nature
            .filter((n) => n.importo > 0)
            .map((n) => (
              <li key={n.natura} className="flex justify-between text-xs">
                <span className="text-inchiostro">{NATURE[n.natura] ?? n.natura}</span>
                <span className="text-grigio">
                  {eur(n.importo, true)} · {((100 * n.importo) / totale).toFixed(0)}%
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
          Le voci più pesanti
        </h3>
        <ol className="space-y-1.5">
          {voci.slice(0, 10).map((v) => (
            <li key={v.codice} className="text-xs leading-snug">
              <div className="flex justify-between gap-2">
                <span className="text-inchiostro">{v.descrizione}</span>
                <span className="shrink-0 text-grigio">{eur(v.importo, true)}</span>
              </div>
              <div className="text-xs text-grigio">
                {AREE[v.area] ?? v.area} · {v.codice}
              </div>
            </li>
          ))}
        </ol>
        {voci.length > 10 && (
          <p className="mt-2 text-xs text-grigio">
            Altre {voci.length - 10 + altre_voci.n} voci per {eur(
              voci.slice(10).reduce((s, v) => s + v.importo, 0) + altre_voci.importo,
              true,
            )}.
          </p>
        )}
      </section>

      <p className="text-xs leading-snug text-grigio">
        Dati di cassa SIOPE (pagamenti). L&apos;attribuzione di ogni voce a un&apos;area è una scelta
        redazionale, pubblicata e verificabile nel repository.
      </p>
    </div>
  );
}
