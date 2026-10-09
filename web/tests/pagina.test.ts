import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  esc,
  istatDaSlug,
  llmsTxt,
  paginaComune,
  paginaElenco,
  robots,
  sitemap,
  slugComune,
  type DatiComune,
  type VoceComune,
} from "../lib/pagina/comune";
import { _azzeraIndice, soloLettura, serviComune, serviElenco, serviLlms, serviRobots, serviSitemap, type Assets } from "../lib/pagina/serve";

const O = "https://parimetro.test";
const VOCE: VoceComune = { istat: "070006", name: "Campobasso", region: "Molise", province: "Campobasso", population: 47418, lon: 14.659, lat: 41.565 };
const ALTRA: VoceComune = { istat: "075099", name: "Castro", region: "Puglia", province: "Lecce", population: 2300, lon: 18.4, lat: 40.0 };

const DATI: DatiComune = {
  history: [
    { year: 2023, revenue_pc: 1500, expenditure_pc: 1600, autonomia: 65, fhi: 10 },
    { year: 2024, revenue_pc: 1571.88, expenditure_pc: 1751.02, autonomia: 67.3, fhi: 3 },
  ],
  peers: { "2024": { fascia: "da 20.000 a 60.000 abitanti", n: 414, revenue_pc: 1142.86, expenditure_pc: 1123.2, pct_expenditure: 91 } },
  categorie: {
    "2022": null,
    "2024": {
      aree: [
        { area: "strade_trasporti", pc: 208.41, importo: 9_882_413, mediana_pc: 60.68 },
        { area: "rifiuti", pc: 185.01, importo: 8_772_771, mediana_pc: 179.81 },
      ],
    },
  },
  reddito: { "2024": { contribuenti: 34607, medio: 22991, pc: 16779, addizionale_media: 174, rango: 54, n_simili: 414, mediana_simili: 22605 } },
  investimenti: {
    pnrr: { n: 45, fin_pnrr: 47_647_177, fin_totale: 60_000_000, pc: 1005, mediana_pc: 300, rango: 99, n_simili: 414, conclusi: 3, missioni: [], progetti: [] },
    coesione: { opere: { n: 12, fin: 8_000_000, pagamenti: 5_000_000, pc: 400, mediana_pc: 700, rango: 30, n_simili: 414, stati: {}, cicli: [], progetti: [] }, altri: {} },
  } as unknown as DatiComune["investimenti"],
  appalti: {
    anni: { "2025": { n: 339, n_per_1000: 7.1, n_diretti: 314, quota_diretti: 92.6, mediana_quota_diretti: 89.4, rango_diretti: 72, n_simili: 409, n_adesioni: 0, n_aperte: 5, quota_piattaforma: null, n_pnrr: 10, importo: 25_819_628, importo_diretti: 9_000_000, importo_mediano: 17_440, n_importo_anomalo: 0, n_senza_importo: 3 } },
    tipi: {}, famiglie: {}, maggiori: [],
  },
  concorrenza: { "2025": { n_gare: 13, n_con_offerte: 11, n_offerta_unica: 5, quota_offerta_unica: 45.5, mediana_quota_offerta_unica: 25, rango_offerta_unica: 83, n_simili: 141, offerte_mediane: 2, ribasso_mediano: 5.5 } },
  notizie: { raccolta_il: "2026-10-03", notizie: [{ titolo: "Campobasso, approvata la variazione di bilancio", fonte: "molisenetwork.net", data: "2026-05-20", url: "https://www.molisenetwork.net/x" }] },
};

describe("indirizzi", () => {
  it("lo slug ha il nome senza accenti e il codice ISTAT", () => {
    expect(slugComune("Campobasso", "070006")).toBe("campobasso-070006");
    expect(slugComune("Sant'Agata de' Goti", "062067")).toBe("sant-agata-de-goti-062067");
    expect(slugComune("Forlì", "040012")).toBe("forli-040012");
    expect(slugComune("Chienes/Kiens", "021019")).toBe("chienes-kiens-021019");
  });
  it("dal codice in coda si ritrova l'ISTAT", () => {
    expect(istatDaSlug("campobasso-070006")).toBe("070006");
    expect(istatDaSlug("070006")).toBe("070006");
    expect(istatDaSlug("campobasso")).toBeNull();
    expect(istatDaSlug("campobasso-7006")).toBeNull();
    expect(istatDaSlug("campobasso-0700061")).toBeNull();
  });
});

describe("pagina di un comune", () => {
  const p = paginaComune(VOCE, DATI, O);

  it("ha titolo, descrizione e indirizzo canonico propri del comune", () => {
    expect(p.title).toContain("Comune di Campobasso (Campobasso)");
    expect(p.description).toContain("Molise");
    expect(p.description).toContain("1751 €");
    expect(p.html).toContain(`<link rel="canonical" href="${O}/comune/campobasso-070006">`);
    expect(p.html).toContain('<html lang="it">');
  });
  it("dice i numeri con il contesto dei comuni simili", () => {
    expect(p.html).toContain("47.418 abitanti");
    expect(p.html).toContain("è più alta della mediana dei comuni simili (1123 €)");
    expect(p.html).toContain("Supera la spesa del 91% dei 414 comuni");
    expect(p.html).toContain("dati di cassa");
  });
  it("ha la tabella anno per anno e la spesa per categoria in ordine", () => {
    expect(p.html).toContain("<th scope=\"row\">2023</th>");
    expect(p.html.indexOf("Strade, illuminazione e trasporti")).toBeLessThan(p.html.indexOf("Rifiuti e igiene urbana"));
  });
  it("riporta reddito, PNRR, appalti e concorrenza", () => {
    expect(p.html).toContain("22.991 €");
    expect(p.html).toContain("in linea con la mediana dei comuni simili (22.605 €)");
    expect(p.html).toContain("45 progetti PNRR");
    expect(p.html).toContain("12 opere pubbliche");
    expect(p.html).toContain("339 lotti");
    expect(p.html).toContain("il 45,5% ha ricevuto una sola offerta");
  });
  it("non presenta il rango come un voto e avverte sui limiti", () => {
    expect(p.html).not.toMatch(/\bposto\b|\bvoto\b|classifica generale/i);
    expect(p.html).toContain("Dal 2024 la rilevazione ANAC cambia");
    expect(p.html).toContain("non verificata da Parimetro");
  });
  it("ha i dati strutturati validi, con licenza e link ai dati grezzi", () => {
    const m = p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)!;
    const g = JSON.parse(m[1]);
    const tipi = g["@graph"].map((x: { "@type": string }) => x["@type"]);
    expect(tipi).toEqual(["Place", "Dataset"]);
    expect(g["@graph"][1].license).toContain("by-sa/4.0");
    expect(g["@graph"][1].distribution.contentUrl).toBe(`${O}/dati/comune/070006.json`);
    expect(g["@graph"][0].geo.latitude).toBe(41.565);
  });
  it("rimanda alla mappa interattiva", () => {
    expect(p.html).toContain(`href="${O}/mappa?comune=070006"`);
  });
  it("in breve: riassume confronto e voce piu' pesante, prima dei conti", () => {
    const breve = p.html.indexOf('<section class="breve">');
    expect(breve).toBeGreaterThan(-1);
    expect(breve).toBeLessThan(p.html.indexOf("<h2>Entrate e spese</h2>"));
    expect(p.html).toContain("comuni simili");
  });
  it("avvertenze in primo piano, prima della tabella dei conti", () => {
    const avv = p.html.indexOf('<aside class="avvertenze">');
    expect(avv).toBeGreaterThan(-1);
    expect(avv).toBeLessThan(p.html.indexOf("<h2>Entrate e spese</h2>"));
    expect(p.html).toContain("Non è un giudizio sull&#39;amministrazione".replace("&#39;", "'"));
  });
  it("parole da sapere e link al metodo", () => {
    expect(p.html).toContain("<h2>Parole da sapere</h2>");
    expect(p.html).toContain("<dt>Mediana</dt>");
    expect(p.html).toContain(`href="${O}/metodo"`);
  });
  it("niente frasi di tono approssimativo nella sezione spesa", () => {
    expect(p.html).not.toContain("nessuna è indovinata");
  });
  it("avverte quando una sola voce pesa piu' del 40% della spesa (investimento isolato)", () => {
    const concentrata = paginaComune(
      VOCE,
      { ...DATI, categorie: { "2024": { totale: 10_000_000, aree: [], voci: [{ descrizione: "Costruzione edifici scolastici", importo: 6_000_000 }] } } },
      O,
    );
    expect(concentrata.html).toContain("Attenzione:");
    expect(concentrata.html).toContain("60%");
    expect(concentrata.html).toContain("Costruzione edifici scolastici");
    const normale = paginaComune(
      VOCE,
      { ...DATI, categorie: { "2024": { totale: 10_000_000, aree: [], voci: [{ descrizione: "Stipendi", importo: 2_000_000 }] } } },
      O,
    );
    expect(normale.html).not.toContain("Attenzione:");
  });
  it("con pochi contribuenti avverte che la media e' instabile", () => {
    const poche = paginaComune(VOCE, { ...DATI, reddito: { "2024": { ...DATI.reddito!["2024"], contribuenti: 40 } } }, O);
    expect(poche.html).toContain("la media è instabile");
    expect(p.html).not.toContain("la media è instabile");
  });
  it("un comune senza dati accessori ha comunque una pagina onesta", () => {
    const vuota = paginaComune(ALTRA, { history: [] }, O);
    expect(vuota.html).toContain("non ci sono ancora dati di bilancio");
    expect(vuota.html).not.toContain("<h2>Appalti</h2>");
  });
  it("niente dati fuori posto: nessun segnaposto rimasto", () => {
    expect(p.html).not.toMatch(/undefined|NaN|\[object/);
  });
  it("il testo dei dati e' neutralizzato: un titolo di notizia non puo' iniettare HTML", () => {
    const cattivo = paginaComune(
      VOCE,
      { ...DATI, notizie: { raccolta_il: "2026-10-03", notizie: [{ titolo: '<script>alert(1)</script>"', fonte: "x.it", data: "2026-05-20", url: "javascript:alert(1)" }] } },
      O,
    );
    expect(cattivo.html).not.toContain("<script>alert");
    expect(cattivo.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(cattivo.html).not.toContain('href="javascript:');
    expect(esc('a<b>"c"&')).toBe("a&lt;b&gt;&quot;c&quot;&amp;");
  });
});

describe("elenco, sitemap, robots, llms.txt", () => {
  const indice = [VOCE, ALTRA];
  it("l'elenco ha un link per comune, per regione", () => {
    const h = paginaElenco(indice, O);
    expect(h).toContain(`href="${O}/comune/campobasso-070006"`);
    expect(h).toContain(`href="${O}/comune/castro-075099"`);
    expect(h).toContain("<h2 id=\"molise\">Molise</h2>");
  });
  it("la sitemap elenca home, mappa, elenco, privacy e ogni comune con indirizzo assoluto", () => {
    const s = sitemap(indice, O);
    expect(s).toContain(`<loc>${O}/</loc>`);
    expect(s).toContain(`<loc>${O}/mappa</loc>`);
    expect(s).toContain(`<loc>${O}/comuni</loc>`);
    expect(s).toContain(`<loc>${O}/privacy</loc>`);
    expect(s).toContain(`<loc>${O}/comune/castro-075099</loc>`);
    expect((s.match(/<url>/g) ?? []).length).toBe(6);
  });
  it("robots indica la sitemap e tiene fuori l'API", () => {
    const r = robots(O);
    expect(r).toContain(`Sitemap: ${O}/sitemap.xml`);
    expect(r).toContain("Disallow: /api/");
  });
  it("llms.txt spiega cosa c'e' e le cautele sui dati", () => {
    const t = llmsTxt(O, 7896);
    expect(t.startsWith("# Parimetro")).toBe(true);
    expect(t).toContain("7896 comuni");
    expect(t).toContain("dati di CASSA");
    expect(t).toContain(`${O}/comune/campobasso-070006`);
  });
});

describe("le funzioni", () => {
  const FILE: Record<string, unknown> = { "/dati/indice.json": [VOCE, ALTRA], "/dati/comune/070006.json": DATI };
  const assets: Assets = {
    fetch: async (req) => {
      const f = FILE[new URL(req.url).pathname];
      return f === undefined ? new Response("no", { status: 404 }) : new Response(JSON.stringify(f), { status: 200 });
    },
  };
  const req = (p: string) => new Request(`${O}${p}`);
  beforeEach(() => _azzeraIndice());

  it("serve la pagina di un comune con HTML e cache", async () => {
    const r = await serviComune(req("/comune/campobasso-070006"), assets, "campobasso-070006");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/html");
    expect(r.headers.get("Cache-Control")).toContain("s-maxage");
    expect(await r.text()).toContain("Bilancio del Comune di Campobasso");
  });
  it("un nome sbagliato nell'indirizzo rimanda a quello vero (301)", async () => {
    const r = await serviComune(req("/comune/boh-070006"), assets, "boh-070006");
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe(`${O}/comune/campobasso-070006`);
  });
  it("un codice che non esiste e' 404 e non va indicizzato", async () => {
    for (const slug of ["zzz-999999", "nulla", "castro-075099"]) {
      const r = await serviComune(req(`/comune/${slug}`), assets, slug);
      expect(r.status).toBe(404);
      expect(await r.text()).toContain('content="noindex"');
    }
  });
  it("HEAD ha le stesse intestazioni e nessun corpo; gli altri metodi sono 405", async () => {
    const get = await soloLettura(req("/comune/campobasso-070006"), () => serviComune(req("/comune/campobasso-070006"), assets, "campobasso-070006"));
    const testa = await soloLettura(new Request(`${O}/comune/campobasso-070006`, { method: "HEAD" }), () =>
      serviComune(req("/comune/campobasso-070006"), assets, "campobasso-070006"),
    );
    expect(testa.status).toBe(200);
    expect(testa.headers.get("Content-Type")).toBe(get.headers.get("Content-Type"));
    expect(await testa.text()).toBe("");
    const post = await soloLettura(new Request(`${O}/comuni`, { method: "POST" }), () => serviElenco(req("/comuni"), assets));
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD");
  });
  it("sitemap, robots, llms.txt ed elenco rispondono", async () => {
    expect(await (await serviSitemap(req("/sitemap.xml"), assets)).text()).toContain("<urlset");
    expect(await (await serviRobots(req("/robots.txt"))).text()).toContain(`Sitemap: ${O}/sitemap.xml`);
    expect(await (await serviLlms(req("/llms.txt"), assets)).text()).toContain("2 comuni");
    expect(await (await serviElenco(req("/comuni"), assets)).text()).toContain("Tutti i comuni italiani");
  });
});

// Con i dati veri (solo dove l'export e' presente): ogni pagina deve reggere i casi sporchi
describe.skipIf(!existsSync("public/dati/indice.json"))("sui dati veri", () => {
  it("Campobasso, un paese minuscolo e un comune senza dati accessori producono pagine complete", () => {
    const indice = JSON.parse(readFileSync("public/dati/indice.json", "utf8")) as VoceComune[];
    const prova = [indice.find((v) => v.istat === "070006")!, indice.find((v) => v.population < 120)!, indice[0]];
    for (const v of prova) {
      const d = JSON.parse(readFileSync(`public/dati/comune/${v.istat}.json`, "utf8")) as DatiComune;
      const p = paginaComune(v, d, O);
      expect(p.html).not.toMatch(/undefined|NaN|\[object/);
      expect(p.html).toContain("<h1>");
      JSON.parse(p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    }
  });
});
