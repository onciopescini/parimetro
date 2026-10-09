import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Parimetro · i bilanci dei comuni italiani",
  description: "In cosa spende il tuo comune, e come si colloca rispetto ai comuni simili. Dati ufficiali, con la fonte accanto a ogni numero.",
};

const H2 = "font-display text-3xl font-semibold leading-tight sm:text-4xl";
const CARD = "rounded-[32px] border border-[#E8DEC8] bg-carta p-6";
const BOTTONE = "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-7 text-lg font-semibold transition active:translate-y-0.5";

export default function Home() {
  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Intestazione */}
        <header className="flex items-center justify-between pt-6">
          <p className="flex items-center gap-2" aria-label="Parimetro">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </p>
          <nav className="flex items-center gap-4 text-base font-semibold">
            <Link href="/comuni" className="underline-offset-4 hover:underline">Comuni</Link>
            <Link href="/gioco" className="underline-offset-4 hover:underline">Gioco</Link>
            <Link href="/metodo" className="underline-offset-4 hover:underline">Metodo</Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
          </nav>
        </header>

        {/* Presentazione */}
        <section className="pt-14 sm:pt-20">
          <p className="inline-flex rounded-full bg-limone px-4 py-1.5 text-sm font-semibold">Dati ufficiali dei comuni italiani</p>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] sm:text-6xl">
            In cosa spende il tuo comune, e come si colloca.
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed">
            Parimetro mostra la spesa e le entrate di ogni comune italiano, e le confronta con i comuni di dimensione simile. Ogni numero ha la sua fonte
            accanto. Non ti diciamo se un&apos;amministrazione è brava o no: ti diamo i dati, e tu decidi che cosa pensarne.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/mappa" className={`${BOTTONE} bg-limone text-inchiostro shadow-[0_4px_0_#1B1A2E] hover:brightness-95`}>
              Apri la mappa
            </Link>
            <Link href="/comuni" className={`${BOTTONE} border border-[#E8DEC8] bg-carta hover:bg-sabbia/30`}>
              Cerca un comune
            </Link>
          </div>
        </section>

        {/* Come si usa */}
        <section className="mt-20" aria-labelledby="come-si-usa">
          <h2 id="come-si-usa" className={H2}>Come si usa, in tre passi</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            <li className={CARD}>
              <span className="grid size-12 place-items-center rounded-full bg-mirtillo font-display text-xl font-bold text-white">1</span>
              <h3 className="mt-4 font-display text-2xl font-semibold">Trova il tuo comune</h3>
              <p className="mt-2 text-base text-grigio">Cerca il nome nella mappa. Ogni comune è un blocco: più è alto, più spende per abitante.</p>
            </li>
            <li className={CARD}>
              <span className="grid size-12 place-items-center rounded-full bg-limone font-display text-xl font-bold text-inchiostro">2</span>
              <h3 className="mt-4 font-display text-2xl font-semibold">Leggi la scheda</h3>
              <p className="mt-2 text-base text-grigio">Dove vanno i soldi, come sono andati i conti negli anni e come si confronta con i comuni simili.</p>
            </li>
            <li className={CARD}>
              <span className="grid size-12 place-items-center rounded-full bg-menta font-display text-xl font-bold text-inchiostro">3</span>
              <h3 className="mt-4 font-display text-2xl font-semibold">Fai una domanda</h3>
              <p className="mt-2 text-base text-grigio">
                Chiedi alla chat, per esempio: «Quanto spende Roma per i rifiuti?». Puoi anche creare una card da condividere.
              </p>
            </li>
          </ol>
        </section>

        {/* Cosa non e' */}
        <section className="mt-20 rounded-[32px] bg-sabbia/40 p-6 sm:p-10" aria-labelledby="cose-chiare">
          <h2 id="cose-chiare" className={H2}>Qualche cosa da sapere</h2>
          <ul className="mt-6 space-y-4 text-lg">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-3 shrink-0 rounded-full bg-pomodoro" />
              <span>
                <strong>I dati sono di cassa.</strong> Mostrano quanto è entrato e uscito, non quanto è stato impegnato o accertato. Per questo un anno può sembrare
                diverso da quello che ti aspetti.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-3 shrink-0 rounded-full bg-menta" />
              <span>
                <strong>Il rango è una posizione, non un voto.</strong> Dice dove si trova un comune rispetto agli altri della sua fascia di abitanti.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-3 shrink-0 rounded-full bg-cielo" />
              <span>
                <strong>La chat usa modelli di intelligenza artificiale.</strong> I numeri li calcola il nostro codice dai dati ufficiali; le domande vengono inviate
                a fornitori esterni. Leggi i dettagli nella <Link href="/privacy" className="font-semibold text-mirtillo underline underline-offset-2">privacy</Link>.
              </span>
            </li>
          </ul>
        </section>

        {/* Fonti */}
        <section className="mt-20" aria-labelledby="fonti">
          <h2 id="fonti" className={H2}>Da dove vengono i dati</h2>
          <p className="mt-4 text-lg text-grigio">
            Parimetro non raccoglie dati da sé: li prende da fonti ufficiali e li rende leggibili. Ogni scheda indica la fonte e l&apos;anno.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["SIOPE", "Bilanci di cassa dei comuni (incassi e pagamenti)"],
              ["ISTAT", "Confini, popolazione e codici dei comuni"],
              ["MEF · IRPEF", "Redditi dichiarati dai residenti"],
              ["Italia Domani · OpenCoesione", "Progetti PNRR e fondi di coesione"],
              ["ANAC", "Appalti e lotti pubblicati (CC BY-SA 4.0)"],
            ].map(([nome, descrizione]) => (
              <li key={nome} className="rounded-3xl border border-[#E8DEC8] bg-carta p-4">
                <p className="font-codice text-sm uppercase tracking-wide text-grigio">{nome}</p>
                <p className="mt-1">{descrizione}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Prova anche */}
        <section className="mt-20" aria-labelledby="prova-anche">
          <h2 id="prova-anche" className={H2}>Prova anche</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            <li className={CARD}>
              <h3 className="font-display text-2xl font-semibold">Indovina quanto spende il tuo comune</h3>
              <p className="mt-2 text-base text-grigio">Cinque domande, poi il dato vero, con la fonte.</p>
              <Link href="/gioco" className="mt-4 inline-flex font-semibold text-mirtillo underline underline-offset-2">Gioca</Link>
            </li>
            <li className={CARD}>
              <h3 className="font-display text-2xl font-semibold">Scoperte dai bilanci</h3>
              <p className="mt-2 text-base text-grigio">Qualche dato sorprendente, e i confronti tra i capoluoghi.</p>
              <Link href="/scoperte" className="mt-4 inline-flex font-semibold text-mirtillo underline underline-offset-2">Leggi</Link>
            </li>
          </ul>
        </section>

        {/* Invito finale */}
        <section className="mt-20 text-center">
          <h2 className={H2}>Provalo sul tuo comune</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-grigio">Bastano pochi secondi. Non serve nessun account per guardare.</p>
          <div className="mt-8">
            <Link href="/mappa" className={`${BOTTONE} bg-mirtillo text-white shadow-[0_4px_0_#1B1A2E] hover:brightness-110`}>
              Apri la mappa
            </Link>
          </div>
        </section>

        <footer className="mt-20 border-t border-[#E8DEC8] pt-6 text-sm text-grigio">
          <p>
            Codice pubblicato con licenza MIT · dati pubblicati con licenza CC BY-SA 4.0 ·{" "}
            <a className="font-semibold underline underline-offset-2" href="https://github.com/onciopescini/parimetro">GitHub</a> ·{" "}
            <Link className="font-semibold underline underline-offset-2" href="/privacy">Privacy</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
