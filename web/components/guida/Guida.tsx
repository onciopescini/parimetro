"use client";

// La prima visita: due frasi che spiegano cosa si sta guardando, poi un giro di pochi passi sui comandi veri.
// Si ricorda (nel browser, solo li') che e' stato visto; "Come si legge" lo riapre quando si vuole.
// I passi puntano ai comandi con data-guida="..."; se un comando non c'e' (la chat puo' essere spenta) il passo salta.

import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

const CHIAVE = "parimetro-guida-vista";

interface Passo {
  /** valore di data-guida del comando da evidenziare; senza, il passo parla da solo */
  bersaglio?: string;
  titolo: string;
  testo: string;
}

const PASSI: Passo[] = [
  {
    bersaglio: "cerca",
    titolo: "Parti dal tuo comune",
    testo: "Scrivi il nome e la mappa ti ci porta. Ogni blocco della mappa è un comune.",
  },
  {
    bersaglio: "metriche",
    titolo: "Altezza e colore",
    testo: "Ogni blocco racconta due numeri, a tua scelta: uno è l’altezza, l’altro il colore. Prova a cambiarli.",
  },
  {
    bersaglio: "procapite",
    titolo: "Per abitante",
    testo: "Un comune grande spende di più solo perché ha più abitanti. “Pro capite” divide per i residenti, così il confronto è giusto.",
  },
  {
    bersaglio: "classifiche",
    titolo: "Le classifiche",
    testo: "Chi spende di più per abitante, chi ha più opere del PNRR, chi fa più gare con offerte vere. Si filtrano per dimensione e regione.",
  },
  {
    bersaglio: "chat",
    titolo: "Chiedi a parole",
    testo: "Puoi scrivere una domanda in italiano. I numeri li calcola il programma sui dati ufficiali, non una macchina che inventa.",
  },
  {
    titolo: "Poi clicca un comune",
    testo:
      "Si apre la scheda: dove vanno ogni 100 € spesi, il confronto con i comuni simili, le opere, le gare. E puoi creare una card da condividere. Ogni numero ha la sua fonte; sono dati di cassa (incassi e pagamenti), non bilanci di previsione.",
  },
];

// Chi arriva da un link a un comune e' venuto per quel comune: il benvenuto non gli si mette davanti.
const daLinkAComune = () => new URLSearchParams(window.location.search).has("comune");

const leggi = () => {
  try {
    if (daLinkAComune()) return true;
    return localStorage.getItem(CHIAVE) === "1";
  } catch {
    return false;
  }
};
const segna = () => {
  try {
    localStorage.setItem(CHIAVE, "1");
  } catch {
    /* senza memoria nel browser la guida si ripropone: pazienza */
  }
};

const trova = (b?: string) => {
  const el = b ? document.querySelector<HTMLElement>(`[data-guida="${b}"]`) : null;
  return el && el.getClientRects().length > 0 ? el : null; // nascosto = come se non ci fosse
};

const nessunAbbonamento = () => () => {};

export default function Guida({ aperta, onChiudi }: { aperta: boolean; onChiudi: () => void }) {
  const [fase, setFase] = useState<"benvenuto" | "giro">("benvenuto");
  const [i, setI] = useState(0);
  const [rett, setRett] = useState<DOMRect | null>(null);
  const [chiusa, setChiusa] = useState(false);
  // Lato server si considera "gia' vista" (niente da mostrare); nel browser si legge la memoria vera.
  const vista = useSyncExternalStore(nessunAbbonamento, leggi, () => true);
  const visibile = aperta || (!vista && !chiusa);

  const chiudi = useCallback(() => {
    segna();
    setChiusa(true);
    setFase("benvenuto");
    setI(0);
    onChiudi();
  }, [onChiudi]);

  // Passi realmente disponibili (la chat, per esempio, puo' mancare)
  const passi = visibile && fase === "giro" ? PASSI.filter((p) => !p.bersaglio || trova(p.bersaglio)) : [];
  const passo = passi[Math.min(i, Math.max(passi.length - 1, 0))];
  const bersaglio = passo?.bersaglio;

  useLayoutEffect(() => {
    if (!bersaglio) return;
    const el = trova(bersaglio);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const misura = () => setRett(el.getBoundingClientRect());
    const frame = requestAnimationFrame(misura);
    window.addEventListener("resize", misura);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", misura);
    };
  }, [bersaglio]);

  useEffect(() => {
    if (!visibile) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && chiudi();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [visibile, chiudi]);

  if (!visibile) return null;

  if (fase === "benvenuto") {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-inchiostro/50 p-4" role="dialog" aria-modal="true" aria-labelledby="guida-titolo">
        <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[32px] border border-[#E8DEC8] bg-crema p-6 text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.3)] md:p-8">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-3.5 w-12 rounded-full bg-mirtillo" />
            <span className="h-3.5 w-7 rounded-full bg-limone" />
            <span className="ml-1 font-display text-xl font-bold">Parimetro</span>
          </div>
          <h2 id="guida-titolo" className="mt-5 font-display text-3xl font-semibold leading-tight md:text-4xl">
            Dove vanno i soldi del tuo comune?
          </h2>
          <p className="mt-4 text-lg leading-relaxed">
            Questa è la mappa dei bilanci di tutti i comuni italiani. Cerchi il tuo, vedi come spende e lo confronti con comuni della sua dimensione.
          </p>
          <p className="mt-3 text-base leading-relaxed text-grigio">
            Non diamo pagelle e non accusiamo nessuno: mettiamo i numeri uno accanto all’altro, con le fonti, e le domande vengono da sé.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => {
                setI(0);
                setFase("giro");
              }}
              className="min-h-12 rounded-full bg-mirtillo px-6 text-base font-semibold text-white shadow-[0_4px_0_#1B1A2E] transition active:translate-y-0.5 active:shadow-none"
            >
              Facciamo un giro (1 minuto)
            </button>
            <button onClick={chiudi} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-6 text-base font-semibold hover:bg-sabbia/30">
              Esploro da solo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!passo) return null;
  const ultimo = i >= passi.length - 1;
  const R = 8;
  const rettAttivo = bersaglio ? rett : null;
  // la scheda del passo sta dalla parte opposta al comando evidenziato, per non coprirlo
  const inAlto = !!rettAttivo && rettAttivo.top > window.innerHeight / 2;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Giro guidato">
      {rettAttivo ? (
        // l'alone scuro e' l'ombra enorme di un riquadro trasparente sopra il comando
        <div
          className="pointer-events-none fixed rounded-3xl ring-4 ring-limone"
          style={{
            left: rettAttivo.left - R,
            top: rettAttivo.top - R,
            width: rettAttivo.width + 2 * R,
            height: rettAttivo.height + 2 * R,
            boxShadow: "0 0 0 9999px rgba(27,26,46,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-inchiostro/55" />
      )}
      <div className={`fixed inset-x-3 ${inAlto ? "top-3 md:top-8" : "bottom-3 md:bottom-8"} mx-auto w-auto max-w-md rounded-[28px] border border-[#E8DEC8] bg-crema p-5 text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.3)] md:inset-x-auto md:left-1/2 md:-translate-x-1/2`}>
        <div className="text-sm font-semibold text-grigio">
          {i + 1} di {passi.length}
        </div>
        <h3 className="mt-1 font-display text-2xl font-semibold">{passo.titolo}</h3>
        <p className="mt-2 text-base leading-relaxed">{passo.testo}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={chiudi} className="min-h-12 rounded-full px-4 text-sm font-semibold text-grigio hover:text-inchiostro">
            Salta
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="min-h-12 rounded-full border border-[#E8DEC8] bg-carta px-5 text-sm font-semibold hover:bg-sabbia/30">
                Indietro
              </button>
            )}
            <button
              onClick={() => (ultimo ? chiudi() : setI(i + 1))}
              className="min-h-12 rounded-full bg-mirtillo px-6 text-sm font-semibold text-white"
            >
              {ultimo ? "Ho capito" : "Avanti"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
