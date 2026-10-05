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
      <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-3 text-sm text-grigio">
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
      <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <h3 className="text-xs uppercase tracking-wider text-grigio">
          Appalti banditi dal comune · {a_}
        </h3>
        {scelto == null && a_ !== anno && (
          <p className="text-xs text-inchiostro">Per il {anno} non ci sono dati: mostro il {a_}.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-grigio">Lotti pubblicati</div>
            <div className="text-lg font-semibold text-inchiostro">{num(a.n)}</div>
            <div className="text-xs text-grigio">
              {a.n_per_1000 != null ? `${a.n_per_1000.toLocaleString("it-IT")} ogni 1.000 abitanti` : ""}
            </div>
          </div>
          <div>
            <div className="text-xs text-grigio">Affidamenti diretti</div>
            <div className="text-lg font-semibold text-inchiostro">
              {a.quota_diretti != null ? `${a.quota_diretti.toLocaleString("it-IT")}%` : "—"}
            </div>
            <div className="text-xs text-grigio">
              {confrontabile ? `mediana dei simili ${a.mediana_quota_diretti!.toLocaleString("it-IT")}%` : "pochi lotti per confrontare"}
            </div>
          </div>
          <div>
            <div className="text-xs text-grigio">Valore mediano di un lotto</div>
            <div className="text-lg font-semibold text-inchiostro">{eur(a.importo_mediano)}</div>
          </div>
          <div>
            <div className="text-xs text-grigio">Valore dei lotti attendibili</div>
            <div className="text-lg font-semibold text-inchiostro">{eurBreve(a.importo)}</div>
          </div>
        </div>

        {confrontabile && (
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-inchiostro">Quota di affidamenti diretti</span>
              <span className="text-grigio">
                più alta del {a.rango_diretti}% dei {num(a.n_simili - 1)} simili
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sabbia/50">
              <div className="h-full rounded-full bg-pomodoro/15" style={{ width: `${a.rango_diretti}%` }} />
            </div>
          </div>
        )}

        <ul className="space-y-1 text-xs leading-snug text-grigio">
          {a.quota_piattaforma != null && <li>Svolti su piattaforma telematica: {a.quota_piattaforma.toLocaleString("it-IT")}% dei lotti.</li>}
          {a.n_pnrr > 0 && <li>{num(a.n_pnrr)} lotti finanziati dal PNRR o dal PNC.</li>}
          {a.n_adesioni > 0 && (
            <li>
              {num(a.n_adesioni)} adesioni a convenzioni o accordi quadro: il loro importo è il massimale
              dell&apos;accordo, non una spesa del comune, quindi non è sommato.
            </li>
          )}
          {a.n_importo_anomalo > 0 && (
            <li className="text-inchiostro">
              {num(a.n_importo_anomalo)} lotti con un importo impossibile (oltre 10 volte tutti i pagamenti annui del
              comune: un refuso) esclusi dai totali.
            </li>
          )}
          {a.n_senza_importo > 0 && <li>Per {num(a.n_senza_importo)} lotti l&apos;importo non è indicato.</li>}
        </ul>

        {nuovaRilevazione(a_) && (
          <p className="rounded-2xl bg-limone/30 px-2 py-1.5 text-xs leading-snug text-inchiostro">
            Dal 2024 cambia la rilevazione ANAC (nuovo codice dei contratti, CIG anche per i micro-affidamenti): il
            numero di lotti, la quota di affidamenti diretti e il valore mediano non sono confrontabili con gli anni
            prima. Il confronto con i comuni simili dello stesso anno resta valido.
          </p>
        )}
      </section>

      {conc && (
        <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
          <h3 className="text-xs uppercase tracking-wider text-grigio">Concorrenza nelle gare · {a_}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-grigio">Gare con una sola offerta</div>
              <div className="text-lg font-semibold text-inchiostro">
                {conc.quota_offerta_unica != null ? `${conc.quota_offerta_unica.toLocaleString("it-IT")}%` : "—"}
              </div>
              <div className="text-xs text-grigio">
                {conc.quota_offerta_unica != null && conc.mediana_quota_offerta_unica != null
                  ? `mediana dei simili ${conc.mediana_quota_offerta_unica.toLocaleString("it-IT")}%`
                  : "poche gare per confrontare"}
              </div>
            </div>
            <div>
              <div className="text-xs text-grigio">Ribasso mediano</div>
              <div className="text-lg font-semibold text-inchiostro">
                {conc.ribasso_mediano != null ? `${conc.ribasso_mediano.toLocaleString("it-IT")}%` : "—"}
              </div>
              <div className="text-xs text-grigio">
                {conc.offerte_mediane != null ? `offerte mediane: ${conc.offerte_mediane.toLocaleString("it-IT")}` : ""}
              </div>
            </div>
          </div>
          {conc.quota_offerta_unica != null && conc.rango_offerta_unica != null && (
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-inchiostro">Meno concorrenza</span>
                <span className="text-grigio">
                  più alta del {conc.rango_offerta_unica}% dei {num(conc.n_simili - 1)} simili
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sabbia/50">
                <div className="h-full rounded-full bg-pomodoro/15" style={{ width: `${conc.rango_offerta_unica}%` }} />
              </div>
            </div>
          )}
          <p className="text-xs leading-snug text-grigio">
            {num(conc.n_gare)} gare aggiudicate (procedure aperte, ristrette e negoziate); gli affidamenti diretti non
            contano. Nell&apos;anno più recente alcune gare possono non essere ancora aggiudicate. Fonte: ANAC,
            aggiudicazioni (CC BY-SA 4.0).
          </p>
        </section>
      )}

      {serie.length > 1 && (
        <section className="space-y-1 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
          <h3 className="text-xs uppercase tracking-wider text-grigio">Anno per anno · clicca per vedere un anno</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-grigio">
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
                  className={`cursor-pointer border-t border-[#E8DEC8] hover:bg-sabbia/30 ${
                    Number(y) === a_ ? "text-inchiostro" : "text-inchiostro"
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
          <p className="text-xs text-grigio">* Nuova rilevazione dal 2024: non confrontabile con gli anni precedenti.</p>
        </section>
      )}

      <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
        <h3 className="text-xs uppercase tracking-wider text-grigio">Come sono stati affidati ({serie[0][0]}-{serie[serie.length - 1][0]})</h3>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-inchiostro">
          {Object.entries(appalti.famiglie)
            .sort(([, x], [, y]) => y - x)
            .map(([f, n]) => (
              <li key={f} className="flex justify-between gap-2">
                <span>{FAMIGLIE[f] ?? f}</span>
                <span className="tabular-nums text-grigio">{num(n)}</span>
              </li>
            ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(appalti.tipi).map(([t, n]) => (
            <span key={t} className="rounded-full border border-[#E8DEC8] bg-carta px-2 py-0.5 text-xs text-inchiostro">
              {t.toLowerCase()} · {num(n)}
            </span>
          ))}
        </div>
      </section>

      {appalti.maggiori.length > 0 && (
        <section className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
          <h3 className="text-xs uppercase tracking-wider text-grigio">I lotti più grandi</h3>
          <ol className="space-y-1.5">
            {appalti.maggiori.slice(0, 5).map((m) => (
              <li key={m.cig} className="text-xs leading-snug">
                <div className="flex justify-between gap-2">
                  <span className="text-inchiostro">{m.oggetto ?? "(senza oggetto)"}</span>
                  <span className="shrink-0 text-grigio">{eurBreve(m.importo)}</span>
                </div>
                <div className="text-xs text-grigio">
                  {m.anno} · {m.tipo?.toLowerCase() ?? "n.d."} · {m.procedura?.toLowerCase() ?? "n.d."} · CIG {m.cig}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs leading-snug text-grigio">
        Solo i lotti banditi dal comune stesso: non quelli di centrali di committenza, ASL, società partecipate o
        altri enti per suo conto. L&apos;importo è quello a base di gara dichiarato, non quanto è stato pagato. Fonte:
        ANAC, Banca dati nazionale dei contratti pubblici (CC BY-SA 4.0).
      </p>
    </div>
  );
}
