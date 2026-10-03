import { describe, expect, it } from "vitest";
import { ordinaCicli, quotaDelPrimo } from "../lib/investimenti";

describe("quotaDelPrimo", () => {
  it("quanto pesa il primo progetto sul totale", () => {
    expect(quotaDelPrimo([3000, 1000], 4000)).toBe(75);
  });
  it("senza progetti o con totale zero: null, mai NaN o Infinity", () => {
    expect(quotaDelPrimo([], 100)).toBeNull();
    expect(quotaDelPrimo([100], 0)).toBeNull();
    expect(quotaDelPrimo([null], 100)).toBeNull();
  });
});

describe("ordinaCicli", () => {
  it("il 2000-2006 (codice 9) viene prima del 2007-2013", () => {
    expect(ordinaCicli([{ ciclo: 2 }, { ciclo: 9 }, { ciclo: 1 }, { ciclo: 3 }]).map((c) => c.ciclo)).toEqual([9, 1, 2, 3]);
  });
  it("non modifica l'elenco originale", () => {
    const orig = [{ ciclo: 9 }, { ciclo: 1 }];
    ordinaCicli(orig);
    expect(orig.map((c) => c.ciclo)).toEqual([9, 1]);
  });
});
