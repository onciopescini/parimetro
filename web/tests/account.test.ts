import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { route, leggiCookie, cookieSessione, type Ambiente } from "@/lib/account/api";
import { firma, firmaValida, impronta } from "@/lib/account/cripto";
import { messaggioAccesso, messaggioAvviso, inviaEmail } from "@/lib/account/email";
import * as S from "@/lib/account/servizio";
import { nomeComune, normalizzaEmail, testoDomanda } from "@/lib/account/validazione";

// node:sqlite va caricato cosi': il caricatore di Vitest non conosce i moduli "solo node:"
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** Un D1 finto fatto con un SQLite vero: stesso SQL, stessi vincoli. */
function nuovoDb(): S.D1 {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync("migrations/0001_account.sql", "utf-8"));
  const stmt = (sql: string, v: unknown[] = []): S.Stmt => ({
    bind: (...x) => stmt(sql, x),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(v as never[])).changes) } }),
    first: async <T,>() => ((sqlite.prepare(sql).get(...(v as never[])) as T | undefined) ?? null),
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...(v as never[])) as T[] }),
  });
  return { prepare: (sql: string) => stmt(sql) };
}

const T0 = 1_800_000_000;

describe("validazione", () => {
  it("riconosce le email e le porta in minuscolo", () => {
    expect(normalizzaEmail("  Mario.Rossi@Esempio.IT ")).toBe("mario.rossi@esempio.it");
    for (const x of ["", "a@b", "senza chiocciola.it", "a b@c.it", "<x>@c.it", 5, null, "a@@c.it"]) {
      expect(normalizzaEmail(x)).toBeNull();
    }
  });
  it("ripulisce nomi e domande", () => {
    expect(nomeComune("  <b>Roma</b>\n")).toBe("bRoma/b");
    expect(nomeComune("   ")).toBeNull();
    expect(testoDomanda("ok")).toBeNull();
    expect(testoDomanda("quanto spende Roma?\u0000")).toBe("quanto spende Roma?");
    expect(testoDomanda("x".repeat(900))?.length).toBe(400);
  });
});

describe("cripto", () => {
  it("l'impronta e' stabile e la firma si verifica", async () => {
    expect(await impronta("a")).toBe(await impronta("a"));
    expect(await impronta("a")).not.toBe(await impronta("b"));
    const f = await firma("disiscrivi:1", "segreto");
    expect(await firmaValida("disiscrivi:1", f, "segreto")).toBe(true);
    expect(await firmaValida("disiscrivi:2", f, "segreto")).toBe(false);
    expect(await firmaValida("disiscrivi:1", f, "altro")).toBe(false);
  });
});

describe("codici e sessioni", () => {
  let db: S.D1;
  beforeEach(() => {
    db = nuovoDb();
  });

  it("il codice vale una volta sola", async () => {
    const c = await S.creaCodiceAccesso(db, "a@b.it", T0);
    expect(await S.spendiCodice(db, c, T0 + 10)).toBe("a@b.it");
    expect(await S.spendiCodice(db, c, T0 + 11)).toBeNull();
  });
  it("il codice scade e uno inventato non vale", async () => {
    const c = await S.creaCodiceAccesso(db, "a@b.it", T0);
    expect(await S.spendiCodice(db, c, T0 + S.DURATA_CODICE_S + 1)).toBeNull();
    expect(await S.spendiCodice(db, "inventato", T0)).toBeNull();
  });
  it("nel database non c'e' mai il codice in chiaro", async () => {
    const c = await S.creaCodiceAccesso(db, "a@b.it", T0);
    const riga = await db.prepare("SELECT impronta FROM codici_accesso").first<{ impronta: string }>();
    expect(riga!.impronta).not.toBe(c);
    expect(riga!.impronta).toBe(await impronta(c));
  });
  it("la sessione si trova, scade e si chiude", async () => {
    const uid = await S.utentePerEmail(db, "a@b.it", T0);
    const t = await S.creaSessione(db, uid, T0);
    expect((await S.utenteDaSessione(db, t, T0 + 5))?.email).toBe("a@b.it");
    expect(await S.utenteDaSessione(db, t, T0 + S.DURATA_SESSIONE_S + 1)).toBeNull();
    await S.chiudiSessione(db, t);
    expect(await S.utenteDaSessione(db, t, T0 + 5)).toBeNull();
    expect(await S.utenteDaSessione(db, null, T0)).toBeNull();
  });
  it("la stessa email e' sempre lo stesso utente", async () => {
    expect(await S.utentePerEmail(db, "a@b.it", T0)).toBe(await S.utentePerEmail(db, "a@b.it", T0 + 9));
    expect(await S.utentePerEmail(db, "a@b.it", T0)).not.toBe(await S.utentePerEmail(db, "c@d.it", T0));
  });
  it("il limite scatta oltre il tetto e riparte all'ora dopo", async () => {
    for (let i = 0; i < 3; i++) expect(await S.superaLimite(db, "k", 3, T0)).toBe(false);
    expect(await S.superaLimite(db, "k", 3, T0)).toBe(true);
    expect(await S.superaLimite(db, "k", 3, T0 + 3700)).toBe(false);
  });
});

describe("cio' che si conserva", () => {
  let db: S.D1;
  let uid: string;
  beforeEach(async () => {
    db = nuovoDb();
    uid = await S.utentePerEmail(db, "a@b.it", T0);
  });

  it("salva, aggiorna il nome e toglie i comuni", async () => {
    await S.salvaComune(db, uid, "070006", "Campobasso", 2024, T0);
    await S.salvaComune(db, uid, "070006", "Campobasso (CB)", 2024, T0 + 1);
    const l = await S.elencaComuni(db, uid);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ istat: "070006", nome: "Campobasso (CB)", avviso: true });
    await S.togliComune(db, uid, "070006");
    expect(await S.elencaComuni(db, uid)).toHaveLength(0);
  });
  it("non si superano i comuni salvati, ma si puo' aggiornare uno gia' presente", async () => {
    for (let i = 0; i < 100; i++) await S.salvaComune(db, uid, String(100000 + i), `C${i}`, 2024, T0);
    expect(await S.salvaComune(db, uid, "999999", "Uno di troppo", 2024, T0)).toEqual({ ok: false, motivo: "troppi" });
    expect((await S.salvaComune(db, uid, "100000", "Rinominato", 2024, T0)).ok).toBe(true);
  });
  it("gli avvisi si accendono e spengono, per uno o per tutti", async () => {
    await S.salvaComune(db, uid, "000001", "A", 2024, T0);
    await S.salvaComune(db, uid, "000002", "B", 2024, T0);
    await S.impostaAvviso(db, uid, "000001", false);
    expect((await S.elencaComuni(db, uid)).map((c) => c.avviso).sort()).toEqual([false, true]);
    await S.impostaAvviso(db, uid, null, false);
    expect((await S.elencaComuni(db, uid)).every((c) => !c.avviso)).toBe(true);
  });
  it("lo storico delle card e delle domande ha un tetto", async () => {
    for (let i = 0; i < 60; i++) await S.registraCard(db, uid, { istat: "070006", nome: "Campobasso", tipo: "cento", anno: 2024 }, T0 + i);
    expect(await S.elencaCard(db, uid)).toHaveLength(S.MAX_CARD_STORICO);
    for (let i = 0; i < 120; i++) await S.registraDomanda(db, uid, `domanda ${i}`, T0 + i);
    const d = await S.elencaDomande(db, uid);
    expect(d).toHaveLength(S.MAX_DOMANDE_STORICO);
    expect(d[0].testo).toBe("domanda 119");
  });
  it("si cancella una domanda sola o tutte", async () => {
    await S.registraDomanda(db, uid, "prima", T0);
    await S.registraDomanda(db, uid, "seconda", T0 + 1);
    const [ultima] = await S.elencaDomande(db, uid);
    await S.eliminaDomande(db, uid, ultima.id);
    expect((await S.elencaDomande(db, uid)).map((x) => x.testo)).toEqual(["prima"]);
    await S.eliminaDomande(db, uid, null);
    expect(await S.elencaDomande(db, uid)).toHaveLength(0);
  });
  it("cancellare l'utente non lascia niente", async () => {
    const altro = await S.utentePerEmail(db, "c@d.it", T0);
    await S.salvaComune(db, uid, "070006", "Campobasso", 2024, T0);
    await S.registraCard(db, uid, { istat: "070006", nome: "Campobasso", tipo: "tre", anno: 2024 }, T0);
    await S.registraDomanda(db, uid, "una domanda", T0);
    await S.creaSessione(db, uid, T0);
    await S.creaCodiceAccesso(db, "a@b.it", T0);
    await S.salvaComune(db, altro, "070006", "Campobasso", 2024, T0);
    await S.cancellaUtente(db, uid);
    for (const t of ["utenti", "sessioni", "comuni_salvati", "card_create", "domande_chat", "codici_accesso"]) {
      const n = await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>();
      expect(n!.n, t).toBe(t === "utenti" || t === "comuni_salvati" ? 1 : 0); // resta solo l'altro utente
    }
  });
  it("l'esportazione contiene tutto cio' che si e' conservato", async () => {
    await S.salvaComune(db, uid, "070006", "Campobasso", 2024, T0);
    await S.registraDomanda(db, uid, "una domanda", T0);
    const e = await S.esportaTutto(db, { id: uid, email: "a@b.it" });
    expect(e.email).toBe("a@b.it");
    expect(e.comuni_salvati).toHaveLength(1);
    expect(e.domande_chat[0].testo).toBe("una domanda");
  });
});

describe("avvisi sui nuovi bilanci", () => {
  it("avvisa chi ha il comune salvato, una volta sola per anno, e rispetta lo spegnimento", async () => {
    const db = nuovoDb();
    const u1 = await S.utentePerEmail(db, "uno@b.it", T0);
    const u2 = await S.utentePerEmail(db, "due@b.it", T0);
    await S.salvaComune(db, u1, "000001", "A", 2023, T0); // ha gia' visto il 2023
    await S.salvaComune(db, u1, "000002", "B", 2024, T0); // ha gia' visto il 2024
    await S.salvaComune(db, u2, "000001", "A", 2023, T0);
    await S.impostaAvviso(db, u2, null, false);

    const l = await S.daAvvisare(db, 2024, ["000001", "000002", "000003"]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ email: "uno@b.it", comuni: [{ istat: "000001", nome: "A" }] });

    await S.segnaAvvisati(db, u1, ["000001"], 2024);
    expect(await S.daAvvisare(db, 2024, ["000001"])).toHaveLength(0);
    expect(await S.daAvvisare(db, 2025, ["000001"])).toHaveLength(1); // l'anno dopo si riparte
  });
  it("regge elenchi lunghi di comuni", async () => {
    const db = nuovoDb();
    const u = await S.utentePerEmail(db, "uno@b.it", T0);
    await S.salvaComune(db, u, "007000", "X", 2023, T0);
    const tutti = Array.from({ length: 7896 }, (_, i) => String(i).padStart(6, "0"));
    expect(await S.daAvvisare(db, 2024, tutti)).toHaveLength(1);
  });
});

describe("email", () => {
  it("il messaggio di accesso porta il link e dice cosa fare se non l'hai chiesto", () => {
    const m = messaggioAccesso("a@b.it", "https://x.it/api/auth/entra?c=abc", 15);
    expect(m.testo).toContain("https://x.it/api/auth/entra?c=abc");
    expect(m.testo).toContain("ignora questa email");
    expect(m.html).toContain("https://x.it/api/auth/entra?c=abc");
  });
  it("l'avviso elenca i comuni, ha il link per non riceverne piu' e non fa il rumoroso", () => {
    const m = messaggioAvviso("a@b.it", [{ nome: "Sant'Agata <b>", istat: "001234", anno: 2024 }], "https://x.it", "https://x.it/api/avvisi/disiscrivi?u=1&f=2");
    expect(m.testo).toContain("https://x.it/comune/001234");
    expect(m.testo).toContain("disiscrivi");
    expect(m.html).not.toContain("<b>"); // il nome e' ripulito
    expect(m.oggetto + m.testo).not.toMatch(/!|ATTENZIONE|urgente/i);
  });
  it("senza fornitore non invia e lo dice; in prova scrive nel log", async () => {
    const m = messaggioAccesso("a@b.it", "https://x.it", 15);
    expect((await inviaEmail({}, m)).ok).toBe(false);
    const log: string[] = [];
    expect((await inviaEmail({ ACCESSO_PROVA: "1" }, m, (s) => log.push(s))).ok).toBe(true);
    expect(log[0]).toContain("a@b.it");
  });
});

// ------------------------------------------------------------------ le rotte, dall'inizio alla fine
describe("rotte", () => {
  const ORIGINE = "https://parimetro.it";
  let env: Ambiente;
  let posta: { to: string; subject: string; text: string }[];

  const rich = (percorso: string, init: RequestInit & { cookie?: string; senzaOrigine?: boolean; origine?: string } = {}) => {
    const { cookie, senzaOrigine, origine, ...resto } = init;
    const h = new Headers(resto.headers);
    if (cookie) h.set("Cookie", cookie);
    if (!senzaOrigine && (resto.method ?? "GET") !== "GET") h.set("Origin", origine ?? ORIGINE);
    if (resto.body && !h.has("Content-Type")) h.set("Content-Type", "application/json");
    return new Request(ORIGINE + percorso, { ...resto, headers: h });
  };
  const corpo = (o: unknown) => JSON.stringify(o);
  const cookieDa = (r: Response) => (r.headers.get("Set-Cookie") ?? "").split(";")[0];

  /** Fa tutto il giro: chiede il link, lo apre, conferma. Restituisce il cookie di sessione. */
  async function entra(email: string): Promise<string> {
    const r = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email }) }), env, T0);
    expect(r.status).toBe(200);
    const m = posta[posta.length - 1];
    const link = /https:\/\/parimetro\.it\/api\/auth\/entra\?c=[\w-]+/.exec(m.text)![0];
    const dentro = await route(rich(link.replace(ORIGINE, ""), { method: "POST" }), env, T0 + 60);
    expect(dentro.status).toBe(303);
    return cookieDa(dentro);
  }

  beforeEach(() => {
    posta = [];
    env = {
      DB: nuovoDb(),
      SEGRETO_ACCESSO: "segreto-di-prova",
      ADMIN_TOKEN: "token-admin",
      EMAIL: { send: async (m) => void posta.push(m) },
    };
  });

  it("senza database o senza servizio email l'accesso non e' attivo (e l'interfaccia resta nascosta)", async () => {
    expect((await route(rich("/api/me"), {}, T0)).status).toBe(503);
    expect((await route(rich("/api/me"), { DB: env.DB }, T0)).status).toBe(503); // database ma niente email
    expect((await route(rich("/api/me"), { DB: env.DB, RESEND_API_KEY: "x" }, T0)).status).toBe(200);
  });

  it("il giro completo: link, conferma, sessione, uscita", async () => {
    const cookie = await entra("Mario@Esempio.it");
    expect(posta[0].to).toBe("mario@esempio.it");
    expect(posta[0].subject).toContain("entrare");

    const me = await (await route(rich("/api/me", { cookie }), env, T0 + 100)).json();
    expect(me.utente.email).toBe("mario@esempio.it");

    const fuori = await route(rich("/api/auth/esci", { method: "POST", cookie }), env, T0 + 200);
    expect(fuori.headers.get("Set-Cookie")).toContain("Max-Age=0");
    const dopo = await (await route(rich("/api/me", { cookie }), env, T0 + 300)).json();
    expect(dopo.utente).toBeNull();
  });
  it("aprire il link (GET) non lo spende: serve la conferma", async () => {
    await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "a@b.it" }) }), env, T0);
    const link = /\/api\/auth\/entra\?c=[\w-]+/.exec(posta[0].text)![0];
    const g = await route(rich(link), env, T0 + 5); // come fa un programma che controlla le email
    expect(g.status).toBe(200);
    expect(await g.text()).toContain("<form");
    const p = await route(rich(link, { method: "POST" }), env, T0 + 10);
    expect(p.status).toBe(303);
    const ancora = await route(rich(link, { method: "POST" }), env, T0 + 11);
    expect(ancora.status).toBe(400);
  });
  it("la risposta e' la stessa per un indirizzo nuovo e per uno gia' registrato", async () => {
    const a = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "nuovo@b.it" }) }), env, T0);
    await entra("vecchio@b.it");
    const b = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "vecchio@b.it" }) }), env, T0 + 500);
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });
  it("email non valida: errore chiaro, nessuna email mandata", async () => {
    const r = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "nonvalida" }) }), env, T0);
    expect(r.status).toBe(400);
    expect(posta).toHaveLength(0);
  });
  it("troppe richieste per la stessa email: si ferma", async () => {
    let ultimo = 200;
    for (let i = 0; i < S.LIMITE_EMAIL_ORA + 2; i++) {
      ultimo = (await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "a@b.it" }) }), env, T0 + i)).status;
    }
    expect(ultimo).toBe(429);
    expect(posta.length).toBe(S.LIMITE_EMAIL_ORA);
  });
  it("se l'email non parte lo dice, senza far credere che sia partita", async () => {
    env.EMAIL = { send: async () => { throw new Error("giu'"); } };
    const r = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "a@b.it" }) }), env, T0);
    expect(r.status).toBe(503);
  });
  it("le richieste da un altro sito sono rifiutate", async () => {
    const r = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "a@b.it" }), origine: "https://cattivo.example" }), env, T0);
    expect(r.status).toBe(403);
    const senza = await route(rich("/api/auth/richiedi", { method: "POST", body: corpo({ email: "a@b.it" }), senzaOrigine: true }), env, T0);
    expect(senza.status).toBe(403);
  });
  it("senza sessione lo spazio personale e' chiuso", async () => {
    const r = await route(rich("/api/me/comuni", { method: "PUT", body: corpo({ istat: "070006", nome: "Campobasso" }) }), env, T0);
    expect(r.status).toBe(401);
    const m = await (await route(rich("/api/me"), env, T0)).json();
    expect(m.utente).toBeNull();
  });

  it("salvare comuni, card e domande, vederli e cancellarli", async () => {
    const cookie = await entra("a@b.it");
    const put = await route(rich("/api/me/comuni", { method: "PUT", cookie, body: corpo({ istat: "070006", nome: "Campobasso", anno: 2024 }) }), env, T0 + 100);
    expect((await put.json()).comuni).toHaveLength(1);
    expect((await route(rich("/api/me/comuni", { method: "PUT", cookie, body: corpo({ istat: "12", nome: "x" }) }), env, T0 + 100)).status).toBe(400);

    await route(rich("/api/me/card", { method: "POST", cookie, body: corpo({ istat: "070006", nome: "Campobasso", tipo: "cento", anno: 2024 }) }), env, T0 + 110);
    expect((await route(rich("/api/me/card", { method: "POST", cookie, body: corpo({ istat: "070006", nome: "C", tipo: "domanda", anno: 2024 }) }), env, T0 + 110)).status).toBe(400);
    await route(rich("/api/me/domande", { method: "POST", cookie, body: corpo({ testo: "Quanto spende Roma per i rifiuti?" }) }), env, T0 + 120);

    const me = await (await route(rich("/api/me", { cookie }), env, T0 + 130)).json();
    expect(me.comuni).toHaveLength(1);
    expect(me.card).toHaveLength(1);
    expect(me.domande[0].testo).toContain("Roma");

    const sp = await route(rich("/api/me/avviso", { method: "PUT", cookie, body: corpo({ attivo: false }) }), env, T0 + 140);
    expect((await sp.json()).comuni[0].avviso).toBe(false);

    await route(rich("/api/me/domande", { method: "DELETE", cookie, body: corpo({}) }), env, T0 + 150);
    await route(rich("/api/me/comuni", { method: "DELETE", cookie, body: corpo({ istat: "070006" }) }), env, T0 + 150);
    const dopo = await (await route(rich("/api/me", { cookie }), env, T0 + 160)).json();
    expect(dopo.domande).toHaveLength(0);
    expect(dopo.comuni).toHaveLength(0);
  });
  it("ognuno vede solo le sue cose", async () => {
    const a = await entra("a@b.it");
    const b = await entra("c@d.it");
    await route(rich("/api/me/domande", { method: "POST", cookie: a, body: corpo({ testo: "domanda di A" }) }), env, T0 + 100);
    const visteDaB = await (await route(rich("/api/me", { cookie: b }), env, T0 + 110)).json();
    expect(visteDaB.domande).toHaveLength(0);
  });
  it("si scaricano i propri dati e si cancella l'account", async () => {
    const cookie = await entra("a@b.it");
    await route(rich("/api/me/comuni", { method: "PUT", cookie, body: corpo({ istat: "070006", nome: "Campobasso" }) }), env, T0 + 100);
    const e = await route(rich("/api/me/esporta", { cookie }), env, T0 + 110);
    expect(e.headers.get("Content-Disposition")).toContain("attachment");
    expect((await e.json()).comuni_salvati).toHaveLength(1);

    const del = await route(rich("/api/me", { method: "DELETE", cookie }), env, T0 + 120);
    expect(del.status).toBe(200);
    expect((await (await route(rich("/api/me", { cookie }), env, T0 + 130)).json()).utente).toBeNull();
    // e rientrando con la stessa email si riparte da zero
    const di_nuovo = await entra("a@b.it");
    expect((await (await route(rich("/api/me", { cookie: di_nuovo }), env, T0 + 140)).json()).comuni).toHaveLength(0);
  });

  it("l'invio degli avvisi vuole il token e non scrive due volte", async () => {
    const cookie = await entra("a@b.it");
    await route(rich("/api/me/comuni", { method: "PUT", cookie, body: corpo({ istat: "070006", nome: "Campobasso", anno: 2023 }) }), env, T0 + 100);
    posta.length = 0;
    const invia = (token?: string, extra: object = {}) =>
      route(
        rich("/api/avvisi/invia", {
          method: "POST",
          senzaOrigine: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: corpo({ anno: 2024, istat: ["070006", "001001"], ...extra }),
        }),
        env,
        T0 + 200,
      );
    expect((await invia()).status).toBe(401);
    expect((await invia("sbagliato")).status).toBe(401);
    expect(posta).toHaveLength(0);

    const prova = await (await invia("token-admin", { prova: true })).json();
    expect(prova).toMatchObject({ destinatari: 1, inviati: 0 });
    expect(posta).toHaveLength(0);

    const vero = await (await invia("token-admin")).json();
    expect(vero).toMatchObject({ destinatari: 1, inviati: 1, falliti: 0 });
    expect(posta[0].to).toBe("a@b.it");
    expect(posta[0].text).toContain("Campobasso");
    expect(posta[0].text).toContain("/api/avvisi/disiscrivi?u=");

    const secondo = await (await invia("token-admin")).json();
    expect(secondo.destinatari).toBe(0);
    expect(posta).toHaveLength(1);
  });
  it("il link nell'avviso spegne gli avvisi, e solo se la firma e' buona", async () => {
    const cookie = await entra("a@b.it");
    await route(rich("/api/me/comuni", { method: "PUT", cookie, body: corpo({ istat: "070006", nome: "Campobasso", anno: 2023 }) }), env, T0 + 100);
    posta.length = 0;
    await route(rich("/api/avvisi/invia", { method: "POST", senzaOrigine: true, headers: { Authorization: "Bearer token-admin" }, body: corpo({ anno: 2024, istat: ["070006"] }) }), env, T0 + 200);
    const link = /\/api\/avvisi\/disiscrivi\?u=[^\s&]+&f=[^\s]+/.exec(posta[0].text)![0];

    const manomesso = link.slice(0, -1) + (link.endsWith("A") ? "B" : "A");
    const rotto = await route(rich(manomesso), env, T0 + 300);
    expect(rotto.status).toBe(400);

    const g = await route(rich(link), env, T0 + 300); // aprire il link non basta
    expect(await g.text()).toContain("<form");
    expect((await (await route(rich("/api/me", { cookie }), env, T0 + 301)).json()).comuni[0].avviso).toBe(true);

    const p = await route(rich(link, { method: "POST" }), env, T0 + 310);
    expect(p.status).toBe(200);
    expect((await (await route(rich("/api/me", { cookie }), env, T0 + 320)).json()).comuni[0].avviso).toBe(false);
  });

  it("il cookie e' protetto e cambia nome su https", () => {
    const https = cookieSessione(new Request("https://parimetro.it/"), "tok");
    expect(https).toContain("__Host-parimetro_sessione=tok");
    expect(https).toMatch(/HttpOnly/);
    expect(https).toMatch(/Secure/);
    expect(https).toMatch(/SameSite=Lax/);
    const http = cookieSessione(new Request("http://localhost:8788/"), "tok");
    expect(http).not.toMatch(/Secure/);
    const r = new Request("https://parimetro.it/", { headers: { Cookie: "a=1; __Host-parimetro_sessione=abc; b=2" } });
    expect(leggiCookie(r)).toBe("abc");
  });
});
