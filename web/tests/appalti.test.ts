import { describe, expect, it } from "vitest";
import { annoDisponibile, nuovaRilevazione } from "../lib/appalti";

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
