// Client OpenRouter. Gira nel Worker (functions/api/chat.ts): la chiave sta nei
// segreti di Cloudflare e non arriva mai al browser.

// Gratuiti e con risposta JSON: cambiano spesso e sono spesso saturi (429), quindi
// sono tanti e si provano in ordine. Si possono cambiare con la variabile CHAT_MODELLI.
export const MODELLI_PREDEFINITI = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "poolside/laguna-s-2.1:free",
  "openrouter/free",
];

export interface Messaggio {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpzioniLlm {
  chiave: string;
  modelli: string[];
  /** Per i test; in produzione e' fetch */
  fetcher?: typeof fetch;
  maxToken?: number;
  json?: boolean;
  /** Solo per provare il flusso senza chiave vera (server finto in locale) */
  url?: string;
  /** Dove il sito si presenta a OpenRouter (statistiche sue, non nostre) */
  referer?: string;
  /** Pausa prima del secondo giro sui modelli saturi, in ms (0 nei test) */
  attesa?: number;
  /** Quanti giri sui modelli (2 = riprova i saturi). Per la parte facoltativa basta 1 */
  giri?: number;
  /** Tetto per ogni chiamata, in ms */
  timeoutMs?: number;
}

type Esito<T> = { tipo: "ok"; valore: T } | { tipo: "saturo" } | { tipo: "no" };

async function provaModello<T>(
  modello: string,
  messaggi: Messaggio[],
  o: OpzioniLlm,
  accetta: (testo: string) => T | null,
  conJson: boolean,
): Promise<Esito<T>> {
  const f = o.fetcher ?? fetch;
  try {
    const corpo: Record<string, unknown> = {
      model: modello,
      messages: messaggi,
      temperature: 0,
      max_tokens: o.maxToken ?? 400,
    };
    if (conJson) corpo.response_format = { type: "json_object" };
    const r = await f(o.url ?? "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${o.chiave}`,
        "Content-Type": "application/json",
        "HTTP-Referer": o.referer ?? "https://parimetro.pages.dev",
        "X-Title": "Parimetro",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
    });
    if (!r.ok) {
      // Solo stato e inizio del messaggio d'errore del fornitore: niente della domanda
      const dettaglio = (await r.text().catch(() => "")).slice(0, 200);
      console.warn("openrouter", modello, r.status, dettaglio);
      // Alcuni modelli non accettano response_format: stesso modello, senza
      if (conJson && (r.status === 400 || r.status === 422)) {
        return provaModello(modello, messaggi, o, accetta, false);
      }
      return r.status === 429 ? { tipo: "saturo" } : { tipo: "no" };
    }
    const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const testo = j.choices?.[0]?.message?.content;
    if (typeof testo !== "string" || !testo.trim()) {
      console.warn("openrouter", modello, "risposta vuota");
      return { tipo: "no" };
    }
    const valore = accetta(testo);
    if (valore == null) {
      console.warn("openrouter", modello, "risposta scartata");
      return { tipo: "no" };
    }
    return { tipo: "ok", valore };
  } catch (e) {
    console.warn("openrouter", modello, "errore", e instanceof Error ? e.name : "sconosciuto");
    return { tipo: "no" };
  }
}

/**
 * Prova i modelli in ordine finche' uno risponde con un testo accettato. I modelli
 * gratuiti vanno e vengono e vanno spesso in 429 ("saturo"): se nessuno risponde ma
 * qualcuno era solo saturo, si aspetta un attimo e si riprovano quelli.
 * `accetta` permette al chiamante di rifiutare una risposta (es. JSON non valido).
 */
export async function chiediModello<T>(
  messaggi: Messaggio[],
  o: OpzioniLlm,
  accetta: (testo: string) => T | null,
): Promise<{ valore: T; modello: string } | null> {
  let daRiprovare = o.modelli;
  for (let giro = 0; giro < (o.giri ?? 2) && daRiprovare.length; giro++) {
    if (giro === 1) await new Promise((r) => setTimeout(r, o.attesa ?? 1500));
    const saturi: string[] = [];
    for (const modello of daRiprovare) {
      const e = await provaModello(modello, messaggi, o, accetta, !!o.json);
      if (e.tipo === "ok") return { valore: e.valore, modello };
      if (e.tipo === "saturo") saturi.push(modello);
    }
    daRiprovare = saturi;
  }
  return null;
}
