import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Come trattiamo i dati · Parimetro",
  description: "Cosa conserva Parimetro se scegli di entrare con la tua email, per quanto tempo, e come cancellarlo.",
};

const H2 = "mt-10 font-display text-2xl font-semibold";

export default function Privacy() {
  return (
    <main className="min-h-dvh bg-crema px-5 py-10 font-testo text-lg leading-relaxed text-inchiostro">
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-2" aria-hidden="true">
          <span className="h-3.5 w-12 rounded-full bg-mirtillo" />
          <span className="h-3.5 w-7 rounded-full bg-limone" />
          <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
        </p>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-tight">Come trattiamo i dati</h1>
        <p className="mt-4">
          Parimetro si usa senza entrare e senza lasciare niente di tuo. Se scegli di entrare, conserviamo il minimo che serve a ricordarti. Qui c&apos;è tutto,
          scritto semplice.
        </p>

        <h2 className={H2}>Se non entri</h2>
        <p className="mt-3">
          Non ti chiediamo nulla e non facciamo profilazione. Il sito non usa cookie pubblicitari né strumenti di analisi di terze parti. Il tuo browser
          ricorda solo, sul tuo dispositivo, che hai già visto il giro guidato.
        </p>

        <h2 className={H2}>Se entri</h2>
        <p className="mt-3">Conserviamo:</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>la tua <strong>email</strong>, per farti entrare e per gli avvisi che chiedi;</li>
          <li>i <strong>comuni che salvi</strong> e, per ciascuno, se vuoi l&apos;avviso sui nuovi dati;</li>
          <li>l&apos;<strong>elenco delle card</strong> che crei (comune, tipo, anno: non l&apos;immagine);</li>
          <li>le <strong>domande</strong> che fai alla chat mentre sei dentro.</li>
        </ul>
        <p className="mt-3">
          Non conserviamo password: entri con un link che ti mandiamo per email, valido 15 minuti e utilizzabile una volta sola. Nel nostro archivio i link e le
          sessioni sono salvati solo come impronta, non in chiaro.
        </p>

        <h2 className={H2}>A cosa serve, e cosa non facciamo</h2>
        <p className="mt-3">
          Solo a darti le funzioni che hai chiesto: ritrovare i tuoi comuni, avvisarti quando esce un nuovo anno di dati, rivedere card e domande. Non vendiamo né
          cediamo i tuoi dati, non li usiamo per pubblicità, non scriviamo il tuo nome o la tua email sulle card o sulle pagine pubbliche.
        </p>
        <p className="mt-3">
          Gli avvisi arrivano solo per i comuni che hai salvato e solo quando esce un nuovo anno di dati. Ogni messaggio ha il link per non riceverne più.
        </p>

        <h2 className={H2}>Per quanto tempo</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>L&apos;accesso resta valido 30 giorni su ciascun dispositivo, poi riesci con un nuovo link.</li>
          <li>Comuni, card e domande restano finché non li togli tu o non cancelli l&apos;account. Teniamo le ultime 50 card e le ultime 100 domande.</li>
          <li>I contatori antiabuso si cancellano da soli dopo poche ore.</li>
        </ul>

        <h2 className={H2}>I tuoi diritti, subito</h2>
        <p className="mt-3">
          Dal <strong>Il mio spazio</strong> puoi vedere tutto ciò che conserviamo, <strong>scaricarlo</strong> in un file, togliere singoli elementi o
          <strong> cancellare l&apos;intero account</strong>. La cancellazione è immediata e definitiva.
        </p>

        <h2 className={H2}>Chi ci aiuta a farlo funzionare</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6">
          <li>
            <strong>Cloudflare</strong> ospita il sito e il piccolo archivio degli account.
          </li>
          <li>
            Un <strong>servizio di invio email</strong> recapita i link di accesso e gli avvisi.
          </li>
          <li>
            Le domande alla <strong>chat</strong> sono inviate a fornitori esterni di modelli di intelligenza artificiale: <strong>TypeSafe</strong> (modello Jev, che
            capisce quale domanda stai facendo) e <strong>OpenRouter</strong> (per scrivere il testo della risposta). Succede anche se non sei entrato: per questo nella chat ti
            chiediamo di non scrivere dati personali. Le risposte di TypeSafe possono essere tenute in memoria da noi per 24 ore, senza il testo della domanda.
          </li>
        </ul>

        <h2 className={H2}>Chi risponde e come scrivere</h2>
        <p className="mt-3">
          Parimetro è un progetto aperto, con codice pubblicato su{" "}
          <a className="font-semibold text-mirtillo underline underline-offset-2" href="https://github.com/onciopescini/parimetro">
            GitHub
          </a>
          . Per qualsiasi richiesta sui tuoi dati, o se qualcosa non ti torna, apri una segnalazione lì.
        </p>
        <p className="mt-3">
          Il titolare del trattamento è <strong>Alfonso Pescini</strong>. Puoi scrivergli a{" "}
          <a className="font-semibold text-mirtillo underline underline-offset-2" href="mailto:alfonso@pescini.org">
            alfonso@pescini.org
          </a>{" "}
          per esercitare i tuoi diritti (accesso, copia, cancellazione, rettifica).
        </p>

        <p className="mt-10">
          <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-mirtillo px-6 font-semibold text-white">
            Torna alla mappa
          </Link>
        </p>
      </div>
    </main>
  );
}
