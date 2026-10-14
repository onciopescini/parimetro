import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ModuloSegnala from "./ModuloSegnala";

export const metadata: Metadata = {
  title: "Segnala un errore · Parimetro",
  description: "Un numero non ti torna? Dicci quale e dove si può verificare: lo controlliamo sulla fonte e lo correggiamo.",
};

const H2 = "mt-10 font-display text-2xl font-semibold leading-tight";

export default function Segnala() {
  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pt-6">
          <Link href="/" className="flex min-h-11 items-center gap-2" aria-label="Parimetro, torna alla home">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </Link>
          <nav className="flex items-center gap-4 text-base font-semibold">
            <Link href="/mappa" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Mappa</Link>
            <Link href="/metodo" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Metodo</Link>
          </nav>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">Segnala un errore</h1>
        <p className="mt-4 text-xl leading-relaxed">
          Un numero non ti torna? Spesso la causa è il metodo (dati di cassa, fasce di popolazione), a volte è davvero un errore nella fonte o nel nostro
          calcolo. In tutti e due i casi vogliamo saperlo.
        </p>

        <Suspense fallback={null}>
          <ModuloSegnala />
        </Suspense>

        <h2 className={H2}>Che cosa succede dopo</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Controlliamo il numero sulla fonte originale (SIOPE/BDAP, ISTAT, ANAC, MEF, Italia Domani, OpenCoesione).</li>
          <li>Se è un nostro errore, lo correggiamo e lo diciamo. Se è un errore della fonte, lo segnaliamo alla fonte e lo scriviamo nella scheda del comune.</li>
          <li>Se è una questione di metodo, rispondiamo con la spiegazione: trovi le regole in <Link className="font-semibold text-mirtillo underline underline-offset-2" href="/metodo">Come sono calcolati i numeri</Link>.</li>
        </ul>

        <h2 className={H2}>Sei un comune o un ente?</h2>
        <p className="mt-3">
          Scrivici lo stesso: se ci indichi il documento che mostra la cifra corretta, la verifichiamo e, se serve, aggiungiamo una nota alla scheda.
          Le classificazioni dei lotti (a cosa servono le gare, che cosa si compra) sono automatiche e non un dato ANAC: se un lotto è classificato male,
          segnalalo con il codice CIG.
        </p>
      </div>
    </main>
  );
}
