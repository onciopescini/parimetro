import { describe, expect, it } from "vitest";
import {
  avvertenza,
  costruisci,
  disponibile,
  domanda,
  ognicento,
  spesaConcentrata,
  treNumeri,
  type DatiCard,
} from "../lib/card/contenuto";
import { avvolgi, DIMENSIONI, disegna, type Ambiente } from "../lib/card/disegna";
import type { CategorieComune } from "../lib/categorie";

const area = (a: string, importo: number, pc: number, mediana: number, n = 400) => ({ area: a, importo, pc, mediana_pc: mediana, n_simili: n, rango: 50 });

const CAT: CategorieComune = {
  totale: 83_029_877,
  aree: [
    area("funzionamento", 14_415_191, 304, 133),
    area("non_attribuibile", 13_484_853, 284, 99),
    area("personale", 10_583_725, 223, 187),
    area("strade_trasporti", 9_882_413, 208, 61),
    area("rifiuti", 8_772_771, 185, 180),
    area("istruzione", 5_362_733, 113, 57),
    area("trasferimenti_imposte", 4_500_000, 95, 99),
    area("sociale_sanita", 4_150_000, 88, 48),
    area("patrimonio", 4_080_000, 86, 47),
    area("cultura_sport_turismo", 3_040_000, 64, 22),
    area("ambiente_territorio", 1_820_000, 39, 15),
    area("utenze", 1_740_000, 37, 47),
    area("debito", 1_000_000, 22, 40),
    area("operazioni_finanziarie", 60_000, 1, 0),
  ],
  nature: [],
  voci: [{ codice: "U1", descrizione: "Stipendi", area: "personale", importo: 8_000_000 }],
  altre_voci: { n: 0, importo: 0 },
};

const DATI: DatiCard = {
  voce: { istat: "070006", name: "Campobasso", province: "Campobasso", region: "Molise", population: 47418 },
  anno: 2024,
  spesaPc: 1751.02,
  simili: { fascia: "da 20.000 a 60.000 abitanti", n: 414, expenditure_pc: 1123.2 },
  categorie: CAT,
  investimenti: {
    pnrr: { n: 45, fin_pnrr: 47_647_177, fin_totale: 60e6, pc: 1005, mediana_pc: 264, rango: 98, n_simili: 414, conclusi: 16, missioni: [], progetti: [] },
  } as unknown as DatiCard["investimenti"],
  appalti: null,
  concorrenza: {
    "2025": {
      n_gare: 13, n_con_offerte: 11, n_offerta_unica: 5, quota_offerta_unica: 45.5, mediana_quota_offerta_unica: 25,
      rango_offerta_unica: 83, n_simili: 141, offerte_mediane: 2, ribasso_mediano: 5.5,
    },
  },
  reddito: null,
};

const CONCENTRATA = { ...CAT, voci: [{ codice: "X", descrizione: "Beni immobili", area: "patrimonio", importo: 60_000_000 }] };

describe("ogni 100 euro", () => {
  it("fa sempre 100, qualunque siano gli importi", () => {
    for (const quante of [3, 5, 6, 8]) {
      const f = ognicento(CAT, quante)!;
      expect(f.reduce((s, x) => s + x.euro, 0)).toBe(100);
    }
    const strano = { ...CAT, totale: 100, aree: [area("a", 33.3, 1, 1), area("b", 33.3, 1, 1), area("c", 33.4, 1, 1)] };
    expect(ognicento(strano)!.reduce((s, x) => s + x.euro, 0)).toBe(100);
  });
  it("ordina per peso e raggruppa il resto", () => {
    const f = ognicento(CAT)!;
    expect(f.map((x) => x.nome)).toEqual(["Funzionamento", "Non attribuibile", "Personale", "Strade e trasporti", "Rifiuti", "Scuole", "Tutto il resto"]);
    expect(f[0].euro).toBe(17);
    expect(f.at(-1)!.euro).toBe(25);
  });
  it("senza dati non c'è la card", () => {
    expect(ognicento(null)).toBeNull();
    expect(ognicento({ ...CAT, totale: 0 })).toBeNull();
    expect(ognicento({ ...CAT, aree: [] })).toBeNull();
  });
});

describe("spesa concentrata", () => {
  it("scatta con una voce al 40% o più", () => {
    expect(spesaConcentrata(CAT)).toBeNull();
    const c = spesaConcentrata(CONCENTRATA);
    expect(c?.quota).toBe(72);
    expect(c?.voce).toBe("Beni immobili");
  });
});

describe("tre numeri", () => {
  it("spesa con il confronto, PNRR e gare", () => {
    const n = treNumeri(DATI)!;
    expect(n.map((x) => x.valore)).toEqual(["1751 €", "47,6 M€", "45,5%"]);
    expect(n[0].confronto).toBe("628 € più dei comuni simili (1123 €)");
    expect(n[1].confronto).toBe("1005 € per abitante");
    expect(n[2].confronto).toBe("nei comuni simili: 25% (2025)");
  });
  it("in linea quando la differenza è sotto il 3%", () => {
    expect(treNumeri({ ...DATI, spesaPc: 1130 })![0].confronto).toBe("in linea con i comuni simili (1123 €)");
  });
  it("ripiega sugli appalti senza gara", () => {
    const senzaGare = {
      ...DATI,
      concorrenza: null,
      appalti: { anni: { "2024": { quota_diretti: 90.7, mediana_quota_diretti: 88.6 } }, tipi: {}, famiglie: {}, maggiori: [] },
    } as unknown as DatiCard;
    expect(treNumeri(senzaGare)![2].etichetta).toBe("degli appalti assegnati senza gara");
  });
  it("con meno di due dati non c'è la card", () => {
    expect(treNumeri({ ...DATI, spesaPc: null, investimenti: null, concorrenza: null })).toBeNull();
    expect(treNumeri({ ...DATI, investimenti: null, concorrenza: null })).toBeNull(); // la sola spesa non basta
  });
});

describe("una domanda", () => {
  it("sceglie l'area che si discosta di più dai simili", () => {
    const d = domanda(CAT)!;
    expect(d.area).toBe("strade_trasporti"); // 208 contro 61: 3,4 volte
    expect(d.direzione).toBe("più");
    expect(Math.round(d.rapporto * 10) / 10).toBe(3.4);
  });
  it("non fa domande su voci contabili o con troppi pochi simili", () => {
    const solo = { ...CAT, aree: [area("non_attribuibile", 1, 500, 10), area("debito", 1, 500, 10), area("rifiuti", 1, 500, 10, 5)] };
    expect(domanda(solo)).toBeNull();
  });
  it("sa anche quando il comune spende molto meno", () => {
    const d = domanda({ ...CAT, aree: [area("istruzione", 1, 30, 120)] })!;
    expect(d.direzione).toBe("meno");
    expect(d.rapporto).toBeCloseTo(4);
  });
  it("niente domanda se la spesa è concentrata: il pro capite non è confrontabile", () => {
    expect(domanda(CONCENTRATA)).toBeNull();
  });
  it("ignora differenze piccole", () => {
    expect(domanda({ ...CAT, aree: [area("rifiuti", 1, 185, 180), area("personale", 1, 223, 187)] })).toBeNull();
  });
});

describe("avvertenze", () => {
  it("ci sono sempre, con l'anno e i comuni a confronto", () => {
    for (const t of ["cento", "tre", "domanda"] as const) {
      const a = avvertenza(DATI, t);
      expect(a).toContain("Dati di cassa 2024");
      expect(a).toContain("414 comuni");
    }
    expect(avvertenza(DATI, "domanda")).toContain("Non è un’accusa: è una domanda.");
  });
  it("segnalano la spesa concentrata sulle card dei dati", () => {
    const conc = { ...DATI, categorie: CONCENTRATA };
    expect(avvertenza(conc, "cento")).toContain("investimento isolato");
    expect(avvertenza(conc, "tre")).toContain("investimento isolato");
  });
});

describe("costruisci", () => {
  it("prepara le tre card, con nomi di file puliti", () => {
    const c = costruisci(DATI);
    expect(Object.values(c).every(disponibile)).toBe(true);
    if (disponibile(c.cento)) expect(c.cento.file).toBe("parimetro-campobasso-ogni-100-euro");
    if (disponibile(c.domanda)) expect(c.domanda.descrizione).toContain("208 €");
  });
  it("spiega perché una card non c'è", () => {
    const c = costruisci({ ...DATI, categorie: null });
    expect(disponibile(c.cento)).toBe(false);
    expect(disponibile(c.domanda)).toBe(false);
    expect(disponibile(c.tre)).toBe(true);
    expect((c.domanda as { motivo: string }).motivo.length).toBeGreaterThan(10);
  });
  it("con la spesa concentrata dice che la domanda non è affidabile", () => {
    const c = costruisci({ ...DATI, categorie: CONCENTRATA });
    expect((c.domanda as { motivo: string }).motivo).toContain("non è affidabile");
    expect(disponibile(c.cento)).toBe(true);
  });
  it("il nome del file non porta accenti né apostrofi", () => {
    const c = costruisci({ ...DATI, voce: { ...DATI.voce, name: "Sant'Agata de' Goti" } });
    if (disponibile(c.cento)) expect(c.cento.file).toBe("parimetro-sant-agata-de-goti-ogni-100-euro");
  });
});

describe("disegno", () => {
  // un contesto finto che registra cosa viene scritto: prova tutte le strade senza un browser
  function finto() {
    const testi: string[] = [];
    const base: Record<string, unknown> = {
      measureText: (t: string) => ({ width: t.length * 11 }),
      fillText: (t: string) => testi.push(t),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };
    const ctx = new Proxy(base, {
      get: (o, k: string) => (k in o ? o[k] : () => {}),
      set: (o, k: string, v) => ((o[k] = v), true),
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, testi };
  }
  const AMB: Ambiente = { serif: "serif", sans: "sans-serif", mono: "monospace", indirizzo: "esempio.it" };

  it("disegna tutte e tre le card con le avvertenze e l'indirizzo", () => {
    const c = costruisci(DATI);
    for (const t of ["cento", "tre", "domanda"] as const) {
      const cont = c[t];
      if (!disponibile(cont)) throw new Error("manca " + t);
      const { ctx, testi } = finto();
      disegna(ctx, cont, AMB);
      const tutto = testi.join(" ");
      expect(tutto).toContain("Parimetro");
      expect(tutto).toContain("esempio.it");
      expect(tutto).toContain("Dati di cassa");
      expect(tutto.toLowerCase()).toContain("campobasso");
    }
  });
  it("la card della domanda scrive i due numeri e la domanda", () => {
    const cont = costruisci(DATI).domanda;
    if (!disponibile(cont)) throw new Error("manca");
    const { ctx, testi } = finto();
    disegna(ctx, cont, AMB);
    const tutto = testi.join(" ");
    expect(tutto).toContain("208 €");
    expect(tutto).toContain("61 €");
    expect(tutto).toContain("Cosa spiega la differenza");
    expect(tutto).toContain("3,4 volte");
  });
  it("le misure sono quelle del design", () => {
    expect(DIMENSIONI).toEqual({ cento: { w: 1080, h: 1080 }, tre: { w: 1080, h: 1920 }, domanda: { w: 1200, h: 630 } });
  });
  it("va a capo alle parole senza perderne", () => {
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) };
    const righe = avvolgi(ctx, "uno due tre quattro cinque sei sette", 100);
    expect(righe.join(" ")).toBe("uno due tre quattro cinque sei sette");
    expect(righe.length).toBeGreaterThan(1);
    expect(avvolgi(ctx, "", 100)).toEqual([]);
  });
});
