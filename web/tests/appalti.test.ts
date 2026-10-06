import { describe, expect, it } from "vitest";
import { annoDisponibile, copertura, nuovaRilevazione, vociAree } from "../lib/appalti";

describe("nuovaRilevazione", () => {
  it("dal 2024 la serie ANAC non e' confrontabile con prima", () => {
    expect(nuovaRilevazione(2023)).toBe(false);
    expect(nuovaRilevazione(2024)).toBe(true);
    expect(nuovaRilevazione(2025)).toBe(true);
  });
});

describe("annoDisponibile", () => {
  const anni = { "2022": {}, "2023": {}, "2024": {} };
  it("l'anno richiesto se c'e'", () => expect(annoDisponibile(anni, 2023)).toBe(2023));
  it("altrimenti l'ultimo", () => {
    expect(annoDisponibile(anni, 2030)).toBe(2024);
    expect(annoDisponibile(anni, 2010)).toBe(2024);
  });
  it("senza dati: null", () => expect(annoDisponibile({}, 2024)).toBeNull());
});


describe("a cosa servono le gare", () => {
  const anno = {
    lotti: 100,
    classificati: 85,
    voci: [
      { area: "non_classificabile", n: 15, importo: 1000 },
      { area: "strade_trasporti", n: 30, importo: 5000 },
      { area: "funzionamento", n: 40, importo: null },
      { area: "rifiuti", n: 15, importo: 200 },
    ],
  };
  it("mette le aree in ordine di lotti e i non classificabili sempre in fondo", () => {
    const v = vociAree(anno);
    expect(v.map((x) => x.area)).toEqual(["funzionamento", "strade_trasporti", "rifiuti", "non_classificabile"]);
    expect(v.map((x) => x.quota)).toEqual([40, 30, 15, 15]);
  });
  it("le quote sono sui lotti e un anno vuoto non rompe nulla", () => {
    expect(vociAree({ lotti: 0, classificati: 0, voci: [] })).toEqual([]);
    expect(copertura(anno)).toBe(85);
    expect(copertura({ lotti: 0, classificati: 0, voci: [] })).toBe(0);
  });
});
