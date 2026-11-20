import { describe, expect, it } from "vitest";
import { onRequest, SICUREZZA } from "../functions/_middleware";

const ctx = (url: string, risposta = () => new Response("ok", { headers: { "Content-Type": "text/html" } }), ua = "Mozilla/5.0") => ({
  request: new Request(url, { headers: { "user-agent": ua } }),
  next: async () => risposta(),
});

describe("middleware", () => {
  it("aggiunge gli header di sicurezza alle risposte delle Functions", async () => {
    const r = await onRequest(ctx("https://parimetro.it/comune/milano-015146"));
    for (const [k, v] of Object.entries(SICUREZZA)) expect(r.headers.get(k), k).toBe(v);
    expect(r.headers.get("Content-Type")).toBe("text/html");
    expect(await r.text()).toBe("ok");
  });
  it("non sovrascrive un header che la risposta ha gia'", async () => {
    const r = await onRequest(ctx("https://parimetro.it/og/015146.png", () => new Response("", { headers: { "X-Frame-Options": "DENY" } })));
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("funziona anche su una risposta con header immutabili (come quelle di fetch)", async () => {
    const immutabile = Response.redirect("https://parimetro.it/altro", 302);
    const r = await onRequest(ctx("https://parimetro.it/x", () => immutabile));
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("https://parimetro.it/altro");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("i redirect di dominio e dei vecchi link restano com'erano", async () => {
    const a = await onRequest(ctx("https://parimetro.pages.dev/metodo?x=1"));
    expect([a.status, a.headers.get("Location")]).toEqual([301, "https://parimetro.it/metodo?x=1"]);
    const b = await onRequest(ctx("https://parimetro.it/?comune=015146"));
    expect([b.status, b.headers.get("Location")]).toEqual([301, "https://parimetro.it/mappa?comune=015146"]);
    const c = await onRequest(ctx("https://parimetro.it/mappa?comune=015146", undefined, "WhatsApp/2.0"));
    expect([c.status, c.headers.get("Location")]).toEqual([302, "https://parimetro.it/comune/015146"]);
  });
});
