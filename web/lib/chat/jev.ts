// Client di Jev (TypeSafe, "System One"): domande a scelta chiusa che tornano con le probabilita'.
// Gira nel Worker (functions/api/chat.ts): la chiave sta nei segreti di Cloudflare (JEV_API_KEY) e non arriva mai al browser.
// Jev non scrive testo: sceglie tra opzioni che gli diamo noi. Per questo non puo' far fare al codice altro che cio' che e' previsto.

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
}

/** Manda lo stato e le domande; restituisce le risposte, o null se Jev non risponde (si passa al ripiego). */
export async function chiediJev(
  stato: string,
  domande: Record<string, DomandaJev>,
  o: OpzioniJev,
): Promise<RisposteJev | null> {
  const f = o.fetcher ?? fetch;
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    try {
      const r = await f(o.url ?? URL_JEV, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.chiave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state: stato, model: o.modello ?? MODELLO_JEV, questions: domande }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 400));
        continue;
      }
      if (!r.ok) {
        // Solo lo stato: niente della domanda finisce nei log
        console.warn("jev", r.status);
        return null;
      }
      const j = (await r.json()) as { answers?: RisposteJev };
      return j.answers && typeof j.answers === "object" ? j.answers : null;
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
