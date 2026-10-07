import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { chiediJev, riattivaJev, type DomandaJev, type RisposteJev } from "../lib/chat/jev";
import { intentoConJev, preparaRiferimenti } from "../lib/chat/intentoJev";
import { chiaveCache, dentroIlTetto, giornoUtc, leggiTetto, TETTO_PREDEFINITO, type DbTetto, type MemoriaJev } from "../lib/chat/tetto";
import type { VoceIndice } from "../lib/dati";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** Un D1 finto fatto con un SQLite vero, con la tabella del tetto. */
function nuovoDb(): DbTetto {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0002_tetto_giornaliero.sql", "utf-8"));
  const stmt = (sql: string, v: unknown[] = []): ReturnType<DbTetto["prepare"]> => ({
    bind: (...x) => stmt(sql, x),
    run: async () => sqlite.prepare(sql).run(...(v as never[])),
    first: async <T,>() => ((sqlite.prepare(sql).get(...(v as never[])) as T | undefined) ?? null),
  });
  return { prepare: (sql: string) => stmt(sql) };
}

function memoria(): MemoriaJev & { dati: Map<string, RisposteJev> } {
  const dati = new Map<string, RisposteJev>();
  return { dati, leggi: async (k) => dati.get(k) ?? null, scrivi: async (k, r) => void dati.set(k, r) };
}

const DOMANDE: Record<string, DomandaJev> = { q: { type: "choice", instructions: "?", criteria: { a: "x", b: "y" } } };
const RISPOSTA = { q: { type: "choice", choice: "a", confidence: 0.9, probabilities: { a: 0.9, b: 0.1 } } };

function fetcherContato(status = 200) {
  const c = { n: 0 };
  const fetcher = (async () => {
    c.n++;
    return new Response(JSON.stringify({ answers: RISPOSTA }), { status });
  }) as typeof fetch;
  return { fetcher, c };
}

beforeEach(() => riattivaJev());

describe("il tetto giornaliero", () => {
  it("lascia passare fino al massimo e poi ferma", async () => {
    const db = nuovoDb();
    const esiti: boolean[] = [];
    for (let i = 0; i < 5; i++) esiti.push(await dentroIlTetto(db, "jev", 3, 1_800_000_000_000));
    expect(esiti).toEqual([true, true, true, false, false]);
  });
  it("ricomincia il giorno dopo, e ogni voce ha il suo contatore", async () => {
    const db = nuovoDb();
    const ieri = 1_800_000_000_000;
    for (let i = 0; i < 3; i++) await dentroIlTetto(db, "jev", 2, ieri);
    expect(await dentroIlTetto(db, "jev", 2, ieri)).toBe(false);
    expect(await dentroIlTetto(db, "jev", 2, ieri + 86_400_000)).toBe(true);
    expect(await dentroIlTetto(db, "altro", 2, ieri)).toBe(true);
    expect(giornoUtc(ieri + 86_400_000) - giornoUtc(ieri)).toBe(1);
  });
  it("con tetto zero Jev e' spento", async () => {
    expect(await dentroIlTetto(nuovoDb(), "jev", 0)).toBe(false);
  });
  it("se l'archivio non risponde nel dubbio non si spende", async () => {
    const rotto: DbTetto = {
      prepare: () => {
        throw new Error("giu'");
      },
    };
    expect(await dentroIlTetto(rotto, "jev", 100)).toBe(false);
  });
  it("il tetto si legge da una variabile; se e' sbagliata vale quello predefinito", () => {
    expect(leggiTetto("500")).toBe(500);
    expect(leggiTetto("0")).toBe(0);
    for (const x of [undefined, "", "abc", "-5", "1.5"]) expect(leggiTetto(x)).toBe(TETTO_PREDEFINITO);
  });
});

describe("la cache delle risposte di Jev", () => {
  it("la stessa richiesta si paga una volta sola", async () => {
    const { fetcher, c } = fetcherContato();
    const m = memoria();
    const o = { chiave: "x", fetcher, memoria: m };
    expect(await chiediJev("stato uguale", DOMANDE, o)).toEqual(RISPOSTA);
    expect(await chiediJev("stato uguale", DOMANDE, o)).toEqual(RISPOSTA);
    expect(c.n).toBe(1);
  });
  it("un testo diverso, o domande diverse, e' una richiesta diversa", async () => {
    const { fetcher, c } = fetcherContato();
    const o = { chiave: "x", fetcher, memoria: memoria() };
    await chiediJev("uno", DOMANDE, o);
    await chiediJev("due", DOMANDE, o);
    await chiediJev("uno", { q: { ...DOMANDE.q, instructions: "un'altra domanda" } }, o);
    expect(c.n).toBe(3);
  });
  it("in memoria non resta nessuna domanda, solo un'impronta e le risposte", async () => {
    const m = memoria();
    await chiediJev("Quanto spende Roma per i rifiuti?", DOMANDE, { chiave: "x", fetcher: fetcherContato().fetcher, memoria: m });
    const [chiave, valore] = [...m.dati.entries()][0];
    expect(chiave).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(valore)).not.toContain("Roma");
    expect(await chiaveCache("a", DOMANDE)).not.toBe(await chiaveCache("b", DOMANDE));
  });
  it("gli errori e le risposte vuote non si ricordano", async () => {
    const m = memoria();
    const rotto = (async () => new Response("", { status: 500 })) as typeof fetch;
    expect(await chiediJev("s", DOMANDE, { chiave: "x", fetcher: rotto, memoria: m })).toBeNull();
    const vuoto = (async () => new Response(JSON.stringify({ answers: {} }))) as typeof fetch;
    await chiediJev("s", DOMANDE, { chiave: "x", fetcher: vuoto, memoria: m });
    expect(m.dati.size).toBe(0);
  });
});

describe("tetto e cache insieme", () => {
  it("la risposta in memoria non conta per il tetto, la chiamata vera si", async () => {
    const { fetcher, c } = fetcherContato();
    let contate = 0;
    const o = { chiave: "x", fetcher, memoria: memoria(), puoChiamare: async () => (++contate, true) };
    await chiediJev("a", DOMANDE, o);
    await chiediJev("a", DOMANDE, o);
    await chiediJev("a", DOMANDE, o);
    await chiediJev("b", DOMANDE, o);
    expect(c.n).toBe(2);
    expect(contate).toBe(2);
  });
  it("oltre il tetto non si chiama Jev (ma cio' che e' in memoria si serve ancora)", async () => {
    const { fetcher, c } = fetcherContato();
    const m = memoria();
    await chiediJev("gia' visto", DOMANDE, { chiave: "x", fetcher, memoria: m });
    const chiuso = { chiave: "x", fetcher, memoria: m, puoChiamare: async () => false };
    expect(await chiediJev("gia' visto", DOMANDE, chiuso)).toEqual(RISPOSTA);
    expect(await chiediJev("nuovo", DOMANDE, chiuso)).toBeNull();
    expect(c.n).toBe(1);
  });
  it("con il database vero: dopo il tetto la chat passa al ripiego, e la domanda gia' fatta si serve ancora", async () => {
    const db = nuovoDb();
    const { fetcher, c } = fetcherContato();
    const o = { chiave: "x", fetcher, memoria: memoria(), puoChiamare: () => dentroIlTetto(db, "jev", 2) };
    expect(await chiediJev("1", DOMANDE, o)).not.toBeNull();
    expect(await chiediJev("2", DOMANDE, o)).not.toBeNull();
    expect(await chiediJev("3", DOMANDE, o)).toBeNull();
    expect(await chiediJev("1", DOMANDE, o)).not.toBeNull();
    expect(c.n).toBe(2);
  });
  it("una domanda della chat, ripetuta, costa una sola chiamata", async () => {
    const indice: VoceIndice[] = [{ istat: "058091", name: "Roma", region: "Lazio", province: "Roma", population: 1, lon: 12, lat: 42 }];
    const risposte = {
      tipo: { type: "choice", choice: "scheda_comune", confidence: 0.95, probabilities: { scheda_comune: 0.95 } },
      metrica: { choice: "nessuna", confidence: 0.9, probabilities: { nessuna: 0.9 } },
      basso: { noul: 0.01 },
      senza_concentrate: { noul: 0.01 },
      area: { choice: "nessuna", confidence: 0.9, probabilities: { nessuna: 0.9 } },
      metrica_storico: { choice: "nessuna", confidence: 0.9, probabilities: { nessuna: 0.9 } },
    };
    let n = 0;
    const fetcher = (async () => (++n, new Response(JSON.stringify({ answers: risposte })))) as typeof fetch;
    const o = { chiave: "x", fetcher, memoria: memoria() };
    const rif = preparaRiferimenti(indice, [2024]);
    for (let i = 0; i < 4; i++) {
      const e = await intentoConJev("Come sta Roma?", undefined, rif, o);
      expect(e).toMatchObject({ ok: true, intento: { tipo: "scheda_comune", comune: "058091" } });
    }
    expect(n).toBe(1);
    // con una scheda aperta sul sito il testo per Jev cambia ("currently open: yes"): e' un'altra richiesta
    await intentoConJev("Come sta Roma?", { istat: "070006" }, rif, o);
    expect(n).toBe(2);
  });
});

describe("crediti finiti o chiave non valida", () => {
  it("dopo un 402 Jev si sospende: le domande successive non lo chiamano nemmeno", async () => {
    const { fetcher, c } = fetcherContato(402);
    const o = { chiave: "x", fetcher };
    expect(await chiediJev("a", DOMANDE, o)).toBeNull();
    expect(await chiediJev("b", DOMANDE, o)).toBeNull();
    expect(await chiediJev("c", DOMANDE, o)).toBeNull();
    expect(c.n).toBe(1);
  });
  it("lo stesso per 401 e 403, ma non per un errore momentaneo (500)", async () => {
    for (const status of [401, 403]) {
      riattivaJev();
      const { fetcher, c } = fetcherContato(status);
      await chiediJev("a", DOMANDE, { chiave: "x", fetcher });
      await chiediJev("b", DOMANDE, { chiave: "x", fetcher });
      expect(c.n).toBe(1);
    }
    riattivaJev();
    const { fetcher, c } = fetcherContato(500);
    await chiediJev("a", DOMANDE, { chiave: "x", fetcher });
    await chiediJev("b", DOMANDE, { chiave: "x", fetcher });
    expect(c.n).toBeGreaterThan(2); // ogni domanda ha riprovato: non e' una sospensione
  });
});
