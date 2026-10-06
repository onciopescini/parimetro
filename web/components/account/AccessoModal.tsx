"use client";

// "Accedere, se vuoi": la finestra per entrare con la sola email, senza password. Si capisce in due righe cosa
// si guadagna e cosa no, e c'e' sempre la via d'uscita "continua senza entrare".
import { useState } from "react";
import { account } from "@/lib/account/client";

export default function AccessoModal({ onClose, motivo }: { onClose: () => void; motivo?: string }) {
  const [email, setEmail] = useState("");
  const [fase, setFase] = useState<"form" | "invio" | "inviato">("form");
  const [errore, setErrore] = useState("");

  async function manda(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    setFase("invio");
    const r = await account.richiediLink(email);
    if (r.ok) setFase("inviato");
    else {
      setErrore(r.errore);
      setFase("form");
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-inchiostro/50 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="accesso-titolo">
      <div
        className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-[32px] border border-[#E8DEC8] bg-crema p-6 text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.3)] sm:rounded-[32px] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {fase === "inviato" ? (
          <>
            <h2 id="accesso-titolo" className="font-display text-3xl font-semibold leading-tight">Controlla la tua email</h2>
            <p className="mt-4 text-lg leading-relaxed">
              Abbiamo mandato un link a <strong className="break-all">{email.trim().toLowerCase()}</strong>. Toccalo e sei dentro: vale 15 minuti.
            </p>
            <p className="mt-3 text-base leading-relaxed text-grigio">Non lo vedi? Guarda anche nella posta indesiderata.</p>
            <button onClick={onClose} className="mt-6 min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-6 text-base font-semibold hover:bg-sabbia/30">
              Ho capito
            </button>
          </>
        ) : (
          <>
            <h2 id="accesso-titolo" className="font-display text-3xl font-semibold leading-tight">Accedere, se vuoi</h2>
            <p className="mt-3 text-lg leading-relaxed">
              {motivo ?? "Puoi usare tutto senza entrare."} Entrando, il sito si ricorda di te.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-[#E8DEC8] bg-carta p-4">
                <div className="text-sm font-semibold uppercase tracking-wide text-grigio">Senza entrare</div>
                <ul className="mt-2 space-y-1 text-base">
                  <li>cerchi qualsiasi comune</li>
                  <li>leggi tutte le schede</li>
                  <li>fai domande alla chat</li>
                  <li>crei e condividi le card</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-menta bg-menta/20 p-4">
                <div className="text-sm font-semibold uppercase tracking-wide">Entrando, in più</div>
                <ul className="mt-2 space-y-1 text-base">
                  <li>salvi i tuoi comuni</li>
                  <li>ricevi un avviso quando escono nuovi dati</li>
                  <li>ritrovi le card che hai creato</li>
                  <li>conservi le tue domande</li>
                </ul>
              </div>
            </div>

            <form onSubmit={manda} className="mt-6">
              <label htmlFor="accesso-email" className="block text-base font-semibold">La tua email</label>
              <p className="mt-1 text-sm text-grigio">Niente password da ricordare: ti mandiamo un link, lo tocchi e sei dentro.</p>
              <input
                id="accesso-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.it"
                className="mt-3 min-h-12 w-full rounded-full border border-[#E8DEC8] bg-carta px-5 text-lg text-inchiostro placeholder:text-grigio focus:border-mirtillo focus:outline-none"
              />
              {errore && (
                <p role="alert" className="mt-3 rounded-2xl border border-pomodoro bg-pomodoro/15 px-4 py-2 text-base">
                  {errore}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={fase === "invio"}
                  className="min-h-12 rounded-full bg-mirtillo px-6 text-base font-semibold text-white shadow-[0_4px_0_#1B1A2E] transition active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                >
                  {fase === "invio" ? "Un attimo…" : "Mandami il link"}
                </button>
                <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-6 text-base font-semibold hover:bg-sabbia/30">
                  Continua senza entrare
                </button>
              </div>
            </form>

            <p className="mt-5 text-sm leading-relaxed text-grigio">
              <strong className="text-inchiostro">Anonimo per scelta.</strong> Non pubblichiamo il tuo nome né la tua email. Le card che condividi non hanno il tuo nome: portano solo i dati del comune.
              Usiamo la tua email solo per farti entrare e per gli avvisi che chiedi, e puoi cancellarla quando vuoi. <a href="/privacy" className="font-semibold text-mirtillo underline underline-offset-2">Come trattiamo i dati</a>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
