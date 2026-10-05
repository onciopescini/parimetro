"use client";

// "Crea la card": sceglie cosa mostrare, disegna l'immagine nel browser e la fa scaricare o condividere.
// Nessun server e nessun dato lascia il dispositivo: l'immagine nasce da un <canvas> locale.
// Le avvertenze sono dentro la card e non c'e' modo di toglierle.

import { useEffect, useMemo, useRef, useState } from "react";
import { costruisci, disponibile, type ContenutoCard, type DatiCard, type TipoCard } from "@/lib/card/contenuto";
import { DIMENSIONI, disegna, type Ambiente } from "@/lib/card/disegna";
import { slugComune } from "@/lib/pagina/comune";

/**
 * Le card offerte al pubblico. "domanda" e' pronta e testata ma resta spenta finche' il testo (e il rimando
 * all'accesso civico) non e' stato rivisto da chi ha competenza legale: per accenderla basta aggiungerla qui.
 */
const ATTIVE: readonly TipoCard[] = ["cento", "tre"];

const TUTTE: { tipo: TipoCard; titolo: string; testo: string; formato: string }[] = [
  { tipo: "cento", titolo: "Dove vanno i soldi", testo: "Ogni 100 € spesi dal comune, divisi per voce.", formato: "Quadrata · Facebook e Instagram" },
  { tipo: "tre", titolo: "Il confronto con i simili", testo: "Tre numeri: spesa, PNRR e gare.", formato: "Verticale · storie" },
  { tipo: "domanda", titolo: "Una domanda per il comune", testo: "Il dato che si discosta di più dai comuni simili.", formato: "Larga · WhatsApp e link" },
];

/** Le famiglie di caratteri che next/font ha caricato, lette dalle variabili CSS; se mancano, caratteri di sistema. */
function famiglie(): Pick<Ambiente, "serif" | "sans" | "mono"> {
  const css = getComputedStyle(document.documentElement);
  const leggi = (nome: string, ripiego: string) => {
    const v = css.getPropertyValue(nome).trim();
    return v ? `${v}, ${ripiego}` : ripiego;
  };
  return {
    serif: leggi("--font-card-serif", "Georgia, serif"),
    sans: leggi("--font-card-sans", "system-ui, sans-serif"),
    mono: leggi("--font-card-mono", "ui-monospace, monospace"),
  };
}

const SCELTE = TUTTE.filter((s) => ATTIVE.includes(s.tipo));

export default function CreaCard({ dati, onClose }: { dati: DatiCard; onClose: () => void }) {
  const contenuti = useMemo(() => costruisci(dati), [dati]);
  const primo = SCELTE.find((s) => disponibile(contenuti[s.tipo]))?.tipo ?? "cento";
  const [tipo, setTipo] = useState<TipoCard>(primo);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chiudiRef = useRef<HTMLButtonElement>(null);

  const scelto = contenuti[tipo];
  const contenuto: ContenutoCard | null = disponibile(scelto) ? scelto : null;
  const indirizzoPagina = typeof window === "undefined" ? "" : `${window.location.origin}/comune/${slugComune(dati.voce.name, dati.voce.istat)}`;
  const sharePossibile = typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function";

  // Disegna la card quando cambia il tipo (e i caratteri sono pronti)
  useEffect(() => {
    if (!contenuto) return;
    let vivo = true;
    (async () => {
      try {
        const f = famiglie();
        await Promise.all(
          [`500 40px ${f.serif}`, `600 40px ${f.serif}`, `400 24px ${f.mono}`, `500 24px ${f.mono}`, `400 24px ${f.sans}`, `500 24px ${f.sans}`].map(
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
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${dati.voce.name} · Parimetro`, text: contenuto.descrizione, url: indirizzoPagina });
      } else {
        await navigator.share({ title: `${dati.voce.name} · Parimetro`, text: contenuto.descrizione, url: indirizzoPagina });
      }
    } catch {
      /* l'utente ha chiuso il foglio di condivisione: niente da segnalare */
    }
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(indirizzoPagina);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setErrore("Non riesco a copiare il link: selezionalo e copialo a mano.");
    }
  }

  const testoWhatsapp = contenuto ? `${contenuto.descrizione} ${indirizzoPagina}` : indirizzoPagina;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crea-card-titolo"
        className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-[#F4EFE4] text-[#1F2430] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6 sm:px-8">
          <div>
            <h2 id="crea-card-titolo" className="font-serif text-2xl font-semibold leading-tight sm:text-3xl" style={{ fontFamily: "var(--font-card-serif), Georgia, serif" }}>
              Crea la card di {dati.voce.name}
            </h2>
            <p className="mt-1 text-base text-[#6B6A60]">Scegli cosa mostrare, poi scaricala o mandala.</p>
          </div>
          <button
            ref={chiudiRef}
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#C9BFA9] text-[#45463F] hover:bg-black/5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6 sm:px-8 md:grid-cols-[1.05fr_.95fr]">
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Che cosa vuoi mostrare" className="flex flex-col gap-3">
              {SCELTE.map((s) => {
                const c = contenuti[s.tipo];
                const ok = disponibile(c);
                const attivo = tipo === s.tipo && ok;
                return (
                  <button
                    key={s.tipo}
                    role="radio"
                    aria-checked={attivo}
                    aria-disabled={!ok}
                    disabled={!ok}
                    onClick={() => setTipo(s.tipo)}
                    className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-left transition ${
                      attivo ? "border-[#D99A25] bg-[#FFF7E3]" : ok ? "border-[#D9D0BE] bg-[#FBF8F1] hover:border-[#C9BFA9]" : "cursor-not-allowed border-[#E3DAC8] bg-[#EFE7D6] opacity-70"
                    }`}
                  >
                    <div className="text-lg font-semibold">{s.titolo}</div>
                    <div className="text-[15px] leading-snug text-[#6B6A60]">{ok ? s.testo : (c as { motivo: string }).motivo}</div>
                    {ok && <div className="mt-1 text-[13px] font-medium text-[#8A5300]">{s.formato}</div>}
                  </button>
                );
              })}
            </div>
            <p className="rounded-2xl bg-[#EFE7D6] p-4 text-[15px] leading-relaxed text-[#2B2F38]">
              <strong>Le avvertenze restano sulla card.</strong> Dice che i dati sono di cassa e con quali comuni è confrontato: così un numero non viene frainteso. Non si può togliere.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-[#E9E2D1] p-4">
              {anteprima && contenuto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={anteprima} alt={contenuto.descrizione} className="max-h-[46vh] w-auto max-w-full rounded-xl shadow-lg" />
              ) : errore ? (
                <p className="text-center text-[15px] text-[#A83A22]">{errore}</p>
              ) : (
                <p className="text-[15px] text-[#6B6A60]">{contenuto ? "Preparo la card…" : "Scegli un’opzione disponibile."}</p>
              )}
            </div>
            <button
              onClick={scarica}
              disabled={!anteprima}
              className="min-h-14 rounded-2xl bg-[#0A1018] text-lg font-semibold text-[#F4EFE4] hover:bg-[#1A2A40] disabled:opacity-50"
            >
              Scarica l’immagine
            </button>
            <div className="grid grid-cols-2 gap-3">
              {sharePossibile ? (
                <button onClick={condividi} disabled={!anteprima} className="min-h-12 rounded-xl border border-[#1F2430] text-base hover:bg-black/5 disabled:opacity-50">
                  Condividi…
                </button>
              ) : (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(testoWhatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-center rounded-xl border border-[#1F2430] text-base hover:bg-black/5"
                >
                  Manda su WhatsApp
                </a>
              )}
              <button onClick={copiaLink} className="min-h-12 rounded-xl border border-[#1F2430] text-base hover:bg-black/5" aria-live="polite">
                {copiato ? "Link copiato ✓" : "Copia il link"}
              </button>
            </div>
            <p className="text-[13px] leading-snug text-[#6B6A60]">
              La card non contiene il tuo nome. Il link porta alla pagina del comune, non a un tuo profilo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
