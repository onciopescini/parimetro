import { describe, expect, it } from "vitest";
import { eConcentrata, righeVisibili, SOGLIA_CONCENTRAZIONE } from "../lib/classifica";

const riga = (posizione: number, concentrata: number | null) => ({ posizione, concentrata });

describe("eConcentrata", () => {
  it("la soglia e' inclusa", () => {
    expect(eConcentrata(SOGLIA_CONCENTRAZIONE)).toBe(true);
    expect(eConcentrata(SOGLIA_CONCENTRAZIONE - 0.1)).toBe(false);
  });
  it("legge anche le stringhe, come arrivano dal JSON dell'esportatore", () => {
    expect(eConcentrata("90.1")).toBe(true);
    expect(eConcentrata("9.5")).toBe(false);
  });
  it("senza dettaglio non e' concentrata: non si accusa chi non ha dati", () => {
    expect(eConcentrata(null)).toBe(false);
    expect(eConcentrata(undefined)).toBe(false);
  });
});

describe("righeVisibili", () => {
  const righe = [riga(1, 90), riga(2, 10), riga(3, 55), riga(4, 5), riga(5, null)];

  it("senza filtro mostra tutto, nell'ordine", () => {
    expect(righeVisibili(righe, false).map((r) => r.concentrata)).toEqual([90, 10, 55, 5, null]);
  });
  it("col filtro toglie le concentrate e rinumera senza buchi", () => {
    const v = righeVisibili(righe, true);
    expect(v.map((r) => r.concentrata)).toEqual([10, 5, null]);
    expect(v.map((r) => r.posizione)).toEqual([1, 2, 3]);
  });
  it("taglia al massimo dopo aver filtrato, non prima", () => {
    const molte = Array.from({ length: 30 }, (_, i) => riga(i + 1, i % 2 === 0 ? 80 : 1));
    expect(righeVisibili(molte, true, 10)).toHaveLength(10);
    expect(righeVisibili(molte, true, 10).every((r) => !eConcentrata(r.concentrata))).toBe(true);
  });
  it("non modifica le righe originali", () => {
    righeVisibili(righe, true);
    expect(righe[0].posizione).toBe(1);
  });
});
