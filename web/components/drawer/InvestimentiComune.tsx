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
      <div className="flex justify-between text-xs">
        <span className="text-inchiostro">{etichetta}</span>
        <span className="text-grigio">{dettaglio}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sabbia/50">
        <div className="h-full rounded-full bg-lilla" style={{ width: `${Math.min(100, Math.max(0, valore))}%` }} />
      </div>
    </div>
  );
}

export default function InvestimentiComune({ inv }: { inv: Investimenti | null }) {
  if (!inv) {
    return (
      <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-3 text-sm text-grigio">
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
      <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <h3 className="text-xs uppercase tracking-wider text-grigio">PNRR · progetti gestiti dal comune</h3>

        {pnrr.n === 0 ? (
          <p className="text-sm text-inchiostro">
            Nessun progetto PNRR risulta realizzato direttamente da questo comune.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-grigio">Finanziamento PNRR</div>
                <div className="text-lg font-semibold text-inchiostro">{eurBreve(pnrr.fin_pnrr)}</div>
                <div className="text-xs text-grigio">{num(pnrr.n)} progetti</div>
              </div>
              <div>
                <div className="text-xs text-grigio">Per abitante</div>
                <div className="text-lg font-semibold text-inchiostro">{eur(pnrr.pc)}</div>
                <div className="text-xs text-grigio">mediana dei simili {eur(pnrr.mediana_pc)}</div>
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
                    className="rounded-full border border-[#E8DEC8] bg-carta px-2 py-0.5 text-xs text-inchiostro"
                  >
                    {m.missione} · {eurBreve(m.fin_pnrr)}
                  </span>
                ))}
              </div>
            )}

            {quotaPnrr != null && quotaPnrr >= 50 && (
              <p className="rounded-2xl bg-limone/30 px-2 py-1.5 text-xs leading-snug text-inchiostro">
                Un solo progetto pesa il {Math.round(quotaPnrr)}% del totale: il valore per abitante dipende
                da quell&apos;opera.
              </p>
            )}

            <ol className="space-y-1.5 pt-1">
              {pnrr.progetti.slice(0, 5).map((p) => (
                <li key={p.cup} className="text-xs leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="text-inchiostro">{p.titolo ?? "(senza titolo)"}</span>
                    <span className="shrink-0 text-grigio">{eurBreve(p.fin_pnrr)}</span>
                  </div>
                  <div className="text-xs text-grigio">
                    {p.stato ?? "n.d."} · CUP {p.cup}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="text-xs leading-snug text-grigio">
          Sono i progetti di cui il comune è il soggetto attuatore. Gli interventi realizzati sul suo territorio da
          RFI, ministeri, Regioni, ASL o altri enti non sono attribuibili a un comune: il PNRR non li localizza.
          Fonte: Italia Domani (Struttura di missione PNRR), dati aggiornati a giugno 2026.
        </p>
      </section>

      {/* ------------------------------------------------------------ coesione */}
      <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <h3 className="text-xs uppercase tracking-wider text-grigio">Opere pubbliche · politiche di coesione</h3>

        {opere.n === 0 ? (
          <p className="text-sm text-inchiostro">
            Nessuna opera pubblica di coesione localizzata solo in questo comune.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-grigio">Finanziamento pubblico</div>
                <div className="text-lg font-semibold text-inchiostro">{eurBreve(opere.fin)}</div>
                <div className="text-xs text-grigio">
                  {num(opere.n)} opere · pagato {eurBreve(opere.pagamenti)}
                </div>
              </div>
              <div>
                <div className="text-xs text-grigio">Per abitante</div>
                <div className="text-lg font-semibold text-inchiostro">{eur(opere.pc)}</div>
                <div className="text-xs text-grigio">mediana dei simili {eur(opere.mediana_pc)}</div>
              </div>
            </div>

            <Barra
              valore={opere.rango}
              etichetta="Opere per abitante"
              dettaglio={`più alto del ${opere.rango}% dei ${num(opere.n_simili - 1)} simili`}
            />

            <div className="flex flex-wrap gap-1.5">
              {ordinaCicli(opere.cicli).map((c) => (
                <span key={c.ciclo} className="rounded-full border border-[#E8DEC8] bg-carta px-2 py-0.5 text-xs text-inchiostro">
                  {CICLI[c.ciclo] ?? `ciclo ${c.ciclo}`} · {num(c.n)} · {eurBreve(c.fin)}
                </span>
              ))}
            </div>

            {quotaOpere != null && quotaOpere >= 50 && (
              <p className="rounded-2xl bg-limone/30 px-2 py-1.5 text-xs leading-snug text-inchiostro">
                Un&apos;opera sola pesa il {Math.round(quotaOpere)}% del totale: il valore per abitante dipende da
                quell&apos;opera.
              </p>
            )}

            <ol className="space-y-1.5 pt-1">
              {opere.progetti.slice(0, 5).map((p, i) => (
                <li key={i} className="text-xs leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="text-inchiostro">{p.titolo ?? "(senza titolo)"}</span>
                    <span className="shrink-0 text-grigio">{eurBreve(p.fin)}</span>
                  </div>
                  <div className="text-xs text-grigio">
                    {p.stato ?? "n.d."} · {p.ciclo != null ? (CICLI[p.ciclo] ?? "") : ""}
                    {p.inizio ? ` · dal ${p.inizio}` : ""}
                    {p.link && (
                      <>
                        {" · "}
                        <a href={p.link} target="_blank" rel="noopener noreferrer" className="underline decoration-grigio hover:text-inchiostro">
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
          <p className="text-xs leading-snug text-grigio">
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

        <p className="text-xs leading-snug text-grigio">
          Solo progetti localizzati su questo unico comune: quelli che toccano più comuni, una provincia o una regione
          non si possono dividere e non sono attribuiti. Fonte: OpenCoesione (CC BY 4.0).
        </p>
      </section>
    </div>
  );
}
