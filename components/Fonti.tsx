"use client";

// Riga di attribuzione sempre visibile e pannello "Fonti e metodo".
// Le attribuzioni non sono un vezzo: ISTAT e BDAP/SIOPE sono CC BY, e la mappa di
// base (OpenStreetMap / CARTO) le richiede per licenza.

import { useState } from "react";
import { X } from "lucide-react";

export default function Fonti() {
  const [aperto, setAperto] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-1">
        <p className="pointer-events-auto rounded bg-slate-950/60 px-2 py-0.5 text-center text-[10px] leading-tight text-slate-400 backdrop-blur-sm">
          Dati ISTAT e BDAP/SIOPE (CC BY) · © OpenStreetMap · © CARTO ·{" "}
          <button
            onClick={() => setAperto(true)}
            className="underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
          >
            Fonti e metodo
          </button>
        </p>
      </div>

      {aperto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm md:items-center"
          onClick={() => setAperto(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Fonti e metodo"
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 text-sm leading-relaxed text-slate-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-100">Fonti e metodo</h2>
              <button
                onClick={() => setAperto(false)}
                aria-label="Chiudi"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">
              Da dove vengono i numeri
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-slate-100">ISTAT</strong>: confini comunali e popolazione
                residente (licenza CC BY 4.0).
              </li>
              <li>
                <strong className="text-slate-100">BDAP / SIOPE</strong>, Ragioneria Generale dello
                Stato: incassi e pagamenti mensili di ogni comune, voce per voce (dati aperti, CC BY).
              </li>
              <li>Mappa di base: © OpenStreetMap contributors, © CARTO.</li>
            </ul>

            <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">
              Cosa significano
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-slate-100">Sono dati di cassa</strong>: soldi realmente
                incassati e pagati nell&apos;anno, non accertamenti e impegni. Non coincidono col
                rendiconto del comune, che è di competenza.
              </li>
              <li>
                <strong className="text-slate-100">Il rango (0-100)</strong> dice dove sta il comune
                fra quelli della sua fascia di popolazione, su autonomia finanziaria e saldo di
                gestione (senza i prestiti accesi e rimborsati). Non è un voto alla
                gestione: in una fascia dove tutti stanno male, qualcuno segna comunque 100.
              </li>
              <li>
                <strong className="text-slate-100">Le aree di spesa</strong> (rifiuti, strade,
                scuole…) sono una nostra classificazione delle voci del piano dei conti. Dove la
                voce è generica (&ldquo;altri servizi&rdquo;) la spesa resta{" "}
                <em>non attribuibile</em> e lo diciamo.
              </li>
              <li>
                Una <strong className="text-slate-100">spesa concentrata</strong> (una sola voce sopra
                il 40% dell&apos;anno) di solito è un investimento isolato: il pro capite di
                quell&apos;anno non è confrontabile con i comuni vicini.
              </li>
            </ul>

            <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">
              Limiti
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                I comuni nati da fusioni sono ricostruiti sommando i comuni di origine negli anni
                precedenti.
              </li>
              <li>
                Se un comune ha pagamenti ma nessun incasso in un anno, le entrate sono{" "}
                <em>dato mancante</em>, non zero. Mancano del tutto Caines/Kuens (non presente in
                SIOPE) e Misiliscemi per il 2020-21.
              </li>
              <li>Un dato anomalo non è per forza un errore: può essere un anno eccezionale.</li>
              <li>
                <strong className="text-slate-100">Chat:</strong> le domande sono elaborate da modelli AI
                di terzi tramite OpenRouter. Il sito non le conserva e non chiede dati personali: non
                scriverne nelle domande.
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
