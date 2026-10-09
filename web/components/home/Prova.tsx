"use client";

import Link from "next/link";
import { euro } from "@/lib/viralita/genera";
import { useInView } from "./useInView";

export interface ProvaDati {
  nome: string;
  provincia: string;
  anno: number;
  spesa: number;
  mediana: number;
  autonomia: number | null;
  istat: string;
}

/** La prova reale in home: due barre che crescono quando la sezione entra nello schermo */
export default function Prova({ dati }: { dati: ProvaDati }) {
  const { ref, visto } = useInView<HTMLDivElement>();
  const massimo = Math.max(dati.spesa, dati.mediana) * 1.1;
  const larghezza = (x: number) => `${Math.round((x / massimo) * 100)}%`;
  const piu = dati.spesa >= dati.mediana;

  return (
    <div ref={ref} className="rounded-[32px] border border-[#E8DEC8] bg-carta p-6 sm:p-8">
      <p className="font-codice text-sm uppercase tracking-wide text-grigio">Un esempio reale · {dati.anno}</p>
      <h3 className="mt-3 font-display text-3xl font-semibold leading-tight">
        {dati.nome}: {euro(dati.spesa)} per abitante
      </h3>
      <p className="mt-2 text-base text-grigio">
        La spesa è {piu ? "più alta" : "più bassa"} della mediana dei comuni della sua fascia ({euro(dati.mediana)}).
      </p>

      <div className="mt-6 space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-base">
            <span className="font-semibold">{dati.nome}</span>
            <span className="font-codice">{euro(dati.spesa)}</span>
          </div>
          <div className="mt-2 h-5 overflow-hidden rounded-full bg-sabbia/40">
            <div
              className="prova-barra h-full rounded-full bg-mirtillo transition-[width] duration-[1200ms] ease-out"
              style={{ width: visto ? larghezza(dati.spesa) : "0%", ["--larghezza" as string]: larghezza(dati.spesa) }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-base">
            <span className="text-grigio">Mediana dei comuni simili</span>
            <span className="font-codice text-grigio">{euro(dati.mediana)}</span>
          </div>
          <div className="mt-2 h-5 overflow-hidden rounded-full bg-sabbia/40">
            <div
              className="prova-barra h-full rounded-full bg-sabbia transition-[width] duration-[1200ms] delay-200 ease-out"
              style={{ width: visto ? larghezza(dati.mediana) : "0%", ["--larghezza" as string]: larghezza(dati.mediana) }}
            />
          </div>
        </div>
      </div>

      {/* Senza JavaScript le barre restano al valore finale */}
      <noscript>
        <style>{`.prova-barra{width:var(--larghezza)!important}`}</style>
      </noscript>

      <p className="mt-6 text-sm text-grigio">
        Dati di cassa (SIOPE): incassi e pagamenti effettivi, non il bilancio approvato.
        {dati.autonomia != null && ` Autonomia finanziaria: ${dati.autonomia.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%.`}
      </p>
      <Link href={`/mappa?comune=${dati.istat}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-mirtillo underline underline-offset-2">
        Apri la scheda di {dati.nome}
      </Link>
    </div>
  );
}
