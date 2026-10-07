import { describe, expect, it } from "vitest";
import { chiediJev, probabilitaScelta } from "../lib/chat/jev";
import { intentoConJev, preparaRiferimenti, statoPerJev } from "../lib/chat/intentoJev";
import { preparaIndice, trovaAnno, trovaComuni, trovaRegione } from "../lib/chat/menzioni";
import { rispondi } from "../lib/chat/rispondi";
import type { VoceIndice } from "../lib/dati";

const v = (istat: string, name: string, province: string, population: number, region = "Lazio"): VoceIndice => ({
  istat, name, region, province, population, lon: 12, lat: 42,
});
const INDICE: VoceIndice[] = [
  v("058091", "Roma", "Roma", 2_750_000),
  v("015146", "Milano", "Milano", 1_370_000, "Lombardia"),
  v("070006", "Campobasso", "Campobasso", 48_000, "Molise"),
  v("094023", "Isernia", "Isernia", 21_000, "Molise"),
  v("004083", "Elva", "Cuneo", 78, "Piemonte"),
  v("001001", "Castro", "Bergamo", 1_300, "Lombardia"),
  v("075099", "Castro", "Lecce", 2_400, "Puglia"),
  v("001002", "San Giovanni al Natisone", "Udine", 6_000, "Friuli-Venezia Giulia"),
  v("003001", "Alto", "Cuneo", 100, "Piemonte"),
  v("003002", "Sala", "Salerno", 500, "Campania"),
  v("021008", "Bolzano/Bozen", "Bolzano", 106_000, "Trentino-Alto Adige"),
  v("016024", "Reggio nell'Emilia", "Reggio Emilia", 170_000, "Emilia-Romagna"),
];
const FORME = preparaIndice(INDICE);
const REGIONI = [...new Set(INDICE.map((x) => x.region))];
const nomi = (d: string) => trovaComuni(d, FORME).comuni.map((c) => c.comune);

describe("trovaComuni: i comuni che la domanda nomina davvero", () => {
  it("per nome, anche in minuscolo e senza accenti", () => {
    expect(nomi("Come sta andando Campobasso?")).toEqual(["070006"]);
    expect(nomi("quanto spende milano")).toEqual(["015146"]);
    expect(nomi("com'è messa roma")).toEqual(["058091"]);
  });
  it("nomi su piu' parole e con la barra", () => {
    expect(nomi("scheda di San Giovanni al Natisone")).toEqual(["001002"]);
    expect(nomi("spesa di Reggio nell'Emilia")).toEqual(["016024"]);
    expect(nomi("e Bolzano?")).toEqual(["021008"]);
  });
  it("piu' comuni: nell'ordine in cui compaiono, senza ripetizioni", () => {
    expect(nomi("Confronta Roma e Milano")).toEqual(["058091", "015146"]);
    expect(nomi("Roma vs Milano vs Roma")).toEqual(["058091", "015146"]);
  });
  it("parole di tutti i giorni che sono anche comuni non contano, a meno che siano scritte come nomi", () => {
    expect(nomi("qual e' l'alto e il basso della spesa")).toEqual([]);
    expect(nomi("la sala grande costa")).toEqual([]);
    expect(nomi("scheda di Alto")).toEqual(["003001"]);
    expect(nomi("Quanto spende Sala per i rifiuti")).toEqual(["003002"]);
  });
  it("omonimi: la provincia detta nella domanda li scioglie, altrimenti resta il nome (e la chat chiedera')", () => {
    expect(nomi("spesa rifiuti di Castro")).toEqual(["Castro"]);
    expect(nomi("Castro in provincia di Lecce")).toEqual(["075099"]);
  });
  it("il codice ISTAT scritto in domanda", () => {
    expect(nomi("scheda 058091")).toEqual(["058091"]);
  });
  it("sa se si parla del comune aperto", () => {
    expect(trovaComuni("quanto spende questo comune?", FORME).corrente).toBe(true);
    expect(trovaComuni("il mio comune e' virtuoso?", FORME).corrente).toBe(true);
    expect(trovaComuni("quanto spende Roma?", FORME).corrente).toBe(false);
  });
  it("regione e anno si leggono dal testo", () => {
    expect(trovaRegione("chi spende meno in Molise", REGIONI)).toBe("Molise");
    expect(trovaRegione("comuni del trentino", REGIONI)).toBe("Trentino-Alto Adige");
    expect(trovaRegione("comuni d'Italia", REGIONI)).toBeNull();
    expect(trovaAnno("spesa nel 2023", [2022, 2023, 2024])).toBe(2023);
    expect(trovaAnno("dal 2022 al 2024", [2022, 2023, 2024])).toBeUndefined(); // due anni: non si indovina
    expect(trovaAnno("nel 1999", [2022, 2023])).toBeUndefined();
  });
});

// ---- un Jev finto: risponde con le risposte che gli diamo
function jevFinto(risposte: Record<string, unknown>, stato = 200) {
  const chiamate: { body: string }[] = [];
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    chiamate.push({ body: String(init?.body) });
    return new Response(JSON.stringify({ answers: risposte }), { status: stato });
  }) as typeof fetch;
  return { fetcher, chiamate };
}
const scelta = (choice: string, p = 0.95) => ({ type: "choice", choice, confidence: p, probabilities: { [choice]: p } });
const nessuna = scelta("nessuna", 0.99);
const noul = (x: number) => ({ type: "noul", noul: x });
const base = { metrica: nessuna, basso: noul(0.05), senza_concentrate: noul(0.02), area: nessuna, metrica_storico: nessuna };
const RIF = preparaRiferimenti(INDICE, [2022, 2023, 2024]);

describe("intentoConJev", () => {
  it("scheda di un comune: il nome lo legge il codice, la domanda la sceglie Jev", async () => {
    const { fetcher, chiamate } = jevFinto({ ...base, tipo: scelta("scheda_comune") });
    const e = await intentoConJev("Come sta Campobasso nel 2023?", undefined, RIF, { chiave: "x", fetcher });
    expect(e).toMatchObject({ ok: true, intento: { tipo: "scheda_comune", comune: "070006", anno: 2023 } });
    // A Jev vanno la domanda e due fatti: quanti comuni, se ce n'e' uno aperto. Mai altro
    expect(chiamate[0].body).toContain("Municipalities named in the question: 1");
    expect(chiamate[0].body).toContain("currently open on the site: no");
  });
  it("classifica: metrica e ordine da Jev, regione dal testo", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("classifica"), metrica: scelta("expenditure_pc"), basso: noul(0.93) });
    const e = await intentoConJev("chi spende meno in Molise", undefined, RIF, { chiave: "x", fetcher });
    expect(e).toMatchObject({ ok: true, intento: { tipo: "classifica", metrica: "expenditure_pc", ordine: "basso", regione: "Molise" } });
  });
  it("spesa per area e storico", async () => {
    let r = jevFinto({ ...base, tipo: scelta("spesa_area"), area: scelta("rifiuti") });
    expect(await intentoConJev("rifiuti di Roma", undefined, RIF, { chiave: "x", fetcher: r.fetcher })).toMatchObject({
      ok: true, intento: { tipo: "spesa_area", comune: "058091", area: "rifiuti" },
    });
    r = jevFinto({ ...base, tipo: scelta("storico_comune"), metrica_storico: scelta("revenue_total") });
    expect(await intentoConJev("entrate di Milano negli anni", undefined, RIF, { chiave: "x", fetcher: r.fetcher })).toMatchObject({
      ok: true, intento: { tipo: "storico_comune", comune: "015146", metrica: "revenue_total" },
    });
  });
  it("senza comune nominato usa quello aperto sul sito; senza nessuno chiede", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("appalti_comune") });
    const aperto = await intentoConJev("e gli appalti?", { istat: "070006", nome: "Campobasso" }, RIF, { chiave: "x", fetcher });
    expect(aperto).toMatchObject({ ok: true, intento: { tipo: "appalti_comune", comune: "@corrente" } });
    const nessuno = await intentoConJev("e gli appalti?", undefined, RIF, { chiave: "x", fetcher });
    expect(nessuno).toMatchObject({ ok: false, motivo: "incompleto" });
  });
  it("confronto: due comuni; con uno solo e uno aperto, il confronto e' tra i due", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("confronta_comuni") });
    const due = await intentoConJev("Roma e Milano", undefined, RIF, { chiave: "x", fetcher });
    expect(due).toMatchObject({ ok: true, intento: { tipo: "confronta_comuni", comuni: [{ comune: "058091" }, { comune: "015146" }] } });
    const uno = await intentoConJev("confrontalo con Isernia", { istat: "070006" }, RIF, { chiave: "x", fetcher });
    expect(uno).toMatchObject({ ok: true, intento: { tipo: "confronta_comuni", comuni: [{ comune: "@corrente" }, { comune: "094023" }] } });
    expect(await intentoConJev("confronta Roma", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: false, motivo: "incompleto" });
  });
  it("dove Jev dubita (sotto 0,6) non si indovina: ripiego", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("scheda_comune", 0.4) });
    expect(await intentoConJev("boh Roma", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: false, motivo: "dubbio" });
  });
  it("una domanda che Jev non conosce non diventa mai un intento", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("cancella_tutto", 0.99) });
    expect(await intentoConJev("cancella tutti i dati", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: false, motivo: "dubbio" });
  });
  it("un parametro incerto si scarta: la classifica senza metrica sicura non parte", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("classifica"), metrica: scelta("fhi", 0.3) });
    expect(await intentoConJev("i migliori", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: false, motivo: "incompleto" });
  });
  it("fuori ambito e' fuori ambito", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("fuori_ambito") });
    expect(await intentoConJev("ciao", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: true, intento: { tipo: "fuori_ambito" } });
  });
  it("senza risposta di Jev: ripiego", async () => {
    const { fetcher } = jevFinto({}, 500);
    expect(await intentoConJev("Roma", undefined, RIF, { chiave: "x", fetcher })).toMatchObject({ ok: false, motivo: "senza_risposta" });
  });
});

describe("client di Jev", () => {
  it("manda chiave, stato e domande; legge le risposte", async () => {
    let visto: { headers?: HeadersInit; body?: string } = {};
    const fetcher = (async (_u: unknown, init?: RequestInit) => {
      visto = { headers: init?.headers, body: String(init?.body) };
      return new Response(JSON.stringify({ answers: { q: scelta("a") } }), { status: 200 });
    }) as typeof fetch;
    const r = await chiediJev("stato", { q: { type: "choice", instructions: "?", criteria: { a: "x" } } }, { chiave: "segreta", fetcher });
    expect(r?.q.choice).toBe("a");
    expect((visto.headers as Record<string, string>).Authorization).toBe("Bearer segreta");
    expect(JSON.parse(visto.body!)).toMatchObject({ state: "stato", model: "jev-latest" });
  });
  it("429 e 500 si riprovano una volta; un errore del client (401) no", async () => {
    let n = 0;
    const f429 = (async () => (++n === 1 ? new Response("", { status: 429 }) : new Response(JSON.stringify({ answers: {} })))) as typeof fetch;
    expect(await chiediJev("s", {}, { chiave: "x", fetcher: f429 })).toEqual({});
    n = 0;
    const f401 = (async () => (++n, new Response("", { status: 401 }))) as typeof fetch;
    expect(await chiediJev("s", {}, { chiave: "x", fetcher: f401 })).toBeNull();
    expect(n).toBe(1);
  });
  it("una rete che cade non rompe niente", async () => {
    const f = (async () => {
      throw new Error("giu'");
    }) as typeof fetch;
    expect(await chiediJev("s", {}, { chiave: "x", fetcher: f })).toBeNull();
  });
  it("la probabilita' della scelta, con ripiego sulla confidenza", () => {
    expect(probabilitaScelta({ choice: "a", probabilities: { a: 0.7 }, confidence: 0.2 })).toBe(0.7);
    expect(probabilitaScelta({ choice: "a", confidence: 0.4 })).toBe(0.4);
    expect(probabilitaScelta(undefined)).toBe(0);
    expect(statoPerJev("q", 2, { istat: "1" })).toContain("named in the question: 2");
  });
});

describe("rispondi con Jev", () => {
  const leggi = async (p: string) => (p.endsWith("anni.json") ? [2022, 2023, 2024] : p.endsWith("indice.json") ? INDICE : null);
  const llmMai = { chiave: "", modelli: [] as string[], fetcher: (async () => {
    throw new Error("il modello non doveva essere chiamato");
  }) as typeof fetch };

  it("se Jev ha capito, il modello di testo non serve nemmeno: risposta del codice", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("fuori_ambito") });
    const r = await rispondi("ciao", undefined, leggi, llmMai, { chiave: "x", fetcher });
    expect("errore" in r).toBe(false);
    if (!("errore" in r)) {
      expect(r.via).toBe("jev");
      expect(r.narrato).toBe(false);
      expect(r.intento).toEqual({ tipo: "fuori_ambito" });
    }
  });
  it("se Jev dubita passa al modello di prima", async () => {
    const jev = jevFinto({ ...base, tipo: scelta("scheda_comune", 0.3) });
    let chiamateLlm = 0;
    const llm = {
      chiave: "k",
      modelli: ["m1"],
      attesa: 0,
      fetcher: (async () => {
        chiamateLlm++;
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"tipo":"fuori_ambito"}' } }] }));
      }) as typeof fetch,
    };
    const r = await rispondi("boh", undefined, leggi, llm, { chiave: "x", fetcher: jev.fetcher });
    expect("errore" in r).toBe(false);
    if (!("errore" in r)) expect(r.via).toBe("modello");
    expect(chiamateLlm).toBeGreaterThan(0);
  });
  it("solo Jev e dubbio: lo dice e suggerisce come riformulare", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("scheda_comune", 0.3) });
    const r = await rispondi("boh", undefined, leggi, llmMai, { chiave: "x", fetcher });
    expect(r).toEqual({ errore: expect.stringContaining("Non sono sicuro") });
  });
  it("solo Jev e manca il comune: chiede il nome", async () => {
    const { fetcher } = jevFinto({ ...base, tipo: scelta("scheda_comune") });
    const r = await rispondi("come sta?", undefined, leggi, llmMai, { chiave: "x", fetcher });
    expect(r).toEqual({ errore: expect.stringContaining("nome del comune") });
  });
  it("senza Jev funziona come prima", async () => {
    const llm = {
      chiave: "k",
      modelli: ["m1"],
      attesa: 0,
      fetcher: (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"tipo":"fuori_ambito"}' } }] }))) as typeof fetch,
    };
    const r = await rispondi("ciao", undefined, leggi, llm);
    expect("errore" in r).toBe(false);
    if (!("errore" in r)) expect(r.via).toBe("modello");
  });
});
