"use client";

// "Crea la card": sceglie cosa mostrare, disegna l'immagine nel browser e la fa scaricare o condividere, insieme
// al testo del post, alle fonti con i link e alla frase per citarci. Nessun server e nessun dato lascia il
// dispositivo: l'immagine nasce da un <canvas> locale. Avvertenze e fonti sono dentro la card e non si tolgono.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  citazione,
  costruisci,
  disponibile,
  fonti,
  testoPost,
  type ContenutoCard,
  type DatiCard,
  type TipoCard,
  type Tono,
} from "@/lib/card/contenuto";
import { DIMENSIONI, disegna, type Ambiente } from "@/lib/card/disegna";
import { slugComune } from "@/lib/pagina/comune";

/**
 * Le card offerte al pubblico. "domanda" e' pronta e testata ma resta spenta finche' il testo (e il rimando
 * all'accesso civico) non e' stato rivisto da chi ha competenza legale: per accenderla basta aggiungerla qui.
 */
const ATTIVE: readonly TipoCard[] = ["cento", "tre", "confronto"];

const TUTTE: { tipo: TipoCard; nome: string; testo: string }[] = [
  { tipo: "cento", nome: "Ogni 100 €", testo: "Quadrata, per i post." },
  { tipo: "tre", nome: "Tre numeri", testo: "Verticale, per le storie." },
  { tipo: "confronto", nome: "Confronto", testo: "Larga, per messaggi e link." },
  { tipo: "domanda", nome: "Una domanda", testo: "Larga." },
];
const SCELTE = TUTTE.filter((s) => ATTIVE.includes(s.tipo));

const TONI: { tono: Tono; nome: string }[] = [
  { tono: "curioso", nome: "Curioso" },
  { tono: "neutro", nome: "Neutro" },
];

/** Le famiglie di caratteri che next/font ha caricato, lette dalle variabili CSS; se mancano, caratteri di sistema. */
function famiglie(): Pick<Ambiente, "display" | "testo" | "codice"> {
  const css = getComputedStyle(document.documentElement);
  const leggi = (nome: string, ripiego: string) => {
    const v = css.getPropertyValue(nome).trim();
    return v ? `${v}, ${ripiego}` : ripiego;
  };
  return {
    display: leggi("--f-display", "Georgia, serif"),
    testo: leggi("--f-testo", "system-ui, sans-serif"),
    codice: leggi("--f-codice", "ui-monospace, monospace"),
  };
}

const oggi = () => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

export default function CreaCard({ dati, onClose }: { dati: DatiCard; onClose: () => void }) {
  const contenuti = useMemo(() => costruisci(dati), [dati]);
  const primo = SCELTE.find((s) => disponibile(contenuti[s.tipo]))?.tipo ?? "cento";
  const [tipo, setTipo] = useState<TipoCard>(primo);
  const [tono, setTono] = useState<Tono>("curioso");
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiato, setCopiato] = useState<"" | "testo" | "citazione">("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chiudiRef = useRef<HTMLButtonElement>(null);

  const scelto = contenuti[tipo];
  const contenuto: ContenutoCard | null = disponibile(scelto) ? scelto : null;

  // Gli indirizzi dipendono dal sito su cui siamo: valgono con qualunque dominio
  const origine = typeof window === "undefined" ? "" : window.location.origin;
  const indirizzoPagina = `${origine}/comune/${slugComune(dati.voce.name, dati.voce.istat)}`;

  // Il testo del post: si riscrive quando cambiano card o tono, a meno che la persona l'abbia modificato
  const proposto = useMemo(() => (contenuto ? testoPost(dati, contenuto, tono, indirizzoPagina) : ""), [dati, contenuto, tono, indirizzoPagina]);
  const [modificato, setModificato] = useState<string | null>(null);
  const testo = modificato ?? proposto;
  const elencoFonti = useMemo(() => (contenuto ? fonti(dati, contenuto, indirizzoPagina, origine) : []), [dati, contenuto, indirizzoPagina, origine]);
  const frase = contenuto ? citazione(contenuto, indirizzoPagina, oggi()) : "";
  const sharePossibile = typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function";

  // Disegna la card quando cambia il tipo (e i caratteri sono pronti)
  useEffect(() => {
    if (!contenuto) return;
    let vivo = true;
    (async () => {
      try {
        const f = famiglie();
        await Promise.all(
          [`700 40px ${f.display}`, `600 20px ${f.display}`, `400 20px ${f.testo}`, `500 20px ${f.testo}`, `600 20px ${f.testo}`, `700 20px ${f.testo}`, `400 20px ${f.codice}`, `500 20px ${f.codice}`].map(
            (x) => document.fonts.load(x).catch(() => []),
          ),
        );
        const { w, h } = DIMENSIONI[contenuto.tipo];
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas non disponibile");
        disegna(ctx, contenuto, { ...f, indirizzo: window.location.host });
        if (!vivo) return;
        canvasRef.current = canvas;
        setAnteprima(canvas.toDataURL("image/png"));
        setErrore(null);
      } catch (e) {
        if (vivo) setErrore(e instanceof Error ? e.message : "Non riesco a disegnare la card.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [contenuto]);

  // Tastiera: Esc chiude; il focus parte dal pulsante di chiusura
  useEffect(() => {
    chiudiRef.current?.focus();
    const su = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", su);
    return () => document.removeEventListener("keydown", su);
  }, [onClose]);

  const blob = () =>
    new Promise<Blob | null>((ok) => {
      const c = canvasRef.current;
      if (c) c.toBlob((b) => ok(b), "image/png");
      else ok(null);
    });

  async function scarica() {
    const b = await blob();
    if (!b || !contenuto) return setErrore("La card non è ancora pronta, riprova tra un attimo.");
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contenuto.file}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function condividi() {
    const b = await blob();
    if (!b || !contenuto) return;
    const file = new File([b], `${contenuto.file}.png`, { type: "image/png" });
    try {
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `${dati.voce.name} · Parimetro`, text: testo });
      else await navigator.share({ title: `${dati.voce.name} · Parimetro`, text: testo, url: indirizzoPagina });
    } catch {
      /* l'utente ha chiuso il foglio di condivisione: niente da segnalare */
    }
  }

  async function copia(cosa: "testo" | "citazione") {
    try {
      await navigator.clipboard.writeText(cosa === "testo" ? testo : frase);
      setCopiato(cosa);
      setTimeout(() => setCopiato(""), 2500);
    } catch {
      setErrore("Non riesco a copiare: selezionalo e copialo a mano.");
    }
  }

  const nonDisponibili = SCELTE.filter((s) => !disponibile(contenuti[s.tipo]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-inchiostro/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crea-card-titolo"
        className="font-testo flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[36px] bg-crema text-inchiostro shadow-2xl sm:rounded-[44px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6 sm:px-9 sm:pt-8">
          <div>
            <h2 id="crea-card-titolo" className="font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl">
              Il post di {dati.voce.name} è già pronto.
            </h2>
            <p className="mt-1 text-base text-[#45435E]">Cambialo come vuoi: la fonte viaggia con la card.</p>
          </div>
          <button
            ref={chiudiRef}
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#E8DEC8] bg-white hover:bg-[#F4EEDF]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6 pt-3 sm:px-9 md:grid-cols-[.9fr_1.1fr]">
          {/* ---- la card ---- */}
          <div className="flex flex-col gap-3">
            <div className="flex min-h-[260px] items-center justify-center rounded-[32px] bg-[#F0E8D6] p-4">
              {anteprima && contenuto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={anteprima} alt={contenuto.descrizione} className="max-h-[48vh] w-auto max-w-full rounded-[24px] shadow-[0_18px_40px_rgba(27,26,46,.18)]" />
              ) : errore ? (
                <p className="text-center text-[15px] text-[#A83A22]">{errore}</p>
              ) : (
                <p className="text-[15px] text-grigio">{contenuto ? "Preparo la card…" : "Scegli una card disponibile."}</p>
              )}
            </div>
            <div role="radiogroup" aria-label="Che card vuoi" className="flex flex-wrap justify-center gap-2">
              {SCELTE.map((s) => {
                const ok = disponibile(contenuti[s.tipo]);
                const attivo = tipo === s.tipo && ok;
                return (
                  <button
                    key={s.tipo}
                    role="radio"
                    aria-checked={attivo}
                    disabled={!ok}
                    title={s.testo}
                    onClick={() => {
                      setTipo(s.tipo);
                      setModificato(null);
                    }}
                    className={`min-h-12 rounded-full border-2 px-5 text-[15px] font-semibold transition ${
                      attivo ? "border-mirtillo bg-mirtillo text-white" : ok ? "border-[#E8DEC8] bg-white hover:border-[#CFC6B3]" : "cursor-not-allowed border-[#E8DEC8] bg-[#EFE7D6] text-grigio opacity-70"
                    }`}
                  >
                    {s.nome}
                  </button>
                );
              })}
            </div>
            {nonDisponibili.map((s) => (
              <p key={s.tipo} className="px-2 text-center text-[13px] leading-snug text-grigio">
                <strong>{s.nome}</strong> non c’è: {(contenuti[s.tipo] as { motivo: string }).motivo}
              </p>
            ))}
          </div>

          {/* ---- il testo, le fonti, i pulsanti ---- */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="font-codice text-xs font-medium uppercase tracking-wider text-grigio">Che tono vuoi?</div>
              <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Tono del testo">
                {TONI.map((t) => (
                  <button
                    key={t.tono}
                    role="radio"
                    aria-checked={tono === t.tono}
                    onClick={() => {
                      setTono(t.tono);
                      setModificato(null);
                    }}
                    className={`min-h-12 rounded-full border-2 px-5 text-[15px] font-semibold ${
                      tono === t.tono ? "border-mirtillo bg-mirtillo text-white" : "border-[#E8DEC8] bg-white hover:border-[#CFC6B3]"
                    }`}
                  >
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="testo-post" className="font-codice text-xs font-medium uppercase tracking-wider text-grigio">
                Il testo del post
              </label>
              <textarea
                id="testo-post"
                value={testo}
                onChange={(e) => setModificato(e.target.value)}
                rows={6}
                className="mt-2 w-full resize-y rounded-[24px] border-2 border-[#E8DEC8] bg-white p-4 text-[16px] leading-relaxed focus:border-mirtillo focus:outline-none"
              />
              {modificato != null && (
                <button onClick={() => setModificato(null)} className="mt-1 min-h-11 text-sm font-semibold text-mirtillo underline underline-offset-2">
                  Riscrivi il testo
                </button>
              )}
            </div>

            <div>
              <div className="font-codice text-xs font-medium uppercase tracking-wider text-grigio">Le fonti che porti con te</div>
              <ul className="mt-2 flex flex-col gap-2">
                {elencoFonti.map((f) => (
                  <li key={f.nome} className="flex items-start gap-3 rounded-[20px] bg-white px-4 py-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-menta" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1B1A2E" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    </span>
                    <div className="text-[15px] leading-snug">
                      <strong>{f.nome}</strong> · {f.dettaglio}
                      <br />
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-mirtillo underline underline-offset-2">
                        Apri il dato ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3 rounded-[24px] bg-[#E8E4FF] px-4 py-3">
              <div className="min-w-0 flex-1 text-sm leading-snug">
                <strong>Come citarci</strong>
                <div className="font-codice mt-0.5 break-words text-[13px]">{frase}</div>
              </div>
              <button onClick={() => copia("citazione")} className="min-h-11 shrink-0 rounded-full border-2 border-inchiostro bg-white px-4 text-sm font-semibold" aria-live="polite">
                {copiato === "citazione" ? "Copiata ✓" : "Copia"}
              </button>
            </div>

            <div className="mt-auto grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              {sharePossibile ? (
                <button onClick={condividi} disabled={!anteprima} className="min-h-14 rounded-full bg-mirtillo text-lg font-bold text-white hover:opacity-90 disabled:opacity-50">
                  Condividi…
                </button>
              ) : (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(testo)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-14 items-center justify-center rounded-full bg-mirtillo text-lg font-bold text-white hover:opacity-90"
                >
                  Manda su WhatsApp
                </a>
              )}
              <button onClick={scarica} disabled={!anteprima} className="min-h-14 rounded-full border-2 border-inchiostro text-base font-bold hover:bg-white disabled:opacity-50">
                Scarica
              </button>
              <button onClick={() => copia("testo")} className="min-h-14 rounded-full border-2 border-inchiostro text-base font-bold hover:bg-white" aria-live="polite">
                {copiato === "testo" ? "Copiato ✓" : "Copia il testo"}
              </button>
            </div>
            <p className="text-[13px] leading-snug text-grigio">La card non contiene il tuo nome. Il link porta alla pagina del comune, non a un tuo profilo.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
