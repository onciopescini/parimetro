// Endpoint della chat (Cloudflare Pages Function): POST /api/chat
//
// La chiave OpenRouter vive nei segreti del progetto Pages (OPENROUTER_API_KEY) e
// non esce mai da qui. I dati si leggono dagli stessi file statici del sito
// (binding ASSETS): niente database, niente altro da tenere acceso.
import { MODELLI_PREDEFINITI } from "../../lib/chat/llm";
import { MAX_DOMANDA } from "../../lib/chat/intento";
import { rispondi } from "../../lib/chat/rispondi";
import type { Contesto } from "../../lib/chat/tipi";
import { dentroIlTetto, leggiTetto, memoriaCloudflare, type DbTetto } from "../../lib/chat/tetto";
import { superaLimite } from "../../lib/limite";

// Tipi minimi: non servono @cloudflare/workers-types solo per questo file
interface Env {
  OPENROUTER_API_KEY?: string;
  /** Jev (TypeSafe): capisce la domanda scegliendo tra opzioni chiuse. Con la chiave e' lui il primo tentativo; senza, si usa il modello di sempre */
  JEV_API_KEY?: string;
  /** Solo prove in locale: un server finto al posto di Jev */
  JEV_URL?: string;
  /** Chiamate a Jev al giorno prima che si fermi (predefinito 3000: circa 0,15 $ al giorno). 0 = Jev spento */
  JEV_MAX_GIORNO?: string;
  /** Il database (D1): serve al contatore giornaliero. Senza, Jev resta spento: nel dubbio non si spende */
  DB?: DbTetto;
  /** Elenco di modelli separati da virgola, per cambiarli senza ripubblicare il codice */
  CHAT_MODELLI?: string;
  /** Solo prove in locale: un server finto al posto di OpenRouter */
  OPENROUTER_URL?: string;
  ASSETS: { fetch(req: Request): Promise<Response> };
}
interface Ctx {
  request: Request;
  env: Env;
}

/** Domande per indirizzo e per ora: i modelli gratuiti hanno un tetto giornaliero e va protetto. */
const LIMITE_ORARIO = 15;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Jev con le sue protezioni: cache di 24 ore e tetto giornaliero. Senza il contatore (nessun database) resta spento. */
function jevOpzioni(env: Env) {
  if (!env.JEV_API_KEY) return undefined;
  const db = env.DB;
  if (!db) {
    console.warn("jev spento: manca il database per il tetto giornaliero");
    return undefined;
  }
  const massimo = leggiTetto(env.JEV_MAX_GIORNO);
  return {
    chiave: env.JEV_API_KEY,
    url: env.JEV_URL,
    memoria: memoriaCloudflare(),
    puoChiamare: () => dentroIlTetto(db, "jev", massimo),
  };
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  // Solo dal nostro stesso sito: la chiave non deve servire a pagine altrui
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ errore: "Origine non consentita." }, 403);
  }
  if (!env.OPENROUTER_API_KEY && !env.JEV_API_KEY) {
    return json({ errore: "La chat non è ancora attiva su questo sito." }, 503);
  }
  if (await superaLimite(request, "chat", LIMITE_ORARIO)) {
    return json({ errore: "Hai fatto molte domande in poco tempo. Riprova tra un'ora." }, 429);
  }

  let corpo: { domanda?: unknown; contesto?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return json({ errore: "Richiesta non valida." }, 400);
  }
  if (typeof corpo.domanda !== "string" || corpo.domanda.length > MAX_DOMANDA * 2) {
    return json({ errore: `La domanda deve stare in ${MAX_DOMANDA} caratteri.` }, 400);
  }
  const c = (corpo.contesto ?? {}) as Record<string, unknown>;
  const contesto: Contesto = {
    istat: typeof c.istat === "string" && /^\d{6}$/.test(c.istat) ? c.istat : undefined,
    nome: typeof c.nome === "string" ? c.nome.slice(0, 80) : undefined,
    anno: typeof c.anno === "number" ? c.anno : undefined,
  };

  const base = new URL(request.url).origin;
  const cacheLetture = new Map<string, Promise<unknown>>();
  const leggi = (percorso: string) => {
    let p = cacheLetture.get(percorso);
    if (!p) {
      p = env.ASSETS.fetch(new Request(base + percorso)).then((r) => {
        if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
        return r.json();
      });
      cacheLetture.set(percorso, p);
    }
    return p;
  };

  // Senza chiave OpenRouter non ci sono modelli: la risposta e' il riassunto scritto dal codice, la domanda la capisce Jev
  const modelli = env.OPENROUTER_API_KEY
    ? (env.CHAT_MODELLI?.split(",").map((m) => m.trim()).filter(Boolean) ?? MODELLI_PREDEFINITI)
    : [];
  const esito = await rispondi(
    corpo.domanda,
    contesto,
    leggi,
    { chiave: env.OPENROUTER_API_KEY ?? "", modelli, referer: base, url: env.OPENROUTER_URL },
    jevOpzioni(env),
  );
  if ("errore" in esito) return json({ errore: esito.errore }, 502);
  return json({
    testo: esito.testo,
    narrato: esito.narrato,
    titolo: esito.risultato.titolo,
    colonne: esito.risultato.colonne,
    righe: esito.risultato.righe,
    grezze: esito.risultato.grezze,
    note: esito.risultato.note,
    apri: esito.risultato.apri,
    candidati: esito.risultato.candidati,
    via: esito.via,
  });
}

// GET: dice solo se la chat e' attiva, cosi' il sito mostra il pulsante soltanto quando funziona
export const onRequestGet = ({ env }: Ctx) => json({ attiva: !!(env.OPENROUTER_API_KEY || env.JEV_API_KEY) });

// Qualunque altro metodo: niente
export const onRequest = () => json({ errore: "Usa POST." }, 405);
