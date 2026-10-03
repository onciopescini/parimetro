import { describe, expect, it } from "vitest";
import { POCHI_CONTRIBUENTI, pochiContribuenti, spesaOgniCentoDiReddito } from "../lib/reddito";

describe("pochiContribuenti", () => {
  it("la soglia e' esclusa: con 100 contribuenti la media e' ancora affidabile", () => {
    expect(pochiContribuenti(POCHI_CONTRIBUENTI - 1)).toBe(true);
    expect(pochiContribuenti(POCHI_CONTRIBUENTI)).toBe(false);
  });
  it("senza dato non si accusa nessuno", () => {
    expect(pochiContribuenti(null)).toBe(false);
    expect(pochiContribuenti(undefined)).toBe(false);
  });
});

describe("spesaOgniCentoDiReddito", () => {
  it("euro spesi ogni 100 di reddito per abitante", () => {
    expect(spesaOgniCentoDiReddito(1200, 12000)).toBe(10);
  });
  it("accetta la spesa come stringa (arriva cosi' dal JSON)", () => {
    expect(spesaOgniCentoDiReddito("600", 12000)).toBe(5);
  });
  it("niente da dividere: null, mai Infinity o NaN", () => {
    expect(spesaOgniCentoDiReddito(1000, 0)).toBeNull();
    expect(spesaOgniCentoDiReddito(1000, null)).toBeNull();
    expect(spesaOgniCentoDiReddito(null, 12000)).toBeNull();
    expect(spesaOgniCentoDiReddito("boh", 12000)).toBeNull();
  });
});
