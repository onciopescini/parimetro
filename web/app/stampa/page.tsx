import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Per giornalisti e redazioni · Parimetro",
  description:
    "Come citare Parimetro, come leggere i dati con cautela, dove scaricarli e a chi chiedere: il materiale per chi scrive di bilanci, appalti e PNRR dei comuni.",
};

const H2 = "mt-12 font-display text-3xl font-semibold leading-tight";
const CARD = "mt-4 rounded-[28px] border border-[#E8DEC8] bg-carta p-5 sm:p-6";
const LINK = "font-semibold text-mirtillo underline underline-offset-2";

export default function Stampa() {
  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pt-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Parimetro, torna alla home">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </Link>
          <nav className="flex items-center gap-4 text-base font-semibold">
            <Link href="/mappa" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Mappa</Link>
            <Link href="/comuni" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Comuni</Link>
          </nav>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">Per giornalisti e redazioni</h1>
        <p className="mt-4 text-xl leading-relaxed">
          Parimetro mette in una mappa i bilanci di tutti i comuni italiani: entrate e spese per abitante, il confronto con i comuni della stessa
          dimensione, il PNRR, gli appalti e il reddito dei residenti. Ogni numero ha la sua fonte. Qui trovi come usarlo senza sbagliare.
        </p>

        <h2 className={H2}>Come citare</h2>
        <div className={CARD}>
          <p>Ogni comune ha una pagina con un indirizzo stabile, per esempio <Link className={LINK} href="/comune/campobasso-070006">/comune/campobasso-070006</Link>. Formula consigliata:</p>
          <p className="mt-3 rounded-2xl bg-sabbia/40 p-4 font-mono text-base">
            Parimetro, dati SIOPE (cassa) 2024, https://parimetro.it/comune/campobasso-070006, consultato il [data]
          </p>
          <p className="mt-3">Le fonti originali sono SIOPE/BDAP, ISTAT, MEF, Italia Domani, OpenCoesione e ANAC. Quando puoi, cita anche loro.</p>
        </div>

        <h2 className={H2}>Prima di scrivere: quattro cautele</h2>
        <div className={CARD}>
          <ul className="list-disc space-y-3 pl-6">
            <li>
              <strong>Sono dati di cassa.</strong> Incassi e pagamenti dell&apos;anno, non accertamenti e impegni. Un &laquo;avanzo&raquo; è un saldo di cassa,
              non l&apos;avanzo di amministrazione.
            </li>
            <li>
              <strong>Appalti 2024.</strong> ANAC ha cambiato la rilevazione: gli affidamenti diretti sono circa il 92% dei lotti (mediana dei comuni con almeno
              50 lotti) perché entrano anche i micro-affidamenti. Non è un dato anomalo e non è confrontabile con gli anni prima: confronta comuni dello stesso anno.
            </li>
            <li>
              <strong>Le classificazioni dei lotti sono automatiche.</strong> &laquo;A cosa servono le gare&raquo; e &laquo;Che cosa si compra&raquo; sono assegnate
              da un modello (Jev, TypeSafe), non sono un dato ANAC e possono sbagliare. Per un fatto concreto, controlla il lotto sulla fonte.
            </li>
            <li>
              <strong>Un investimento isolato falsa il pro capite.</strong> Se una voce enorme pesa su un anno, la scheda lo segnala: non leggerlo come una
              spesa abituale.
            </li>
          </ul>
          <p className="mt-3">
            Tutto è spiegato in <Link className={LINK} href="/metodo">Come sono calcolati i numeri</Link>.
          </p>
        </div>

        <h2 className={H2}>Dati da scaricare</h2>
        <div className={CARD}>
          <ul className="list-disc space-y-2 pl-6">
            <li>Un comune, tutti gli anni: <code>/dati/comune/&lt;codice ISTAT&gt;.json</code>.</li>
            <li>Tutti i comuni di un anno: <code>/dati/comuni-2024.json</code> (e gli altri anni dal 2020).</li>
            <li>Le classifiche (più PNRR per abitante, più reddito, più autonomia finanziaria) si scaricano dalla mappa, ognuna in un file.</li>
          </ul>
          <p className="mt-3">
            Licenza <a className={LINK} href="https://creativecommons.org/licenses/by-sa/4.0/deed.it">CC BY-SA 4.0</a>: puoi riusarli citando la fonte e
            mantenendo la stessa licenza. Il codice è pubblico (MIT).
          </p>
        </div>

        <h2 className={H2}>Spunti da cui partire</h2>
        <div className={CARD}>
          <p>
            Nella pagina <Link className={LINK} href="/scoperte">Scoperte</Link> ci sono domande già calcolate sui dati, ognuna con il comune di riferimento.
            Sono punti di partenza, non conclusioni: prima di scrivere, chiedi al comune perché il numero è quello.
          </p>
          <p className="mt-3">
            I <Link className={LINK} href="/gioco">giochi</Link> e le card scaricabili di ogni comune servono per i pezzi più leggeri sui social.
          </p>
        </div>

        <h2 className={H2}>Hai trovato un errore o ti serve altro?</h2>
        <div className={CARD}>
          <p>
            Scrivi ad Alfonso Pescini: <a className={LINK} href="mailto:alfonso@pescini.org">alfonso@pescini.org</a>. Se un numero non torna lo verifichiamo sulla
            fonte e lo correggiamo; se serve un&apos;estrazione sui dati (per esempio i comuni di una provincia) la prepariamo volentieri.
          </p>
        </div>

        <p className="mt-12">
          <Link href="/mappa" className="inline-flex min-h-14 items-center rounded-full bg-mirtillo px-7 text-lg font-semibold text-white">
            Apri la mappa
          </Link>
        </p>
      </div>
    </main>
  );
}
