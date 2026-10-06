"use client";

// "Il mio spazio": i comuni salvati, le card create, le domande fatte, e i controlli sui propri dati
// (scaricarli, cancellare tutto). Tutto cio' che c'e' qui dentro e' della persona e si toglie con un tocco.
import { useState } from "react";
import { Bell, BellOff, Star, Trash2, X } from "lucide-react";
import { account, useAccount } from "@/lib/account/client";

type Tab = "comuni" | "card" | "domande" | "dati";

const NOME_CARD: Record<string, string> = { cento: "Ogni 100 €", tre: "Tre numeri", confronto: "Confronto" };
const data = (s: number) => new Date(s * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

export default function SpazioPersonale({ onClose, onApri }: { onClose: () => void; onApri: (istat: string) => void }) {
  const a = useAccount();
  const [tab, setTab] = useState<Tab>("comuni");
  const [conferma, setConferma] = useState(false);
  const [errore, setErrore] = useState("");

  const tuttiAvvisi = a.comuni.length > 0 && a.comuni.every((c) => c.avviso);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-inchiostro/50 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="spazio-titolo">
      <div
        className="flex max-h-[94dvh] w-full max-w-xl flex-col rounded-t-[32px] border border-[#E8DEC8] bg-crema text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.3)] sm:rounded-[32px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 p-6 pb-3">
          <div className="min-w-0">
            <h2 id="spazio-titolo" className="font-display text-3xl font-semibold leading-tight">Il mio spazio</h2>
            <p className="mt-1 truncate text-base text-grigio">{a.email}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="grid size-12 shrink-0 place-items-center rounded-full text-grigio hover:bg-sabbia/30 hover:text-inchiostro">
            <X size={20} />
          </button>
        </header>

        <nav className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2" aria-label="Sezioni">
          {(
            [
              ["comuni", `Comuni (${a.comuni.length})`],
              ["card", `Card (${a.card.length})`],
              ["domande", `Domande (${a.domande.length})`],
              ["dati", "I miei dati"],
            ] as [Tab, string][]
          ).map(([id, etichetta]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${tab === id ? "bg-mirtillo text-white" : "text-grigio hover:bg-sabbia/30 hover:text-inchiostro"}`}
            >
              {etichetta}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6 pt-3">
          {errore && <p role="alert" className="rounded-2xl border border-pomodoro bg-pomodoro/15 px-4 py-2 text-base">{errore}</p>}

          {tab === "comuni" && (
            <>
              {a.comuni.length === 0 ? (
                <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-4 text-base leading-relaxed">
                  Non hai ancora salvato nessun comune. Aprine uno dalla mappa e tocca la stella <Star size={14} className="inline -translate-y-px" aria-hidden /> nella scheda.
                </p>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      const r = await account.avviso(null, !tuttiAvvisi);
                      if (!r.ok) setErrore(r.errore);
                    }}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-[#E8DEC8] bg-carta px-5 text-left text-base font-semibold hover:bg-sabbia/30"
                  >
                    <span>{tuttiAvvisi ? "Avvisi attivi per tutti i comuni" : "Attiva gli avvisi per tutti"}</span>
                    {tuttiAvvisi ? <Bell size={18} /> : <BellOff size={18} />}
                  </button>
                  <p className="px-1 text-sm text-grigio">Ti scriviamo solo quando esce un nuovo anno di dati per un comune che hai salvato.</p>
                  <ul className="space-y-2">
                    {a.comuni.map((c) => (
                      <li key={c.istat} className="flex items-center gap-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3 pl-5">
                        <button
                          onClick={() => {
                            onApri(c.istat);
                            onClose();
                          }}
                          className="min-h-12 min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate font-display text-xl font-semibold">{c.nome}</span>
                          <span className="block text-sm text-grigio">salvato il {data(c.salvato_il)}</span>
                        </button>
                        <button
                          onClick={() => account.avviso(c.istat, !c.avviso)}
                          aria-label={c.avviso ? `Spegni l'avviso per ${c.nome}` : `Accendi l'avviso per ${c.nome}`}
                          aria-pressed={c.avviso}
                          className={`grid size-12 shrink-0 place-items-center rounded-full ${c.avviso ? "bg-limone" : "text-grigio hover:bg-sabbia/30"}`}
                        >
                          {c.avviso ? <Bell size={18} /> : <BellOff size={18} />}
                        </button>
                        <button onClick={() => account.togli(c.istat)} aria-label={`Togli ${c.nome} dai salvati`} className="grid size-12 shrink-0 place-items-center rounded-full text-grigio hover:bg-sabbia/30 hover:text-inchiostro">
                          <Trash2 size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {tab === "card" && (
            <>
              {a.card.length === 0 ? (
                <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-4 text-base leading-relaxed">Qui compaiono le card che crei da una scheda. Serve l&apos;elenco, non l&apos;immagine: puoi rifarla quando vuoi.</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {a.card.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3 pl-5">
                        <button onClick={() => { onApri(c.istat); onClose(); }} className="min-h-12 min-w-0 flex-1 text-left">
                          <span className="block truncate font-display text-xl font-semibold">{c.nome}</span>
                          <span className="block text-sm text-grigio">{NOME_CARD[c.tipo] ?? c.tipo} · dati {c.anno} · {data(c.creata_il)}</span>
                        </button>
                        <button onClick={() => account.eliminaCard(c.id)} aria-label="Togli dall'elenco" className="grid size-12 shrink-0 place-items-center rounded-full text-grigio hover:bg-sabbia/30 hover:text-inchiostro">
                          <Trash2 size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => account.eliminaCard(null)} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-5 text-sm font-semibold hover:bg-sabbia/30">Svuota l&apos;elenco</button>
                </>
              )}
            </>
          )}

          {tab === "domande" && (
            <>
              {a.domande.length === 0 ? (
                <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-4 text-base leading-relaxed">Le domande che fai alla chat, mentre sei dentro, restano qui. Solo tu le vedi.</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {a.domande.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3 pl-5">
                        <div className="min-w-0 flex-1 py-1">
                          <span className="block text-base">{d.testo}</span>
                          <span className="block text-sm text-grigio">{data(d.fatta_il)}</span>
                        </div>
                        <button onClick={() => account.eliminaDomande(d.id)} aria-label="Cancella questa domanda" className="grid size-12 shrink-0 place-items-center rounded-full text-grigio hover:bg-sabbia/30 hover:text-inchiostro">
                          <Trash2 size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => account.eliminaDomande(null)} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-5 text-sm font-semibold hover:bg-sabbia/30">Cancella tutte le domande</button>
                </>
              )}
            </>
          )}

          {tab === "dati" && (
            <>
              <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-4 text-base leading-relaxed">
                Conserviamo la tua email, i comuni che salvi, l&apos;elenco delle card che crei e le domande che fai alla chat mentre sei dentro. Niente altro, e non li condividiamo con nessuno.{" "}
                <a href="/privacy" className="font-semibold text-mirtillo underline underline-offset-2">Leggi come funziona</a>.
              </p>
              <a href="/api/me/esporta" className="flex min-h-12 items-center justify-center rounded-full border border-[#E8DEC8] bg-carta px-5 text-base font-semibold hover:bg-sabbia/30">
                Scarica i miei dati
              </a>
              <button
                onClick={async () => {
                  await account.esci();
                  onClose();
                }}
                className="min-h-12 w-full rounded-full border border-[#E8DEC8] bg-carta px-5 text-base font-semibold hover:bg-sabbia/30"
              >
                Esci
              </button>
              {!conferma ? (
                <button onClick={() => setConferma(true)} className="min-h-12 w-full rounded-full px-5 text-base font-semibold text-grigio underline underline-offset-2 hover:text-inchiostro">
                  Cancella il mio account
                </button>
              ) : (
                <div className="rounded-3xl border border-pomodoro bg-pomodoro/15 p-4">
                  <p className="text-base leading-relaxed">Cancelliamo la tua email e tutto ciò che hai salvato. Non si può annullare.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={async () => {
                        const r = await account.cancellaAccount();
                        if (r.ok) onClose();
                        else setErrore(r.errore);
                      }}
                      className="min-h-12 rounded-full bg-inchiostro px-6 text-base font-semibold text-white"
                    >
                      Sì, cancella tutto
                    </button>
                    <button onClick={() => setConferma(false)} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-6 text-base font-semibold">
                      No, tieni tutto
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
