// Il tetto di spesa di Jev e la memoria delle risposte, per tenere il costo sotto controllo:
//   · cache: la stessa domanda (stesso testo, stessa forma delle domande a Jev) non si paga due volte per 24 ore;
//   · tetto: dopo N chiamate nello stesso giorno (UTC) Jev si ferma e la chat torna al modo di prima, senza Jev.
// Nessuna domanda viene conservata: la chiave della cache e' un'impronta, il valore sono le sole risposte di Jev.
import type { RisposteJev } from "./jev";

/** Chiamate a Jev al giorno prima che si fermi: circa 0,15 $ al giorno al prezzo di 0,05 $ per milione di token. */
export const TETTO_PREDEFINITO = 3000;
export const DURATA_CACHE_S = 24 * 3600;

export interface MemoriaJev {
  leggi(chiave: string): Promise<RisposteJev | null>;
  scrivi(chiave: string, risposte: RisposteJev): Promise<void>;
}

export async function improntaTesto(testo: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** La chiave dipende dal testo E dalle domande: se cambiamo le opzioni, le risposte vecchie non valgono piu'. */
export const chiaveCache = (stato: string, domande: unknown) => improntaTesto(`${stato}\n${JSON.stringify(domande)}`);

/** La cache di Cloudflare del datacenter (non ha costi): approssimativa, ma e' proprio quello che serve. */
export function memoriaCloudflare(): MemoriaJev {
  const cache = (caches as unknown as { default: Cache }).default;
  const richiesta = (k: string) => new Request(`https://jev.cache.interno/${k}`);
  return {
    async leggi(k) {
      try {
        const r = await cache.match(richiesta(k));
        return r ? ((await r.json()) as RisposteJev) : null;
      } catch {
        return null;
      }
    },
    async scrivi(k, risposte) {
      try {
        await cache.put(
          richiesta(k),
          new Response(JSON.stringify(risposte), { headers: { "Cache-Control": `max-age=${DURATA_CACHE_S}` } }),
        );
      } catch {
        /* la cache e' un risparmio, non un obbligo */
      }
    },
  };
}

// ------------------------------------------------------------------ il tetto, su D1
export interface StmtTetto {
  bind(...v: unknown[]): StmtTetto;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface DbTetto {
  prepare(sql: string): StmtTetto;
}

export const giornoUtc = (ms: number) => Math.floor(ms / 86_400_000);

/**
 * Conta una chiamata e dice se e' ancora dentro il tetto. Se l'archivio non risponde la risposta e' NO: nel dubbio
 * non si spende (la chat funziona lo stesso, col modo di prima).
 */
export async function dentroIlTetto(db: DbTetto, chiave: string, massimo: number, ms: number = Date.now()): Promise<boolean> {
  try {
    const giorno = giornoUtc(ms);
    await db
      .prepare("INSERT INTO tetto_giornaliero (chiave, giorno, n) VALUES (?, ?, 1) ON CONFLICT (chiave, giorno) DO UPDATE SET n = n + 1")
      .bind(chiave, giorno)
      .run();
    const r = await db.prepare("SELECT n FROM tetto_giornaliero WHERE chiave = ? AND giorno = ?").bind(chiave, giorno).first<{ n: number }>();
    return (r?.n ?? Infinity) <= massimo;
  } catch (e) {
    console.warn("tetto", e instanceof Error ? e.name : "errore");
    return false;
  }
}

export function leggiTetto(v: string | undefined): number {
  if (v == null || v.trim() === "") return TETTO_PREDEFINITO; // variabile vuota = non impostata (non zero!)
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : TETTO_PREDEFINITO;
}
