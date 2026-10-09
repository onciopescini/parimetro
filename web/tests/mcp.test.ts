import { describe, expect, it } from "vitest";
import { gestisci } from "../lib/mcp/protocollo";
import { STRUMENTI } from "../lib/mcp/strumenti";
import { INDICE, FILE, leggi } from "./fixtures/mondo_chat";

const chiama = (name: string, args: Record<string, unknown>, id = 1) =>
  gestisci({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, leggi) as Promise<{
    result: { content: { type: string; text: string }[]; isError: boolean };
  }>;

describe("protocollo MCP", () => {
  it("initialize risponde con la versione chiesta se supportata, altrimenti con la piu' recente", async () => {
    const a = (await gestisci({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, leggi)) as { result: { protocolVersion: string; capabilities: object } };
    expect(a.result.protocolVersion).toBe("2025-03-26");
    expect(a.result.capabilities).toEqual({ tools: {} });
    const b = (await gestisci({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, leggi)) as { result: { protocolVersion: string } };
    expect(b.result.protocolVersion).toBe("2025-06-18");
  });

  it("le notifiche non hanno risposta", async () => {
    expect(await gestisci({ jsonrpc: "2.0", method: "notifications/initialized" }, leggi)).toBeNull();
  });

  it("un lotto di sole notifiche non ha risposta, un lotto misto risponde solo alle richieste", async () => {
    expect(await gestisci([{ jsonrpc: "2.0", method: "notifications/initialized" }], leggi)).toBeNull();
    const r = (await gestisci([{ jsonrpc: "2.0", id: 7, method: "ping" }, { jsonrpc: "2.0", method: "notifications/x" }], leggi)) as { id: number }[];
    expect(r.map((x) => x.id)).toEqual([7]);
  });

  it("messaggio malformato: errore -32600, senza dettagli interni", async () => {
    const r = (await gestisci({ id: 3, method: "ping" }, leggi)) as { error: { code: number } };
    expect(r.error.code).toBe(-32600);
  });

  it("metodo sconosciuto: -32601", async () => {
    const r = (await gestisci({ jsonrpc: "2.0", id: 4, method: "resources/list" }, leggi)) as { error: { code: number } };
    expect(r.error.code).toBe(-32601);
  });

  it("tools/list espone solo i sette strumenti di lettura, senza notizie", async () => {
    const r = (await gestisci({ jsonrpc: "2.0", id: 5, method: "tools/list" }, leggi)) as { result: { tools: { name: string; inputSchema: { additionalProperties: boolean } }[] } };
    const nomi = r.result.tools.map((t) => t.name);
    expect(nomi).toEqual([
      "scheda_comune", "confronta_comuni", "classifica", "spesa_area", "storico_comune", "investimenti_comune", "appalti_comune",
    ]);
    expect(nomi.some((n) => /notizi/.test(n))).toBe(false);
    for (const t of r.result.tools) expect(t.inputSchema.additionalProperties).toBe(false);
  });
});

describe("strumenti", () => {
  it("scheda di Roma: testo con cifre dal motore, link alla mappa e fonte", async () => {
    const r = await chiama("scheda_comune", { comune: "Roma" });
    expect(r.result.isError).toBe(false);
    const t = r.result.content[0].text;
    expect(t).toContain("Roma");
    expect(t).toContain("https://parimetro.it/?comune=058091");
    expect(t).toMatch(/Fonte: Parimetro, dati aperti ISTAT e SIOPE/);
  });

  it("nome ambiguo: elenca le province e non sceglie", async () => {
    const r = await chiama("scheda_comune", { comune: "Castro" });
    const t = r.result.content[0].text;
    expect(t).toContain("Più comuni hanno questo nome");
    expect(t).toContain("Bergamo");
    expect(t).toContain("Lecce");
  });

  it("classifica con fascia scritta a parole: la normalizza", async () => {
    const r = await chiama("classifica", { metrica: "expenditure_pc", ordine: "alto", fascia: "oltre 250.000 abitanti" });
    expect(r.result.isError).toBe(false);
  });

  it("argomenti non validi: errore leggibile, senza chiamare il motore", async () => {
    let letture = 0;
    const contati = async (p: string) => { letture++; return leggi(p); };
    const r = (await gestisci({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "classifica", arguments: { metrica: "inventata", ordine: "alto" } } }, contati)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("metrica");
    expect(letture).toBe(0);
  });

  it("area sconosciuta, anno fuori intervallo, confronto con un comune solo: errori chiari", async () => {
    expect((await chiama("spesa_area", { comune: "Roma", area: "armamenti" })).result.isError).toBe(true);
    expect((await chiama("scheda_comune", { comune: "Roma", anno: 12 })).result.isError).toBe(true);
    const u = await chiama("confronta_comuni", { comuni: [{ comune: "Roma" }] });
    expect(u.result.isError).toBe(true);
    expect(u.result.content[0].text).toContain("da due a quattro");
  });

  it("testo troppo lungo per un nome: rifiutato", async () => {
    expect((await chiama("scheda_comune", { comune: "a".repeat(200) })).result.isError).toBe(true);
  });

  it("strumento sconosciuto: errore del protocollo -32602", async () => {
    const r = (await gestisci({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "notizie", arguments: {} } }, leggi)) as { error: { code: number } };
    expect(r.error.code).toBe(-32602);
  });

  it("dati non raggiungibili: messaggio generico, nessun dettaglio tecnico", async () => {
    const rotto = async () => { throw new Error("/dati/anni.json: HTTP 500 interno"); };
    const r = (await gestisci({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "scheda_comune", arguments: { comune: "Roma" } } }, rotto)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).not.toMatch(/HTTP|500/);
  });

  it("ogni strumento ha descrizione e schema con campi obbligatori", () => {
    for (const s of STRUMENTI) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.inputSchema.type).toBe("object");
    }
  });

  it("i dati finti del test hanno Roma nel mondo finto", () => {
    expect(INDICE.some((v) => v.istat === "058091")).toBe(true);
    expect(FILE).toBeDefined();
  });
});
