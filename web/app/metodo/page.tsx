import type { Metadata } from "next";
import Link from "next/link";
import { AREE } from "@/lib/categorie";
import { FASCE } from "@/lib/chat/fasce";

export const metadata: Metadata = {
  title: "Come sono calcolati i numeri · Parimetro",
  description: "Da dove vengono i dati, come si calcolano il confronto con i comuni simili, il rango e le spese per area, e che cosa non dicono.",
};

const H2 = "mt-12 font-display text-3xl font-semibold leading-tight";
const CARD = "mt-4 rounded-[28px] border border-[#E8DEC8] bg-carta p-5 sm:p-6";

export default function Metodo() {
  const aree = Object.values(AREE);
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
            <Link href="/mappa" className="underline-offset-4 hover:underline">Mappa</Link>
            <Link href="/comuni" className="underline-offset-4 hover:underline">Comuni</Link>
          </nav>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">Come sono calcolati i numeri</h1>
        <p className="mt-4 text-xl leading-relaxed">
          Qui spieghiamo da dove vengono i dati, come li confrontiamo e che cosa non dicono. Il codice che fa i calcoli è pubblico, come le regole
          descritte in questa pagina.
        </p>

        <h2 className={H2}>I soldi: cassa, non bilancio</h2>
        <div className={CARD}>
          <p>
            I dati vengono dalla banca dati SIOPE (BDAP). Mostrano gli incassi e i pagamenti effettivi del comune nell&apos;anno: non gli accertamenti (le
            entrate dovute) né gli impegni (le spese decise ma non ancora pagate). Per questo i numeri possono sembrare diversi dai bilanci approvati.
          </p>
          <p className="mt-3">
            Per abitante vuol dire: il totale diviso per il numero di abitanti dell&apos;ISTAT.
          </p>
        </div>

        <h2 className={H2}>Con chi confrontiamo un comune</h2>
        <div className={CARD}>
          <p>
            Un comune si confronta solo con quelli della sua fascia di popolazione. Le fasce sono:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6">
            {FASCE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-3">
            Il valore di riferimento è la <strong>mediana</strong>: il valore al centro, con metà dei comuni sopra e metà sotto. Non la media, perché un
            pugno di comuni molto diversi la sposterebbe troppo.
          </p>
        </div>

        <h2 className={H2}>Il rango</h2>
        <div className={CARD}>
          <p>
            Il rango è la posizione del comune nella sua fascia, da 0 a 100, su un indicatore di salute finanziaria: combina l&apos;autonomia finanziaria
            e il saldo di gestione (al netto dei prestiti). Un rango alto vuol dire che il comune sta meglio dei suoi simili su questo indicatore.
            <strong> Non è un voto</strong>: non dice se un&apos;amministrazione sia brava o cattiva, e l&apos;indicatore lascia fuori molto di quello che conta.
          </p>
        </div>

        <h2 className={H2}>In cosa spende</h2>
        <div className={CARD}>
          <p>
            Ogni voce del bilancio ha un codice. Una tabella, pubblica e verificabile nel codice del progetto, assegna ogni codice a un&apos;area di spesa.
            Le aree sono:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6">
            {aree.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="mt-3">
            Le spese che non si possono assegnare con sicurezza restano in «Non attribuibile». Preferiamo non indovinare.
          </p>
        </div>

        <h2 className={H2}>Reddito, PNRR e coesione</h2>
        <div className={CARD}>
          <p>
            <strong>Reddito:</strong> è il reddito imponibile medio dei contribuenti IRPEF di ogni comune, dai dati del Ministero dell&apos;Economia. Le celle
            oscurate nei dati ufficiali non vengono usate.
          </p>
          <p className="mt-3">
            <strong>PNRR:</strong> un progetto risulta al comune solo se il comune ne è il soggetto attuatore. I progetti di regioni o di enti nazionali
            non vengono attribuiti a un comune.
          </p>
          <p className="mt-3">
            <strong>Fondi di coesione (OpenCoesione):</strong> contiamo solo i progetti che riguardano un solo comune.
          </p>
        </div>

        <h2 className={H2}>Appalti (ANAC)</h2>
        <div className={CARD}>
          <ul className="list-disc space-y-2 pl-6">
            <li>Contiamo solo i lotti banditi dal comune stesso, non quelli di centrali di committenza o società partecipate.</li>
            <li>Un affidamento in adesione a una convenzione o a un accordo quadro riporta l&apos;importo massimo dell&apos;accordo, non una spesa del comune: non lo sommiamo.</li>
            <li>Gli importi che superano di oltre dieci volte la spesa annua del comune sono considerati anomali e non entrano nei valori.</li>
            <li>Dal 2024 ANAC ha cambiato il modo di rilevare i lotti: i dati degli anni precedenti non sono del tutto confrontabili con quelli successivi.</li>
          </ul>
        </div>

        <h2 className={H2}>Notizie</h2>
        <div className={CARD}>
          <p>
            Le notizie sui conti dell&apos;ente sono una selezione automatica per parole chiave da fonti giornalistiche e istituzionali. Non le abbiamo verificate
            una per una: Parimetro le mostra come rinvii agli articoli originali.
          </p>
        </div>

        <h2 className={H2}>Che cosa non dicono questi numeri</h2>
        <div className={CARD}>
          <ul className="list-disc space-y-2 pl-6">
            <li>Dicono quanto è entrato e uscito, non se una spesa è stata utile.</li>
            <li>Un anno eccezionale (un terremoto, un grande investimento) può far sembrare un comune molto diverso dal solito.</li>
            <li>I dati sono quelli pubblicati dagli enti: se un ente ha sbagliato, lo sbaglio arriva anche qui.</li>
          </ul>
        </div>

        <h2 className={H2}>Licenze e fonti</h2>
        <div className={CARD}>
          <p>
            I dati pubblicati da Parimetro sono offerti con licenza <a className="font-semibold text-mirtillo underline underline-offset-2" href="https://creativecommons.org/licenses/by-sa/4.0/deed.it">CC BY-SA 4.0</a>.
            Il codice è pubblicato con licenza MIT. Le fonti sono ISTAT (confini e popolazione), SIOPE/BDAP (cassa), MEF (IRPEF), Italia Domani e OpenCoesione
            (PNRR e coesione), ANAC (appalti).
          </p>
        </div>

        <p className="mt-12">
          <Link href="/mappa" className="inline-flex min-h-14 items-center rounded-full bg-mirtillo px-7 text-lg font-semibold text-white">
            Torna alla mappa
          </Link>
        </p>
      </div>
    </main>
  );
}
