// Client di Jev (TypeSafe, "System One"): domande a scelta chiusa che tornano con le probabilita'.
// Gira nel Worker (functions/api/chat.ts): la chiave sta nei segreti di Cloudflare (JEV_API_KEY) e non arriva mai al browser.
// Jev non scrive testo: sceglie tra opzioni che gli diamo noi. Per questo non puo' far fare al codice altro che cio' che e' previsto.

import { chiaveCache, type MemoriaJev } from "./tetto";

export const URL_JEV = "https://api.typesafe.ai/v1/systemone";
export const MODELLO_JEV = "jev-latest";

export interface RispostaScelta {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  noul?: number;
}
export type RisposteJev = Record<string, RispostaScelta>;

export interface DomandaJev {
  type: "choice" | "noul";
  instructions: string;
  criteria?: Record<string, string>;
}

export interface OpzioniJev {
  chiave: string;
  /** Per i test; in produzione e' fetch */
  fetcher?: typeof fetch;
  /** Solo per provare il flusso senza chiave vera */
  url?: string;
  timeoutMs?: number;
  modello?: string;
  /** Risposte gia' avute per la stessa richiesta: non si pagano due volte */
  memoria?: MemoriaJev;
  /** Il tetto di spesa: chiamato solo quando si sta per PAGARE una chiamata (mai se la risposta e' in memoria); false = non chiamare */
  puoChiamare?: () => Promise<boolean>;
}

/**
 * Con "crediti finiti" (402) o "chiave non valida" (401, 403) non ha senso riprovare a ogni domanda: si sospende Jev per
 * qualche minuto (per istanza del Worker) e la chat usa il modo di prima. Passati i minuti si riprova da sola.
 */
const SOSPENSIONE_MS = 10 * 60_000;
let sospesoFinoA = 0;
/** Solo per i test */
export const riattivaJev = () => {
  sospesoFinoA = 0;
};

/** Manda lo stato e le domande; restituisce le risposte, o null se Jev non risponde (si passa al ripiego). */
export async function chiediJev(
  stato: string,
  domande: Record<string, DomandaJev>,
  o: OpzioniJev,
): Promise<RisposteJev | null> {
  if (Date.now() < sospesoFinoA) return null;
  const f = o.fetcher ?? fetch;
  const modello = o.modello ?? MODELLO_JEV;
  const chiaveMemoria = o.memoria ? await chiaveCache(stato, { domande, modello }) : null;
  if (o.memoria && chiaveMemoria) {
    const gia = await o.memoria.leggi(chiaveMemoria);
    if (gia) return gia;
  }
  if (o.puoChiamare && !(await o.puoChiamare())) return null;
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    try {
      const r = await f(o.url ?? URL_JEV, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.chiave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state: stato, model: modello, questions: domande }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 400));
        continue;
      }
      if (!r.ok) {
        // Solo lo stato: niente della domanda finisce nei log
        console.warn("jev", r.status);
        if (r.status === 401 || r.status === 402 || r.status === 403) sospesoFinoA = Date.now() + SOSPENSIONE_MS;
        return null;
      }
      const j = (await r.json()) as { answers?: RisposteJev };
      if (!j.answers || typeof j.answers !== "object") return null;
      if (o.memoria && chiaveMemoria && Object.keys(j.answers).length) await o.memoria.scrivi(chiaveMemoria, j.answers);
      return j.answers;
    } catch (e) {
      console.warn("jev", "errore", e instanceof Error ? e.name : "sconosciuto");
    }
  }
  return null;
}

/** Probabilita' della risposta scelta (0 se manca): serve a decidere se fidarsi. */
export function probabilitaScelta(r: RispostaScelta | undefined): number {
  if (!r?.choice) return 0;
  const p = r.probabilities?.[r.choice];
  return typeof p === "number" ? p : (r.confidence ?? 0);
}
