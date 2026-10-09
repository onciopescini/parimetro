// Protocollo MCP (JSON-RPC 2.0) scritto a mano: poche righe, nessuna dipendenza, adatto al limite di CPU
// delle Pages Functions. Supporta initialize, ping, tools/list e tools/call.
import { eseguiIntento } from "../chat/motore";
import type { Leggi } from "../chat/tipi";
import { ArgomentoNonValido, STRUMENTI } from "./strumenti";
import { testoRisultato } from "./risposta";

const VERSIONI = ["2025-06-18", "2025-03-26"];

const ISTRUZIONI =
  "Parimetro mostra i bilanci dei comuni italiani (spesa ed entrate di cassa dal SIOPE, " +
  "reddito IRPEF, PNRR, opere, appalti ANAC). Riporta i numeri con la fonte e l'anno, usa la " +
  "mediana quando serve, non dare giudizi sulle amministrazioni e ricorda che i dati sono di cassa.";

type Id = string | number | null;

class ErroreRpc extends Error {
  constructor(readonly codice: number, messaggio: string) {
    super(messaggio);
  }
}

const errore = (id: Id, codice: number, messaggio: string) => ({ jsonrpc: "2.0", id, error: { code: codice, message: messaggio } });

/** Risposta a un messaggio o a un lotto di messaggi. Le notifiche non hanno risposta: torna null. */
export async function gestisci(corpo: unknown, leggi: Leggi): Promise<unknown | null> {
  if (Array.isArray(corpo)) {
    if (corpo.length === 0) return errore(null, -32600, "Richiesta vuota.");
    const risposte = (await Promise.all(corpo.map((m) => gestisciUno(m, leggi)))).filter((r) => r !== null);
    return risposte.length ? risposte : null;
  }
  return gestisciUno(corpo, leggi);
}

async function gestisciUno(m: unknown, leggi: Leggi): Promise<unknown | null> {
  const msg = (m ?? {}) as Record<string, unknown>;
  const id: Id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return errore(id, -32600, "Richiesta non valida.");
  }
  const notifica = !("id" in msg);
  try {
    const risultato = await metodo(msg.method, (msg.params ?? {}) as Record<string, unknown>, leggi);
    return notifica ? null : { jsonrpc: "2.0", id, result: risultato };
  } catch (e) {
    if (notifica) return null;
    if (e instanceof ErroreRpc) return errore(id, e.codice, e.message);
    return errore(id, -32603, "Errore interno.");
  }
}

async function metodo(nome: string, p: Record<string, unknown>, leggi: Leggi): Promise<unknown> {
  switch (nome) {
    case "initialize": {
      const chiesta = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return {
        protocolVersion: VERSIONI.includes(chiesta) ? chiesta : VERSIONI[0],
        capabilities: { tools: {} },
        serverInfo: { name: "parimetro", title: "Parimetro", version: "1.0.0" },
        instructions: ISTRUZIONI,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: STRUMENTI.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case "tools/call":
      return chiamaStrumento(p, leggi);
    default:
      if (nome.startsWith("notifications/")) return {};
      throw new ErroreRpc(-32601, "Metodo non supportato.");
  }
}

async function chiamaStrumento(p: Record<string, unknown>, leggi: Leggi) {
  const strumento = STRUMENTI.find((s) => s.name === p.name);
  if (!strumento) throw new ErroreRpc(-32602, "Strumento sconosciuto.");
  const argomenti = (p.arguments ?? {}) as Record<string, unknown>;

  const testo = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });
  try {
    const intento = strumento.costruisci(argomenti);
    const risultato = await eseguiIntento(intento, leggi);
    return testo(testoRisultato(risultato));
  } catch (e) {
    if (e instanceof ArgomentoNonValido) return testo(e.message, true);
    return testo("I dati non sono disponibili in questo momento. Riprova più tardi.", true);
  }
}
