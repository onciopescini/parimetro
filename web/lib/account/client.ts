"use client";

// Lo stato dell'accesso nel browser: un piccolo archivio condiviso (niente provider da montare nel layout).
// Se il server dice che l'accesso non e' attivo (503) o non risponde, l'archivio resta "non disponibile" e
// l'interfaccia dell'accesso non compare affatto: il sito funziona come prima.
import { useSyncExternalStore } from "react";

export interface ComuneSalvato {
  istat: string;
  nome: string;
  avviso: boolean;
  salvato_il: number;
}
export interface CardCreata {
  id: number;
  istat: string;
  nome: string;
  tipo: string;
  anno: number;
  creata_il: number;
}
export interface DomandaSalvata {
  id: number;
  testo: string;
  fatta_il: number;
}

export interface StatoAccount {
  /** "attesa": non ho ancora chiesto; "assente": il sito non offre l'accesso; "fuori"/"dentro" */
  stato: "attesa" | "assente" | "fuori" | "dentro";
  email: string | null;
  comuni: ComuneSalvato[];
  card: CardCreata[];
  domande: DomandaSalvata[];
}

let stato: StatoAccount = { stato: "attesa", email: null, comuni: [], card: [], domande: [] };
const ascoltatori = new Set<() => void>();
const imposta = (s: Partial<StatoAccount>) => {
  stato = { ...stato, ...s };
  ascoltatori.forEach((f) => f());
};

async function chiama(percorso: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(percorso, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: "same-origin",
    });
    const tipo = r.headers.get("content-type") ?? "";
    const json = tipo.includes("json") ? ((await r.json()) as Record<string, unknown>) : {};
    return { ok: r.ok, status: r.status, json };
  } catch {
    return { ok: false, status: 0, json: { errore: "Non riesco a collegarmi. Controlla la connessione." } };
  }
}

let avviata = false;
/** Chiede al server chi sono. Si fa una volta sola, alla prima volta che l'interfaccia lo chiede. */
export async function carica(): Promise<void> {
  const r = await chiama("/api/me", "GET");
  if (!r.ok) return imposta({ stato: "assente" });
  const j = r.json as { utente: { email: string } | null; comuni?: ComuneSalvato[]; card?: CardCreata[]; domande?: DomandaSalvata[] };
  if (!j.utente) return imposta({ stato: "fuori", email: null, comuni: [], card: [], domande: [] });
  imposta({ stato: "dentro", email: j.utente.email, comuni: j.comuni ?? [], card: j.card ?? [], domande: j.domande ?? [] });
}

function subscribe(f: () => void) {
  ascoltatori.add(f);
  if (!avviata) {
    avviata = true;
    void carica();
  }
  return () => ascoltatori.delete(f);
}

export function useAccount(): StatoAccount {
  return useSyncExternalStore(
    subscribe,
    () => stato,
    () => stato,
  );
}

export type Esito = { ok: true } | { ok: false; errore: string };
const esito = (r: { ok: boolean; json: Record<string, unknown> }): Esito =>
  r.ok ? { ok: true } : { ok: false, errore: typeof r.json.errore === "string" ? r.json.errore : "Qualcosa non ha funzionato." };

export const account = {
  async richiediLink(email: string): Promise<Esito> {
    return esito(await chiama("/api/auth/richiedi", "POST", { email }));
  },
  async esci(): Promise<void> {
    await chiama("/api/auth/esci", "POST");
    imposta({ stato: "fuori", email: null, comuni: [], card: [], domande: [] });
  },
  eSalvato: (istat: string) => stato.comuni.some((c) => c.istat === istat),
  async salva(istat: string, nome: string, anno: number | null): Promise<Esito> {
    const r = await chiama("/api/me/comuni", "PUT", { istat, nome, anno });
    if (r.ok) imposta({ comuni: (r.json.comuni as ComuneSalvato[]) ?? stato.comuni });
    return esito(r);
  },
  async togli(istat: string): Promise<Esito> {
    const r = await chiama("/api/me/comuni", "DELETE", { istat });
    if (r.ok) imposta({ comuni: (r.json.comuni as ComuneSalvato[]) ?? stato.comuni });
    return esito(r);
  },
  async avviso(istat: string | null, attivo: boolean): Promise<Esito> {
    const r = await chiama("/api/me/avviso", "PUT", { istat, attivo });
    if (r.ok) imposta({ comuni: (r.json.comuni as ComuneSalvato[]) ?? stato.comuni });
    return esito(r);
  },
  /** Ricorda una card creata. Se non si e' entrati non fa niente. */
  async registraCard(istat: string, nome: string, tipo: string, anno: number): Promise<void> {
    if (stato.stato !== "dentro") return;
    const r = await chiama("/api/me/card", "POST", { istat, nome, tipo, anno });
    if (r.ok) void carica();
  },
  async registraDomanda(testo: string): Promise<void> {
    if (stato.stato !== "dentro") return;
    const r = await chiama("/api/me/domande", "POST", { testo });
    if (r.ok) void carica();
  },
  async eliminaCard(id: number | null): Promise<void> {
    const r = await chiama("/api/me/card", "DELETE", { id });
    if (r.ok) imposta({ card: (r.json.card as CardCreata[]) ?? [] });
  },
  async eliminaDomande(id: number | null): Promise<void> {
    const r = await chiama("/api/me/domande", "DELETE", { id });
    if (r.ok) imposta({ domande: (r.json.domande as DomandaSalvata[]) ?? [] });
  },
  async cancellaAccount(): Promise<Esito> {
    const r = await chiama("/api/me", "DELETE");
    if (r.ok) imposta({ stato: "fuori", email: null, comuni: [], card: [], domande: [] });
    return esito(r);
  },
};
