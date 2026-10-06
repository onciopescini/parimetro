"use client";

// Chat di Parimetro. Il modello AI traduce la domanda e racconta il risultato, ma i
// numeri li calcola il sito: la tabella sotto ogni risposta e' la fonte, il testo la
// spiegazione. Ogni tabella si puo' esportare in CSV.

import { account } from "@/lib/account/client";
import { useEffect, useRef, useState } from "react";
import { Download, Loader2, MapPin, MessageCircle, Send, X } from "lucide-react";
import { toCsv } from "@/lib/chat/csv";
import type { Colonna, Risultato } from "@/lib/chat/tipi";

interface RispostaApi {
  testo: string;
  narrato: boolean;
  titolo: string;
  colonne: Colonna[];
  righe: Record<string, string>[];
  grezze: Risultato["grezze"];
  note: string[];
  apri?: string;
  candidati?: { istat: string; nome: string; provincia: string; abitanti: number }[];
}

type Voce =
  | { chi: "utente"; testo: string }
  | { chi: "assistente"; r: RispostaApi }
  | { chi: "errore"; testo: string };

const SUGGERIMENTI = [
  "Quanto spende Roma per i rifiuti?",
  "I 10 comuni piccoli con più autonomia finanziaria",
  "Confronta Torino e Bologna",
  "Spesa pro capite più alta in Abruzzo, senza investimenti isolati",
];

const num = (v: number) => new Intl.NumberFormat("it-IT").format(v);

function scaricaCsv(titolo: string, colonne: Colonna[], grezze: Risultato["grezze"]) {
  const blob = new Blob([toCsv(colonne, grezze)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parimetro-${titolo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPanel({
  contesto,
  spostaDaDestra,
  onApri,
}: {
  /** Comune aperto nel sito: permette di chiedere "questo comune" */
  contesto?: { istat: string; nome: string; anno: number } | null;
  /** Il drawer del comune occupa il lato destro: il pulsante si sposta */
  spostaDaDestra: boolean;
  onApri: (istat: string) => void;
}) {
  // Il pulsante compare solo se l'endpoint risponde e ha la chiave: in sviluppo locale
  // (next dev) /api/chat non esiste e la chat resta nascosta invece di mostrare un errore
  const [attiva, setAttiva] = useState(false);
  const [aperta, setAperta] = useState(false);
  const [voci, setVoci] = useState<Voce[]>([]);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null)
      .then((j) => setAttiva(j?.attiva === true))
      .catch(() => setAttiva(false));
  }, []);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [voci, inCorso]);

  async function chiedi(domanda: string) {
    const d = domanda.trim();
    if (!d || inCorso) return;
    setVoci((v) => [...v, { chi: "utente", testo: d }]);
    setTesto("");
    setInCorso(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domanda: d,
          contesto: contesto ? { istat: contesto.istat, nome: contesto.nome, anno: contesto.anno } : undefined,
        }),
      });
      const tipo = res.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) {
        throw new Error("La chat non è raggiungibile (in sviluppo locale serve `wrangler pages dev`).");
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.errore ?? `Errore ${res.status}`);
      setVoci((v) => [...v, { chi: "assistente", r: j as RispostaApi }]);
      void account.registraDomanda(d);
    } catch (e) {
      setVoci((v) => [...v, { chi: "errore", testo: e instanceof Error ? e.message : "Errore di rete." }]);
    } finally {
      setInCorso(false);
    }
  }

  if (!attiva) return null;

  return (
    <>
      {!aperta && (
        <button
          data-guida="chat"
          onClick={() => setAperta(true)}
          className={`absolute bottom-8 z-30 flex items-center gap-2 rounded-full border border-[#E8DEC8] bg-mirtillo px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(27,26,46,0.16)] transition hover:brightness-95 ${
            spostaDaDestra ? "right-4 hidden md:flex md:right-[436px]" : "right-4"
          }`}
        >
          <MessageCircle size={15} /> Chiedi a Parimetro
        </button>
      )}

      {aperta && (
        <section
          aria-label="Chat"
          className={`absolute bottom-8 z-40 flex max-h-[75vh] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-[#E8DEC8] bg-crema text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.16)] ${
            spostaDaDestra ? "right-4 md:right-[436px]" : "right-4"
          }`}
        >
          <header className="flex items-center justify-between border-b border-[#E8DEC8] px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold">Chiedi a Parimetro</h2>
              <p className="text-xs text-grigio">
                {contesto ? `Comune aperto: ${contesto.nome}` : "Chiedi di un comune, una classifica, una voce di spesa"}
              </p>
            </div>
            <button
              onClick={() => setAperta(false)}
              aria-label="Chiudi la chat"
              className="rounded-2xl p-1.5 text-grigio hover:bg-sabbia/30 hover:text-inchiostro"
            >
              <X size={16} />
            </button>
          </header>

          <div className="min-h-[120px] flex-1 space-y-3 overflow-y-auto p-3 text-sm leading-relaxed">
            {voci.length === 0 && (
              <div className="space-y-2">
                <p className="text-grigio">
                  Un modello AI capisce la domanda e racconta la risposta; <strong className="text-inchiostro">i numeri li
                  calcola il sito</strong> dai dati ufficiali, e li trovi nella tabella. Prova:
                </p>
                {SUGGERIMENTI.map((s) => (
                  <button
                    key={s}
                    onClick={() => chiedi(s)}
                    className="block w-full rounded-2xl border border-[#E8DEC8] bg-carta px-2.5 py-1.5 text-left text-inchiostro hover:bg-sabbia/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {voci.map((voce, i) =>
              voce.chi === "utente" ? (
                <div key={i} className="ml-8 rounded-3xl bg-mirtillo px-3 py-2 text-white">
                  {voce.testo}
                </div>
              ) : voce.chi === "errore" ? (
                <div key={i} className="rounded-3xl border border-pomodoro bg-pomodoro/15 px-3 py-2 text-inchiostro">
                  {voce.testo}
                </div>
              ) : (
                <Risposta key={i} r={voce.r} onApri={onApri} onScegli={chiedi} />
              ),
            )}

            {inCorso && (
              <div className="flex items-center gap-2 text-grigio">
                <Loader2 size={12} className="animate-spin" /> Sto cercando nei dati…
              </div>
            )}
            <div ref={fondo} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              chiedi(testo);
            }}
            className="flex items-center gap-2 border-t border-[#E8DEC8] p-2"
          >
            <input
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              maxLength={400}
              placeholder="Scrivi una domanda…"
              aria-label="Domanda"
              className="min-w-0 flex-1 rounded-2xl border border-[#E8DEC8] bg-carta px-3 py-2 text-sm text-inchiostro placeholder:text-grigio focus:border-mirtillo focus:outline-none"
            />
            <button
              type="submit"
              disabled={inCorso || !testo.trim()}
              aria-label="Invia"
              className="rounded-2xl bg-mirtillo p-2 text-white transition enabled:hover:brightness-95 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="border-t border-[#E8DEC8] px-3 py-1.5 text-xs leading-snug text-grigio">
            Risposte generate da un modello AI sui dati del sito (cassa, non competenza): controlla sempre la tabella. La domanda viene inviata a un fornitore di modelli AI (tramite OpenRouter): non scrivere dati personali.
          </p>
        </section>
      )}
    </>
  );
}

function Risposta({
  r,
  onApri,
  onScegli,
}: {
  r: RispostaApi;
  onApri: (istat: string) => void;
  onScegli: (domanda: string) => void;
}) {
  const conTabella = r.righe.length > 0;
  return (
    <div className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
      <p className="text-inchiostro">{r.testo}</p>

      {r.candidati && (
        <div className="flex flex-wrap gap-1.5">
          {r.candidati.map((c) => (
            <button
              key={c.istat}
              onClick={() => onScegli(`Scheda del comune ${c.nome} codice ISTAT ${c.istat}`)}
              className="rounded-full border border-[#E8DEC8] bg-carta px-2.5 py-1 text-xs hover:bg-sabbia/30"
            >
              {c.nome} ({c.provincia}) · {num(c.abitanti)} ab
            </button>
          ))}
        </div>
      )}

      {conTabella && (
        <div className="overflow-x-auto rounded-2xl border border-[#E8DEC8]">
          <p className="border-b border-[#E8DEC8] bg-carta px-2 py-1 text-xs font-medium uppercase tracking-wide text-grigio">
            {r.titolo}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-grigio">
                {r.colonne.map((c) => (
                  <th key={c.k} className={`px-2 py-1 font-medium ${c.dx ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.righe.map((riga, i) => {
                const istat = r.grezze[i]?.istat;
                return (
                  <tr
                    key={i}
                    onClick={typeof istat === "string" ? () => onApri(istat) : undefined}
                    className={`border-t border-[#E8DEC8] ${typeof istat === "string" ? "cursor-pointer hover:bg-sabbia/30" : ""}`}
                  >
                    {r.colonne.map((c) => (
                      <td
                        key={c.k}
                        className={`px-2 py-1 ${c.dx ? "text-right tabular-nums" : ""} ${
                          c.k === "nota" ? "text-inchiostro" : "text-inchiostro"
                        }`}
                      >
                        {riga[c.k]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {r.note.map((n, i) => (
        <p key={i} className="rounded-2xl bg-limone/30 px-2 py-1.5 text-xs text-inchiostro">
          {n}
        </p>
      ))}

      {(conTabella || r.apri) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {r.apri && (
            <button
              onClick={() => onApri(r.apri!)}
              className="inline-flex items-center gap-1 rounded-2xl border border-[#E8DEC8] px-2 py-1 text-xs text-inchiostro hover:bg-sabbia/30"
            >
              <MapPin size={11} /> Apri sulla mappa
            </button>
          )}
          {conTabella && (
            <button
              onClick={() => scaricaCsv(r.titolo, r.colonne, r.grezze)}
              className="inline-flex items-center gap-1 rounded-2xl border border-[#E8DEC8] px-2 py-1 text-xs text-inchiostro hover:bg-sabbia/30"
            >
              <Download size={11} /> Esporta CSV
            </button>
          )}
        </div>
      )}
      {!r.narrato && conTabella && (
        <p className="text-xs text-grigio">Testo generato dal sito (il modello AI non era disponibile).</p>
      )}
    </div>
  );
}
