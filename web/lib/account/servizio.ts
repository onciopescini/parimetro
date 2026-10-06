// Tutta la logica dell'accesso e di cio' che si conserva, sopra un database D1 (SQLite). Nessun accesso a rete o
// a Request qui dentro: i dati entrano come argomenti, cosi' si prova tutto con un SQLite vero in memoria.
import { codiceCasuale, impronta } from "./cripto";
import { MAX_COMUNI_SALVATI } from "./validazione";

export interface Stmt {
  bind(...v: unknown[]): Stmt;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1 {
  prepare(sql: string): Stmt;
}

export const DURATA_CODICE_S = 15 * 60;
export const DURATA_SESSIONE_S = 30 * 24 * 3600;
export const LIMITE_EMAIL_ORA = 5;
export const LIMITE_IP_ORA = 20;
export const MAX_CARD_STORICO = 50;
export const MAX_DOMANDE_STORICO = 100;

const modifiche = (r: { meta?: { changes?: number } }) => r.meta?.changes ?? 0;

// ------------------------------------------------------------------ limiti
/** Conta una richiesta nella finestra di un'ora; vero se il tetto e' superato (la richiesta non va servita). */
export async function superaLimite(db: D1, chiave: string, max: number, ora: number): Promise<boolean> {
  const finestra = Math.floor(ora / 3600);
  await db
    .prepare("INSERT INTO limiti (chiave, finestra, n) VALUES (?, ?, 1) ON CONFLICT (chiave, finestra) DO UPDATE SET n = n + 1")
    .bind(chiave, finestra)
    .run();
  const r = await db.prepare("SELECT n FROM limiti WHERE chiave = ? AND finestra = ?").bind(chiave, finestra).first<{ n: number }>();
  return (r?.n ?? 0) > max;
}

/** Toglie il vecchio: codici scaduti, sessioni scadute, contatori di ore passate. */
export async function pulisci(db: D1, ora: number): Promise<void> {
  await db.prepare("DELETE FROM codici_accesso WHERE scade_il < ?").bind(ora - 3600).run();
  await db.prepare("DELETE FROM sessioni WHERE scade_il < ?").bind(ora).run();
  await db.prepare("DELETE FROM limiti WHERE finestra < ?").bind(Math.floor(ora / 3600) - 2).run();
}

// ------------------------------------------------------------------ codici di accesso e sessioni
/** Crea il codice da mettere nel link. In chiaro esiste solo qui e nell'email. */
export async function creaCodiceAccesso(db: D1, email: string, ora: number): Promise<string> {
  const codice = codiceCasuale();
  await db
    .prepare("INSERT INTO codici_accesso (impronta, email, scade_il, usato) VALUES (?, ?, ?, 0)")
    .bind(await impronta(codice), email, ora + DURATA_CODICE_S)
    .run();
  return codice;
}

/** Spende il codice (una volta sola, finche' non scade). Restituisce l'email, o null se non vale. */
export async function spendiCodice(db: D1, codice: string, ora: number): Promise<string | null> {
  const imp = await impronta(codice);
  const r = await db
    .prepare("UPDATE codici_accesso SET usato = 1 WHERE impronta = ? AND usato = 0 AND scade_il > ?")
    .bind(imp, ora)
    .run();
  if (modifiche(r) !== 1) return null;
  const riga = await db.prepare("SELECT email FROM codici_accesso WHERE impronta = ?").bind(imp).first<{ email: string }>();
  return riga?.email ?? null;
}

/** L'utente con questa email; se non c'e' lo crea. */
export async function utentePerEmail(db: D1, email: string, ora: number): Promise<string> {
  const esiste = await db.prepare("SELECT id FROM utenti WHERE email = ?").bind(email).first<{ id: string }>();
  if (esiste) {
    await db.prepare("UPDATE utenti SET ultimo_accesso = ? WHERE id = ?").bind(ora, esiste.id).run();
    return esiste.id;
  }
  const id = codiceCasuale(16);
  await db.prepare("INSERT INTO utenti (id, email, creato_il, ultimo_accesso) VALUES (?, ?, ?, ?)").bind(id, email, ora, ora).run();
  return id;
}

export async function creaSessione(db: D1, utenteId: string, ora: number): Promise<string> {
  const token = codiceCasuale();
  await db
    .prepare("INSERT INTO sessioni (impronta, utente_id, scade_il) VALUES (?, ?, ?)")
    .bind(await impronta(token), utenteId, ora + DURATA_SESSIONE_S)
    .run();
  return token;
}

export interface Utente {
  id: string;
  email: string;
}

export async function utenteDaSessione(db: D1, token: string | null, ora: number): Promise<Utente | null> {
  if (!token) return null;
  return db
    .prepare(
      "SELECT u.id AS id, u.email AS email FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.impronta = ? AND s.scade_il > ?",
    )
    .bind(await impronta(token), ora)
    .first<Utente>();
}

export async function chiudiSessione(db: D1, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessioni WHERE impronta = ?").bind(await impronta(token)).run();
}

// ------------------------------------------------------------------ comuni salvati
export interface ComuneSalvato {
  istat: string;
  nome: string;
  avviso: boolean;
  salvato_il: number;
}

export async function elencaComuni(db: D1, uid: string): Promise<ComuneSalvato[]> {
  const r = await db
    .prepare("SELECT istat, nome, avviso, salvato_il FROM comuni_salvati WHERE utente_id = ? ORDER BY salvato_il DESC")
    .bind(uid)
    .all<{ istat: string; nome: string; avviso: number; salvato_il: number }>();
  return r.results.map((x) => ({ ...x, avviso: x.avviso === 1 }));
}

/** Salva un comune. `anno` e' l'ultimo anno di dati che la persona ha gia' visto: l'avviso scatta solo per anni successivi. */
export async function salvaComune(
  db: D1,
  uid: string,
  istat: string,
  nome: string,
  anno: number | null,
  ora: number,
): Promise<{ ok: true } | { ok: false; motivo: "troppi" }> {
  const n = await db.prepare("SELECT COUNT(*) AS n FROM comuni_salvati WHERE utente_id = ?").bind(uid).first<{ n: number }>();
  const gia = await db.prepare("SELECT 1 AS x FROM comuni_salvati WHERE utente_id = ? AND istat = ?").bind(uid, istat).first();
  if (!gia && (n?.n ?? 0) >= MAX_COMUNI_SALVATI) return { ok: false, motivo: "troppi" };
  await db
    .prepare(
      "INSERT INTO comuni_salvati (utente_id, istat, nome, avviso, ultimo_anno_avvisato, salvato_il) VALUES (?, ?, ?, 1, ?, ?) " +
        "ON CONFLICT (utente_id, istat) DO UPDATE SET nome = excluded.nome",
    )
    .bind(uid, istat, nome, anno, ora)
    .run();
  return { ok: true };
}

export async function togliComune(db: D1, uid: string, istat: string): Promise<void> {
  await db.prepare("DELETE FROM comuni_salvati WHERE utente_id = ? AND istat = ?").bind(uid, istat).run();
}

export async function impostaAvviso(db: D1, uid: string, istat: string | null, attivo: boolean): Promise<void> {
  if (istat) {
    await db.prepare("UPDATE comuni_salvati SET avviso = ? WHERE utente_id = ? AND istat = ?").bind(attivo ? 1 : 0, uid, istat).run();
  } else {
    await db.prepare("UPDATE comuni_salvati SET avviso = ? WHERE utente_id = ?").bind(attivo ? 1 : 0, uid).run();
  }
}

// ------------------------------------------------------------------ card create e domande
export interface CardCreata {
  id: number;
  istat: string;
  nome: string;
  tipo: string;
  anno: number;
  creata_il: number;
}

export async function registraCard(db: D1, uid: string, c: Omit<CardCreata, "id" | "creata_il">, ora: number): Promise<void> {
  await db
    .prepare("INSERT INTO card_create (utente_id, istat, nome, tipo, anno, creata_il) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid, c.istat, c.nome, c.tipo, c.anno, ora)
    .run();
  // Si tengono solo le ultime: lo storico non deve crescere senza fine
  await db
    .prepare(
      "DELETE FROM card_create WHERE utente_id = ? AND id NOT IN (SELECT id FROM card_create WHERE utente_id = ? ORDER BY creata_il DESC, id DESC LIMIT ?)",
    )
    .bind(uid, uid, MAX_CARD_STORICO)
    .run();
}

export async function elencaCard(db: D1, uid: string): Promise<CardCreata[]> {
  const r = await db
    .prepare("SELECT id, istat, nome, tipo, anno, creata_il FROM card_create WHERE utente_id = ? ORDER BY creata_il DESC, id DESC")
    .bind(uid)
    .all<CardCreata>();
  return r.results;
}

export async function eliminaCard(db: D1, uid: string, id: number | null): Promise<void> {
  if (id == null) await db.prepare("DELETE FROM card_create WHERE utente_id = ?").bind(uid).run();
  else await db.prepare("DELETE FROM card_create WHERE utente_id = ? AND id = ?").bind(uid, id).run();
}

export interface DomandaSalvata {
  id: number;
  testo: string;
  fatta_il: number;
}

export async function registraDomanda(db: D1, uid: string, testo: string, ora: number): Promise<void> {
  await db.prepare("INSERT INTO domande_chat (utente_id, testo, fatta_il) VALUES (?, ?, ?)").bind(uid, testo, ora).run();
  await db
    .prepare(
      "DELETE FROM domande_chat WHERE utente_id = ? AND id NOT IN (SELECT id FROM domande_chat WHERE utente_id = ? ORDER BY fatta_il DESC, id DESC LIMIT ?)",
    )
    .bind(uid, uid, MAX_DOMANDE_STORICO)
    .run();
}

export async function elencaDomande(db: D1, uid: string): Promise<DomandaSalvata[]> {
  const r = await db
    .prepare("SELECT id, testo, fatta_il FROM domande_chat WHERE utente_id = ? ORDER BY fatta_il DESC, id DESC")
    .bind(uid)
    .all<DomandaSalvata>();
  return r.results;
}

export async function eliminaDomande(db: D1, uid: string, id: number | null): Promise<void> {
  if (id == null) await db.prepare("DELETE FROM domande_chat WHERE utente_id = ?").bind(uid).run();
  else await db.prepare("DELETE FROM domande_chat WHERE utente_id = ? AND id = ?").bind(uid, id).run();
}

// ------------------------------------------------------------------ i miei dati: esporta e cancella
export async function esportaTutto(db: D1, utente: Utente) {
  const creato = await db.prepare("SELECT creato_il, ultimo_accesso FROM utenti WHERE id = ?").bind(utente.id).first();
  return {
    email: utente.email,
    ...creato,
    comuni_salvati: await elencaComuni(db, utente.id),
    card_create: await elencaCard(db, utente.id),
    domande_chat: await elencaDomande(db, utente.id),
  };
}

/** Cancella l'utente e tutto cio' che lo riguarda. Si fa a mano tabella per tabella, senza fidarsi del solo CASCADE. */
export async function cancellaUtente(db: D1, uid: string): Promise<void> {
  for (const t of ["sessioni", "comuni_salvati", "card_create", "domande_chat"]) {
    await db.prepare(`DELETE FROM ${t} WHERE utente_id = ?`).bind(uid).run();
  }
  const u = await db.prepare("SELECT email FROM utenti WHERE id = ?").bind(uid).first<{ email: string }>();
  if (u) await db.prepare("DELETE FROM codici_accesso WHERE email = ?").bind(u.email).run();
  await db.prepare("DELETE FROM utenti WHERE id = ?").bind(uid).run();
}

// ------------------------------------------------------------------ avvisi sui nuovi bilanci
export interface DaAvvisare {
  utenteId: string;
  email: string;
  comuni: { istat: string; nome: string }[];
}

/**
 * Chi va avvisato: i comuni salvati con l'avviso acceso, che hanno dati per `anno` e che non sono gia' stati
 * avvisati per quell'anno o uno piu' recente. `istatConDati` arriva da chi pubblica i dati.
 */
export async function daAvvisare(db: D1, anno: number, istatConDati: string[]): Promise<DaAvvisare[]> {
  const per: Map<string, DaAvvisare> = new Map();
  for (let i = 0; i < istatConDati.length; i += 80) {
    const gruppo = istatConDati.slice(i, i + 80);
    const marche = gruppo.map(() => "?").join(",");
    const r = await db
      .prepare(
        `SELECT s.utente_id AS utente_id, u.email AS email, s.istat AS istat, s.nome AS nome FROM comuni_salvati s ` +
          `JOIN utenti u ON u.id = s.utente_id WHERE s.avviso = 1 AND s.istat IN (${marche}) ` +
          `AND (s.ultimo_anno_avvisato IS NULL OR s.ultimo_anno_avvisato < ?)`,
      )
      .bind(...gruppo, anno)
      .all<{ utente_id: string; email: string; istat: string; nome: string }>();
    for (const x of r.results) {
      const e = per.get(x.utente_id) ?? { utenteId: x.utente_id, email: x.email, comuni: [] };
      e.comuni.push({ istat: x.istat, nome: x.nome });
      per.set(x.utente_id, e);
    }
  }
  return [...per.values()];
}

export async function segnaAvvisati(db: D1, uid: string, istat: string[], anno: number): Promise<void> {
  for (const i of istat) {
    await db
      .prepare("UPDATE comuni_salvati SET ultimo_anno_avvisato = ? WHERE utente_id = ? AND istat = ?")
      .bind(anno, uid, i)
      .run();
  }
}
