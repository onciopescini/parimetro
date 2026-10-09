import { describe, expect, it } from "vitest";
import { confrontoRighe, domandeGioco, fasciaDi, scoperte, slugCoppia, type DatoComune } from "../lib/viralita/genera";

const c = (istat: string, name: string, population: number, spesaPc: number | null, extra: Partial<DatoComune> = {}): DatoComune => ({
  istat, name, province: "Prov", region: "Reg", population, spesaPc, entrateSpesaPc: 1000, autonomia: 60, rango: 50, reddito: 20000, concentrata: false, ...extra,
});

describe("gioco: domande", () => {
  it("la risposta giusta e' fra le opzioni e le altre sono lontane almeno il 15%", () => {
    const dati = [
      c("1", "Alfa", 12000, 1000),
      c("2", "Beta", 13000, 1100),
      c("3", "Gamma", 14000, 1500),
      c("4", "Delta", 15000, 2000),
      c("5", "Epsilon", 16000, 2500),
    ];
    const d = domandeGioco(dati).find((x) => x.nome === "Alfa");
    expect(d).toBeDefined();
    expect(d!.opzioni).toContain(d!.vero);
    expect(d!.opzioni).toHaveLength(4);
    for (const o of d!.opzioni.filter((x) => x !== d!.vero)) {
      expect(Math.abs(o - d!.vero) / d!.vero).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("esclude i comuni con spesa concentrata e quelli sotto i 10.000 abitanti", () => {
    const dati = [
      c("1", "Piccolo", 500, 900),
      c("2", "Concentrato", 12000, 1000, { concentrata: true }),
      c("3", "Buono", 12000, 1100),
    ];
    const nomi = domandeGioco(dati).map((x) => x.nome);
    expect(nomi).not.toContain("Piccolo");
    expect(nomi).not.toContain("Concentrato");
  });

  it("senza tre risposte sbagliate plausibili non fa la domanda", () => {
    const dati = [c("1", "Solo", 12000, 1000), c("2", "Altro", 12000, 1010)];
    expect(domandeGioco(dati)).toEqual([]);
  });
});

describe("scoperte", () => {
  it("non include mai il record di autonomia (dato non verificabile)", () => {
    const dati = [c("1", "A", 6000, 1000, { autonomia: 100 }), c("2", "B", 7000, 1100, { autonomia: 99.5 })];
    const t = scoperte(dati).map((x) => x.id);
    expect(t).not.toContain("autonomia-massima");
  });

  it("la quota di comuni sotto il 50% di autonomia e' calcolata sui dati", () => {
    const dati = [c("1", "A", 6000, 1000, { autonomia: 40 }), c("2", "B", 7000, 1000, { autonomia: 80 })];
    const f = scoperte(dati).find((x) => x.id === "autonomia-sotto-meta");
    expect(f?.testo).toContain("1 comuni su 2");
  });

  it("le spese dei comuni concentrati non entrano nei confronti tra grandi citta'", () => {
    const dati = [
      c("1", "Grande", 300000, 1000),
      c("2", "Grandissima", 400000, 9999, { concentrata: true }),
      c("3", "Altra", 350000, 1500),
    ];
    const f = scoperte(dati).find((x) => x.id === "grandi-spesa");
    expect(f?.testo).not.toContain("Grandissima");
  });
});

describe("confronti", () => {
  it("riga per riga, con n.d. quando un valore manca", () => {
    const r = confrontoRighe(c("1", "A", 10000, 1000), c("2", "B", 20000, null));
    const spesa = r.find((x) => x.etichetta === "Spesa per abitante");
    expect(spesa?.a).toBe("1.000 €");
    expect(spesa?.b).toBe("n.d.");
  });

  it("lo slug della coppia e' stabile, senza accenti", () => {
    expect(slugCoppia(c("1", "Città di Pòs", 1, null), c("2", "Bari", 1, null))).toBe("citta-di-pos-vs-bari");
  });

  it("le fasce coincidono con quelle della mappa", () => {
    expect(fasciaDi(999)).toBe(0);
    expect(fasciaDi(250000)).toBe(5);
  });
});
