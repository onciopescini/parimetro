// Client OpenRouter. Gira nel Worker (functions/api/chat.ts): la chiave sta nei
// segreti di Cloudflare e non arriva mai al browser.

export const MODELLI_PREDEFINITI = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
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
}

/**
 * Prova i modelli in ordine finche' uno risponde con un testo. I modelli gratuiti
 * vanno e vengono e hanno code di richieste: un fallimento non deve fermare la chat.
 * `accetta` permette al chiamante di rifiutare una risposta (es. JSON non valido) e
 * passare al modello successivo.
 */
export async function chiediModello<T>(
  messaggi: Messaggio[],
  o: OpzioniLlm,
  accetta: (testo: string) => T | null,
): Promise<{ valore: T; modello: string } | null> {
  const f = o.fetcher ?? fetch;
  for (const modello of o.modelli) {
    try {
      const corpo: Record<string, unknown> = {
        model: modello,
        messages: messaggi,
        temperature: 0,
        max_tokens: o.maxToken ?? 400,
      };
      if (o.json) corpo.response_format = { type: "json_object" };
      const r = await f(o.url ?? "https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${o.chiave}`,
          "Content-Type": "application/json",
          "HTTP-Referer": o.referer ?? "https://parimetro.pages.dev",
          "X-Title": "Parimetro",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(25_000),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
      const testo = j.choices?.[0]?.message?.content;
      if (typeof testo !== "string" || !testo.trim()) continue;
      const valore = accetta(testo);
      if (valore != null) return { valore, modello };
    } catch {
      // timeout o rete: si passa al modello successivo
    }
  }
  return null;
}
