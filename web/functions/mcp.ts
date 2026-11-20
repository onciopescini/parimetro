// Server MCP di sola lettura: POST /mcp (JSON-RPC). Gli assistenti (Claude, ChatGPT...) lo collegano
// come connettore e fanno le domande con il proprio account: qui non gira nessun modello.
// Legge gli stessi file statici del sito (binding ASSETS): niente database, niente chiavi.
import { gestisci } from "../lib/mcp/protocollo";
import type { Leggi } from "../lib/chat/tipi";
import { superaLimite } from "../lib/limite";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}
interface Ctx {
  request: Request;
  env: Env;
}

/** Richieste per indirizzo e per ora: un'assistente puo' farne qualche decina per domanda */
const LIMITE_ORARIO = 300;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  if (await superaLimite(request, "mcp", LIMITE_ORARIO)) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Troppe richieste da questo indirizzo. Riprova tra un'ora." } }, 429);
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON non valido." } }, 400);
  }

  const base = new URL(request.url).origin;
  // Ogni file si legge una volta sola per richiesta, anche se piu' messaggi del lotto lo chiedono
  const letture = new Map<string, Promise<unknown>>();
  const leggi: Leggi = (percorso) => {
    let p = letture.get(percorso);
    if (!p) {
      p = env.ASSETS.fetch(new Request(base + percorso)).then((r) => {
        if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
        return r.json();
      });
      letture.set(percorso, p);
    }
    return p;
  };

  const risposta = await gestisci(corpo, leggi);
  // Solo notifiche: nessuna risposta da dare
  if (risposta === null) return new Response(null, { status: 202 });
  return json(risposta);
}

// Il server non apre uno stream di eventi: il metodo GET non e' supportato
export function onRequestGet(): Response {
  return new Response("Questo indirizzo accetta solo richieste POST in formato JSON-RPC (MCP).", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
