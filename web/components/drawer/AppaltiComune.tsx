"use client";

// "Appalti": le gare e gli affidamenti banditi dal comune (ANAC). Mostra soprattutto cio' che e'
// robusto: quanti lotti, che quota e' affidamento diretto e come si confronta con i comuni simili
// dello stesso anno. Gli importi si sommano solo sui lotti attendibili, e la scheda dice quanti sono
// stati esclusi e perche': sommare gli importi grezzi darebbe numeri assurdi.

import { useState } from "react";
import {
  annoDisponibile,
  FAMIGLIE,
  nuovaRilevazione,
  type Appalti,
  type Concorrenza,
} from "@/lib/appalti";

const eurBreve = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(v);
const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const num = (v: number) => new Intl.NumberFormat("it-IT").format(v);

export default function AppaltiComune({
  appalti,
  concorrenza,
  anno,
}: {
  appalti: Appalti | null;
  concorrenza?: Concorrenza | null;
  anno: number;
}) {
  // L'anno si puo' cambiare dalla tabella anno per anno: gli appalti arrivano al 2025, i bilanci al 2024
  const [scelto, setScelto] = useState<number | null>(null);
  if (!appalti) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        Nessun appalto bandito direttamente da questo comune risulta nella banca dati ANAC.
      </p>
    );
  }
  const a_ = annoDisponibile(appalti.anni, scelto ?? anno);
  const a = a_ == null ? null : appalti.anni[String(a_)];
  if (a_ == null || !a) return null;
  const serie = Object.entries(appalti.anni).sort(([x], [y]) => Number(x) - Number(y));
  const conc = concorrenza?.[String(a_)] ?? null;
  const confrontabile = a.mediana_quota_diretti != null && a.quota_diretti != null && a.rango_diretti != null;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">
          Appalti banditi dal comune · {a_}
        </h3>
        {scelto == null && a_ !== anno && (
          <p className="text-[11px] text-amber-200">Per il {anno} non ci sono dati: mostro il {a_}.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-slate-400">Lotti pubblicati</div>
            <div className="text-lg font-semibold text-slate-100">{num(a.n)}</div>
            <div className="text-[11px] text-slate-400">
              {a.n_per_1000 != null ? `${a.n_per_1000.toLocaleString("it-IT")} ogni 1.000 abitanti` : ""}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Affidamenti diretti</div>
            <div className="text-lg font-semibold text-slate-100">
              {a.quota_diretti != null ? `${a.quota_diretti.toLocaleString("it-IT")}%` : "—"}
            </div>
            <div className="text-[11px] text-slate-400">
              {confrontabile ? `mediana dei simili ${a.mediana_quota_diretti!.toLocaleString("it-IT")}%` : "pochi lotti per confrontare"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Valore mediano di un lotto</div>
            <div className="text-lg font-semibold text-slate-100">{eur(a.importo_mediano)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Valore dei lotti attendibili</div>
            <div className="text-lg font-semibold text-slate-100">{eurBreve(a.importo)}</div>
          </div>
        </div>

        {confrontabile && (
          <div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Quota di affidamenti diretti</span>
              <span className="text-slate-400">
                più alta del {a.rango_diretti}% dei {num(a.n_simili - 1)} simili
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/60">
              <div className="h-full rounded-full bg-rose-400/70" style={{ width: `${a.rango_diretti}%` }} />
            </div>
          </div>
        )}

        <ul className="space-y-1 text-[11px] leading-snug text-slate-400">
          {a.quota_piattaforma != null && <li>Svolti su piattaforma telematica: {a.quota_piattaforma.toLocaleString("it-IT")}% dei lotti.</li>}
          {a.n_pnrr > 0 && <li>{num(a.n_pnrr)} lotti finanziati dal PNRR o dal PNC.</li>}
          {a.n_adesioni > 0 && (
            <li>
              {num(a.n_adesioni)} adesioni a convenzioni o accordi quadro: il loro importo è il massimale
              dell&apos;accordo, non una spesa del comune, quindi non è sommato.
            </li>
          )}
          {a.n_importo_anomalo > 0 && (
            <li className="text-amber-200">
              {num(a.n_importo_anomalo)} lotti con un importo impossibile (oltre 10 volte tutti i pagamenti annui del
              comune: un refuso) esclusi dai totali.
            </li>
          )}
          {a.n_senza_importo > 0 && <li>Per {num(a.n_senza_importo)} lotti l&apos;importo non è indicato.</li>}
        </ul>

        {nuovaRilevazione(a_) && (
          <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
            Dal 2024 cambia la rilevazione ANAC (nuovo codice dei contratti, CIG anche per i micro-affidamenti): il
            numero di lotti, la quota di affidamenti diretti e il valore mediano non sono confrontabili con gli anni
            prima. Il confronto con i comuni simili dello stesso anno resta valido.
          </p>
        )}
      </section>

      {conc && (
        <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Concorrenza nelle gare · {a_}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400">Gare con una sola offerta</div>
              <div className="text-lg font-semibold text-slate-100">
                {conc.quota_offerta_unica != null ? `${conc.quota_offerta_unica.toLocaleString("it-IT")}%` : "—"}
              </div>
              <div className="text-[11px] text-slate-400">
                {conc.quota_offerta_unica != null && conc.mediana_quota_offerta_unica != null
                  ? `mediana dei simili ${conc.mediana_quota_offerta_unica.toLocaleString("it-IT")}%`
                  : "poche gare per confrontare"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Ribasso mediano</div>
              <div className="text-lg font-semibold text-slate-100">
                {conc.ribasso_mediano != null ? `${conc.ribasso_mediano.toLocaleString("it-IT")}%` : "—"}
              </div>
              <div className="text-[11px] text-slate-400">
                {conc.offerte_mediane != null ? `offerte mediane: ${conc.offerte_mediane.toLocaleString("it-IT")}` : ""}
              </div>
            </div>
          </div>
          {conc.quota_offerta_unica != null && conc.rango_offerta_unica != null && (
            <div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-300">Meno concorrenza</span>
                <span className="text-slate-400">
                  più alta del {conc.rango_offerta_unica}% dei {num(conc.n_simili - 1)} simili
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700/60">
                <div className="h-full rounded-full bg-rose-400/70" style={{ width: `${conc.rango_offerta_unica}%` }} />
              </div>
            </div>
          )}
          <p className="text-[10px] leading-snug text-slate-500">
            {num(conc.n_gare)} gare aggiudicate (procedure aperte, ristrette e negoziate); gli affidamenti diretti non
            contano. Nell&apos;anno più recente alcune gare possono non essere ancora aggiudicate. Fonte: ANAC,
            aggiudicazioni (CC BY-SA 4.0).
          </p>
        </section>
      )}

      {serie.length > 1 && (
        <section className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Anno per anno · clicca per vedere un anno</h3>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-0.5 text-left font-medium">Anno</th>
                <th className="py-0.5 text-right font-medium">Lotti</th>
                <th className="py-0.5 text-right font-medium">Diretti</th>
                <th className="py-0.5 text-right font-medium">Valore</th>
              </tr>
            </thead>
            <tbody>
              {serie.map(([y, v]) => (
                <tr
                  key={y}
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${
                    Number(y) === a_ ? "text-white" : "text-slate-300"
                  }`}
                  onClick={() => setScelto(Number(y))}
                >
                  <td className="py-0.5">
                    {y}
                    {nuovaRilevazione(Number(y)) ? " *" : ""}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{num(v.n)}</td>
                  <td className="py-0.5 text-right tabular-nums">{v.quota_diretti != null ? `${v.quota_diretti.toLocaleString("it-IT")}%` : "—"}</td>
                  <td className="py-0.5 text-right tabular-nums">{eurBreve(v.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500">* Nuova rilevazione dal 2024: non confrontabile con gli anni precedenti.</p>
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Come sono stati affidati ({serie[0][0]}-{serie[serie.length - 1][0]})</h3>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
          {Object.entries(appalti.famiglie)
            .sort(([, x], [, y]) => y - x)
            .map(([f, n]) => (
              <li key={f} className="flex justify-between gap-2">
                <span>{FAMIGLIE[f] ?? f}</span>
                <span className="tabular-nums text-slate-400">{num(n)}</span>
              </li>
            ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(appalti.tipi).map(([t, n]) => (
            <span key={t} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
              {t.toLowerCase()} · {num(n)}
            </span>
          ))}
        </div>
      </section>

      {appalti.maggiori.length > 0 && (
        <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400">I lotti più grandi</h3>
          <ol className="space-y-1.5">
            {appalti.maggiori.slice(0, 5).map((m) => (
              <li key={m.cig} className="text-[11px] leading-snug">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-200">{m.oggetto ?? "(senza oggetto)"}</span>
                  <span className="shrink-0 text-slate-400">{eurBreve(m.importo)}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {m.anno} · {m.tipo?.toLowerCase() ?? "n.d."} · {m.procedura?.toLowerCase() ?? "n.d."} · CIG {m.cig}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-[10px] leading-snug text-slate-500">
        Solo i lotti banditi dal comune stesso: non quelli di centrali di committenza, ASL, società partecipate o
        altri enti per suo conto. L&apos;importo è quello a base di gara dichiarato, non quanto è stato pagato. Fonte:
        ANAC, Banca dati nazionale dei contratti pubblici (CC BY-SA 4.0).
      </p>
    </div>
  );
}
