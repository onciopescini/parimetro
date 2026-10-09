"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { euro, type GiocoDomanda } from "@/lib/viralita/genera";
import Condividi from "@/components/viralita/Condividi";

const NUMERO = 5;
const URL_GIOCO = "https://parimetro.it/gioco";

// La cifra vera sale da zero fino al valore: un momento breve, che si ferma subito se chi legge chiede di ridurre il movimento
function CountUp({ valore }: { valore: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const ridotto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (ridotto) {
      setV(valore);
      return;
    }
    const inizio = performance.now();
    const durata = 900;
    let frame = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - inizio) / durata);
      setV(Math.round(valore * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(passo);
    };
    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
  }, [valore]);
  return <strong className="font-display text-2xl">{euro(v)}</strong>;
}

const mescola = <T,>(xs: T[]): T[] => {
  const copia = [...xs];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

export default function Gioco() {
  const [domande, setDomande] = useState<GiocoDomanda[] | null>(null);
  const [partita, setPartita] = useState<GiocoDomanda[]>([]);
  const [i, setI] = useState(0);
  const [scelta, setScelta] = useState<number | null>(null);
  const [punti, setPunti] = useState(0);

  const avvia = (d: GiocoDomanda[]) => {
    setPartita(mescola(d).slice(0, NUMERO).map((q) => ({ ...q, opzioni: mescola(q.opzioni) })));
    setI(0);
    setScelta(null);
    setPunti(0);
  };

  useEffect(() => {
    fetch("/viralita/gioco.json")
      .then((r) => r.json())
      .then((d: GiocoDomanda[]) => {
        setDomande(d);
        avvia(d);
      })
      .catch(() => setDomande([]));
  }, []);

  const finita = partita.length > 0 && i >= partita.length;
  const q = partita[i];

  return (
    <main className="min-h-dvh bg-crema px-4 pb-16 font-testo text-lg leading-relaxed text-inchiostro sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between pt-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Parimetro, torna alla home">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" aria-hidden="true" />
            <span className="h-3.5 w-7 rounded-full bg-limone" aria-hidden="true" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </Link>
          <Link href="/mappa" className="inline-flex min-h-11 items-center text-base font-semibold underline-offset-4 hover:underline">Mappa</Link>
        </header>

        <h1 className="mt-10 font-display text-4xl font-semibold leading-tight sm:text-5xl">Indovina quanto spende il tuo comune</h1>
        <p className="mt-4 text-xl leading-relaxed">
          Cinque comuni, cinque domande. Scegli la cifra che ti sembra giusta: poi vedi quella vera, con il dato ufficiale.
        </p>

        {domande === null && <p className="mt-10 text-grigio">Carico le domande…</p>}

        {domande !== null && domande.length === 0 && (
          <p className="mt-10 text-grigio">Il gioco non è disponibile in questo momento. Prova più tardi dalla mappa.</p>
        )}

        {domande !== null && domande.length > 0 && !finita && q && (
          <section className="mt-10 rounded-[32px] border border-[#E8DEC8] bg-carta p-5 sm:p-8" aria-live="polite">
            <p className="font-codice text-sm uppercase tracking-wide text-grigio">
              Domanda {i + 1} di {NUMERO}
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">
              Quanto spende {q.nome} per abitante nel 2024?
            </h2>
            <p className="mt-2 text-base text-grigio">
              {q.provincia} · {q.abitanti.toLocaleString("it-IT")} abitanti
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {q.opzioni.map((o) => {
                const giusta = o === q.vero;
                const scelta_ = scelta === o;
                let stile = "border-[#E8DEC8] bg-crema hover:bg-sabbia/30";
                if (scelta !== null && giusta) stile = "border-menta bg-menta text-inchiostro";
                else if (scelta_) stile = "border-pomodoro bg-pesca/40 text-inchiostro";
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={scelta !== null}
                    onClick={() => {
                      setScelta(o);
                      if (o === q.vero) setPunti((p) => p + 1);
                    }}
                    className={`min-h-14 rounded-2xl border px-3 font-display text-xl font-semibold transition disabled:cursor-default ${stile}`}
                  >
                    {euro(o)}
                  </button>
                );
              })}
            </div>

            {scelta !== null && (
              <div className="esce mt-6 rounded-3xl bg-sabbia/30 p-5 text-base">
                <p>
                  Il dato vero è <CountUp valore={q.vero} /> per abitante.{" "}
                  {scelta === q.vero
                    ? "Hai indovinato."
                    : `Il tuo valore era ${Math.round(Math.abs(scelta - q.vero) / q.vero * 100)}% ${scelta > q.vero ? "più alto" : "più basso"} di quello vero.`}
                </p>
                <p className="mt-2 text-grigio">Dati di cassa 2024 (SIOPE): incassi e pagamenti, non il bilancio approvato.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setScelta(null);
                      setI((x) => x + 1);
                    }}
                    className="inline-flex min-h-12 items-center rounded-full bg-limone px-6 font-semibold text-inchiostro shadow-[0_4px_0_#1B1A2E] active:translate-y-0.5 active:shadow-none"
                  >
                    {i + 1 < NUMERO ? "Domanda successiva" : "Vedi il risultato"}
                  </button>
                  <Link href={`/mappa?comune=${q.istat}`} className="inline-flex min-h-12 items-center rounded-full border border-[#E8DEC8] bg-carta px-6 font-semibold">
                    Scheda di {q.nome}
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}

        {finita && (
          <section className="esce mt-10 rounded-[32px] border border-[#E8DEC8] bg-carta p-5 text-center sm:p-8">
            <p className="font-codice text-sm uppercase tracking-wide text-grigio">Risultato</p>
            <p className="sale mt-3 font-display text-5xl font-semibold">
              {punti} su {NUMERO}
            </p>
            <p className="mt-3 text-lg text-grigio">
              {punti === NUMERO ? "Hai una buona stima dei conti pubblici." : "Non è facile: i numeri dei comuni sono più vicini di quanto sembri."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Condividi testo={`Ho indovinato ${punti} su ${NUMERO} su Parimetro: quanto spende il tuo comune? Prova anche tu.`} url={URL_GIOCO} etichetta="Condividi il risultato" />
              <button
                type="button"
                onClick={() => domande && avvia(domande)}
                className="inline-flex min-h-14 items-center rounded-full border border-[#E8DEC8] bg-crema px-7 text-lg font-semibold"
              >
                Gioca ancora
              </button>
            </div>
          </section>
        )}

        <p className="mt-10 text-sm text-grigio">
          Le domande riguardano i comuni con almeno 10.000 abitanti e spesa non concentrata in una sola voce. Come sono calcolati i numeri:{" "}
          <Link href="/metodo" className="font-semibold text-mirtillo underline underline-offset-2">metodo</Link>.
        </p>
      </div>
    </main>
  );
}
