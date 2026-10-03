"use client";

// "Opere e investimenti": cosa il PNRR e le politiche di coesione hanno portato (o stanno portando)
// in un comune. Due fonti diverse, tenute separate: dicono cose diverse e non si sommano.
//
//  · PNRR: sono i progetti di cui il COMUNE e' soggetto attuatore. Un intervento di RFI, di un
//    ministero, di una Regione o di una ASL sul suo territorio non e' attribuibile: il PNRR non lo
//    localizza. Quindi qui non c'e' "tutto il PNRR nel comune", ma "il PNRR gestito dal comune".
//  · Coesione: opere localizzate su quel comune, chiunque le realizzi.

import { CICLI, GENERI_ALTRI, ordinaCicli, quotaDelPrimo, type Investimenti } from "@/lib/investimenti";

const eur = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

const eurBreve = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(v);

const num = (v: number) => new Intl.NumberFormat("it-IT").format(v);

function Barra({ valore, etichetta, dettaglio }: { valore: number; etichetta: string; dettaglio: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-300">{etichetta}</span>
        <span className="text-slate-400">{dettaglio}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/60">
        <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${Math.min(100, Math.max(0, valore))}%` }} />
      </div>
    </div>
  );
}

export default function InvestimentiComune({ inv }: { inv: Investimenti | null }) {
  if (!inv) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        Non ho i dati sugli investimenti di questo comune.
      </p>
    );
  }
  const { pnrr, coesione } = inv;
  const opere = coesione.opere;
  const altri = Object.entries(coesione.altri).filter(([, v]) => v.n > 0);
  const quotaPnrr = quotaDelPrimo(
    pnrr.progetti.map((p) => p.fin_pnrr),
    pnrr.fin_pnrr,
  );
  const quotaOpere = quotaDelPrimo(
    opere.progetti.map((p) => p.fin),
    opere.fin,
  );

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- PNRR */}
      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">PNRR · progetti gestiti dal comune</h3>

        {pnrr.n === 0 ? (
          <p className="text-xs text-slate-300">
            Nessun progetto PNRR risulta realizzato direttamente da questo comune.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-400">Finanziamento PNRR</div>
                <div className="text-lg font-semibold text-slate-100">{eurBreve(pnrr.fin_pnrr)}</div>
                <div className="text-[11px] text-slate-400">{num(pnrr.n)} progetti</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Per abitante</div>
                <div className="text-lg font-semibold text-slate-100">{eur(pnrr.pc)}</div>
                <div className="text-[11px] text-slate-400">mediana dei simili {eur(pnrr.mediana_pc)}</div>
              </div>
            </div>

            <Barra
              valore={pnrr.rango}
              etichetta="PNRR per abitante"
              dettaglio={`più alto del ${pnrr.rango}% dei ${num(pnrr.n_simili - 1)} simili`}
            />
            <Barra
              valore={(100 * pnrr.conclusi) / pnrr.n}
              etichetta="Progetti conclusi"
              dettaglio={`${num(pnrr.conclusi)} su ${num(pnrr.n)}`}
            />

            {pnrr.missioni.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {pnrr.missioni.map((m) => (
                  <span
                    key={m.missione}
                    title={m.descr ?? undefined}
                    className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    {m.missione} · {eurBreve(m.fin_pnrr)}
                  </span>
                ))}
              </div>
            )}

            {quotaPnrr != null && quotaPnrr >= 50 && (
              <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
                Un solo progetto pesa il {Math.round(quotaPnrr)}% del totale: il valore per abitante dipende
                da quell&apos;opera.
              </p>
            )}

            <ol className="space-y-1.5 pt-1">
              {pnrr.progetti.slice(0, 5).map((p) => (
                <li key={p.cup} className="text-[11px] leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200">{p.titolo ?? "(senza titolo)"}</span>
                    <span className="shrink-0 text-slate-400">{eurBreve(p.fin_pnrr)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {p.stato ?? "n.d."} · CUP {p.cup}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="text-[10px] leading-snug text-slate-500">
          Sono i progetti di cui il comune è il soggetto attuatore. Gli interventi realizzati sul suo territorio da
          RFI, ministeri, Regioni, ASL o altri enti non sono attribuibili a un comune: il PNRR non li localizza.
          Fonte: Italia Domani (Struttura di missione PNRR), dati aggiornati a giugno 2026.
        </p>
      </section>

      {/* ------------------------------------------------------------ coesione */}
      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Opere pubbliche · politiche di coesione</h3>

        {opere.n === 0 ? (
          <p className="text-xs text-slate-300">
            Nessuna opera pubblica di coesione localizzata solo in questo comune.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-400">Finanziamento pubblico</div>
                <div className="text-lg font-semibold text-slate-100">{eurBreve(opere.fin)}</div>
                <div className="text-[11px] text-slate-400">
                  {num(opere.n)} opere · pagato {eurBreve(opere.pagamenti)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Per abitante</div>
                <div className="text-lg font-semibold text-slate-100">{eur(opere.pc)}</div>
                <div className="text-[11px] text-slate-400">mediana dei simili {eur(opere.mediana_pc)}</div>
              </div>
            </div>

            <Barra
              valore={opere.rango}
              etichetta="Opere per abitante"
              dettaglio={`più alto del ${opere.rango}% dei ${num(opere.n_simili - 1)} simili`}
            />

            <div className="flex flex-wrap gap-1.5">
              {ordinaCicli(opere.cicli).map((c) => (
                <span key={c.ciclo} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                  {CICLI[c.ciclo] ?? `ciclo ${c.ciclo}`} · {num(c.n)} · {eurBreve(c.fin)}
                </span>
              ))}
            </div>

            {quotaOpere != null && quotaOpere >= 50 && (
              <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
                Un&apos;opera sola pesa il {Math.round(quotaOpere)}% del totale: il valore per abitante dipende da
                quell&apos;opera.
              </p>
            )}

            <ol className="space-y-1.5 pt-1">
              {opere.progetti.slice(0, 5).map((p, i) => (
                <li key={i} className="text-[11px] leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200">{p.titolo ?? "(senza titolo)"}</span>
                    <span className="shrink-0 text-slate-400">{eurBreve(p.fin)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {p.stato ?? "n.d."} · {p.ciclo != null ? (CICLI[p.ciclo] ?? "") : ""}
                    {p.inizio ? ` · dal ${p.inizio}` : ""}
                    {p.link && (
                      <>
                        {" · "}
                        <a href={p.link} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-600 hover:text-slate-300">
                          scheda OpenCoesione
                        </a>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {altri.length > 0 && (
          <p className="text-[11px] leading-snug text-slate-400">
            Oltre alle opere, nel comune risultano:{" "}
            {altri.map(([genere, v], i) => (
              <span key={genere}>
                {i > 0 ? "; " : ""}
                {num(v.n)} {GENERI_ALTRI[genere] ?? genere} ({eurBreve(v.fin)})
              </span>
            ))}
            . Di questi non si mostrano i nomi: sono persone e imprese private.
          </p>
        )}

        <p className="text-[10px] leading-snug text-slate-500">
          Solo progetti localizzati su questo unico comune: quelli che toccano più comuni, una provincia o una regione
          non si possono dividere e non sono attribuiti. Fonte: OpenCoesione (CC BY 4.0).
        </p>
      </section>
    </div>
  );
}
