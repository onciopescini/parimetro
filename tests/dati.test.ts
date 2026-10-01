import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import slugCases from "./fixtures/slug-cases.json";
import classificaCases from "./fixtures/classifica-cases.json";
import {
  URL_DATI,
  _azzeraIndice,
  cerca,
  leggi,
  percorsoClassifica,
  senzaAccenti,
  slug,
  type VoceIndice,
} from "@/lib/dati";

// ---------------------------------------------------------------------------
// Contratto con l'esportatore Python. Le stesse tabelle stanno in
// etl/tests/fixtures/ dell'altro repository: se uno slug cambia da una parte
// sola, i file che il sito cerca non esistono piu' e la pagina resta vuota.
// ---------------------------------------------------------------------------
describe("slug (contratto con 05_esporta_statico.py)", () => {
  it.each(slugCases)("slug($input) = $expected", ({ input, expected }) => {
    expect(slug(input)).toBe(expected);
  });

  it("e' idempotente: uno slug rifatto non cambia", () => {
    for (const { input } of slugCases) {
      expect(slug(slug(input))).toBe(slug(input));
    }
  });

  it("due nomi che differiscono solo per l'accento danno lo stesso slug", () => {
    // Collisione nota e accettata: vale per fasce e regioni, che non ne hanno.
    // Se si volesse usare lo slug sui comuni, questo test va ripensato.
    expect(slug("Forlì")).toBe(slug("Forli"));
  });
});

describe("percorsoClassifica (contratto con 05_esporta_statico.py)", () => {
  it.each(classificaCases)("$expected", (c) => {
    expect(percorsoClassifica(c.anno, c.metric, c.desc, c.fascia, c.region)).toBe(
      `${URL_DATI}/${c.expected}`,
    );
  });

  it("combinazioni diverse non collidono su uno stesso file", () => {
    const percorsi = new Set<string>();
    const metriche = ["fhi", "autonomia", "expenditure_pc", "revenue_pc"];
    const fasce = [null, "sotto 1.000 abitanti", "da 1.000 a 5.000 abitanti"];
    const regioni = [null, "Lombardia", "Valle D'Aosta"];
    let n = 0;
    for (const m of metriche)
      for (const d of [true, false])
        for (const f of fasce)
          for (const r of regioni) {
            percorsi.add(percorsoClassifica(2024, m, d, f, r));
            n++;
          }
    expect(percorsi.size).toBe(n);
  });
});

describe("senzaAccenti", () => {
  it("toglie i segni ma lascia le lettere", () => {
    expect(senzaAccenti("Città")).toBe("citta");
    expect(senzaAccenti("ÀÈÉÌÒÙ")).toBe("aeeiou");
  });
});

// ---------------------------------------------------------------------------
describe("leggi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("restituisce il JSON quando la risposta e' ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [2020, 2021] }));
    await expect(leggi<number[]>("/dati/anni.json")).resolves.toEqual([2020, 2021]);
  });

  it("solleva su un 404 invece di restituire qualcosa di vuoto", async () => {
    // E' il difetto che ci era gia' costato un ripristino da deep link:
    // "fallito" non deve sembrare "nessun risultato".
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(leggi("/dati/anni.json")).rejects.toThrow(/HTTP 404/);
  });
});

// ---------------------------------------------------------------------------
const comune = (
  istat: string,
  name: string,
  population: number,
  province = "XX",
): VoceIndice => ({ istat, name, region: "R", province, population, lon: 0, lat: 0 });

const INDICE: VoceIndice[] = [
  comune("058091", "Roma", 2_750_000),
  comune("016183", "Romano di Lombardia", 20_000),
  comune("024086", "Romano d'Ezzelino", 14_000),
  comune("083076", "Rometta", 6_500),
  comune("003131", "Romentino", 5_600),
  comune("037053", "San Giovanni in Persiceto", 28_000),
  comune("071046", "San Giovanni Rotondo", 26_000),
  comune("051033", "San Giovanni Valdarno", 16_000),
  comune("040012", "Forlì", 117_000),
  comune("037006", "Sant'Agata Bolognese", 7_500),
  comune("096016", "Cavaglià", 3_500),
  comune("999001", "Villa San Giovanni", 13_000), // "san giovanni" a meta' nome
];

describe("cerca", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _azzeraIndice();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => INDICE });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const nomi = async (q: string, limite?: number) => (await cerca(q, limite)).map((v) => v.name);

  it("sotto i 2 caratteri non cerca nulla e non scarica l'indice", async () => {
    expect(await cerca("r")).toEqual([]);
    expect(await cerca("  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("l'indice si scarica una volta sola, non a ogni ricerca", async () => {
    await cerca("ro");
    await cerca("rom");
    await cerca("san");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${URL_DATI}/indice.json`);
  });

  it("il codice ISTAT esatto vince su tutto", async () => {
    expect((await nomi("058091"))[0]).toBe("Roma");
  });

  it("chi inizia col termine precede chi lo contiene a meta' nome", async () => {
    const r = await nomi("san giovanni");
    // "Villa San Giovanni" contiene il termine ma non inizia con esso
    expect(r.slice(0, 3).sort()).toEqual([
      "San Giovanni Rotondo",
      "San Giovanni Valdarno",
      "San Giovanni in Persiceto",
    ]);
    expect(r[r.length - 1]).toBe("Villa San Giovanni");
  });

  it("a parita' di graduatoria vince il comune piu' popoloso", async () => {
    expect(await nomi("rom")).toEqual([
      "Roma", // 2,75 Mln
      "Romano di Lombardia", // 20.000
      "Romano d'Ezzelino", // 14.000
      "Rometta", // 6.500
      "Romentino", // 5.600
    ]);
  });

  it("trova 'Forlì' scrivendo 'forli' (chi digita non mette gli accenti)", async () => {
    expect(await nomi("forli")).toEqual(["Forlì"]);
    expect(await nomi("cavaglia")).toEqual(["Cavaglià"]);
  });

  it("trova anche scrivendo gli accenti", async () => {
    expect(await nomi("Cavaglià")).toEqual(["Cavaglià"]);
  });

  it("l'apostrofo non ostacola: 'sant agata' trova 'Sant'Agata'", async () => {
    expect(await nomi("sant agata")).toEqual(["Sant'Agata Bolognese"]);
    expect(await nomi("sant'agata")).toEqual(["Sant'Agata Bolognese"]);
  });

  it("rispetta il limite", async () => {
    expect(await cerca("ro", 2)).toHaveLength(2);
  });

  it("nessun risultato e' un array vuoto, non un errore", async () => {
    expect(await cerca("zzzz")).toEqual([]);
  });

  it("un download fallito solleva, e il tentativo dopo riprova davvero", async () => {
    _azzeraIndice();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(cerca("roma")).rejects.toThrow(/503/);

    // Se il fallimento restasse in memoria, la ricerca resterebbe rotta fino
    // al ricaricamento della pagina anche a rete tornata.
    await new Promise((r) => setTimeout(r, 0));
    fetchMock.mockResolvedValue({ ok: true, json: async () => INDICE });
    // "roma" e' prefisso anche di "Romano di Lombardia" e "Romano d'Ezzelino":
    // conta che la ricerca sia ripartita, con Roma (la piu' popolosa) in testa
    const dopo = await nomi("roma");
    expect(dopo[0]).toBe("Roma");
    expect(dopo).toHaveLength(3);
  });
});

// Le etichette delle categorie devono coprire esattamente le chiavi che l'ETL
// assegna: una chiave nuova in Python senza etichetta qui si vedrebbe in chiaro.
describe("categorie", () => {
  it("AREE e NATURE coincidono con etl/categorie_spesa.py", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { AREE, NATURE } = await import("../lib/categorie");
    const py = "../mappa-3d-bilanci/etl/categorie_spesa.py";
    if (!existsSync(py)) return; // repo ETL non affiancato (CI del solo sito)
    const src = readFileSync(py, "utf-8");
    const chiavi = (nome: string) => {
      const da = src.indexOf(`${nome}: dict[str, str] = {`);
      const blocco = src.slice(da, src.indexOf("}", da));
      return [...blocco.matchAll(/"(\w+)":/g)].map((m) => m[1]).sort();
    };
    expect(Object.keys(AREE).sort()).toEqual(chiavi("AREE"));
    expect(Object.keys(NATURE).sort()).toEqual(chiavi("NATURE"));
  });
});
