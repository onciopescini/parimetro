// La pagina di un comune pensata per essere letta da motori di ricerca e da assistenti AI: testo vero nell'HTML,
// numeri con il loro contesto, dati strutturati. E' una funzione pura (dati -> HTML) cosi' si prova con dei test;
// la serve functions/comune/[slug].ts leggendo gli stessi JSON che usa la mappa.
//
// Principi: solo cio' che i dati dicono, con le stesse cautele della mappa (il "rango" e' una posizione fra i
// simili, non un voto; sotto 100 contribuenti la media del reddito e' instabile; gli importi dei lotti sono a
// base di gara). Niente giudizi.

import { AREE } from "../categorie";
import { senzaAccenti } from "../dati";
import type { Appalti, Concorrenza } from "../appalti";
import type { Investimenti } from "../investimenti";
import type { NotizieComune } from "../notizie";
import { pochiContribuenti, type RedditoAnno } from "../reddito";

export interface VoceComune {
  istat: string;
  name: string;
  region: string;
  province: string;
  population: number;
  lon: number;
  lat: number;
}

interface RigaStorico {
  year: number;
  revenue_pc: number | null;
  expenditure_pc: number | null;
  autonomia: number | null;
  fhi: number | null;
}

interface Simili {
  fascia: string;
  n: number;
  revenue_pc: number | null;
  expenditure_pc: number | null;
  pct_expenditure: number | null;
}

interface AreaDati {
  area: string;
  pc: number | null;
  importo: number | null;
  mediana_pc: number | null;
}

export interface DatiComune {
  history: RigaStorico[];
  peers?: Record<string, Simili | null>;
  categorie?: Record<string, { aree: AreaDati[] } | null>;
  reddito?: Record<string, RedditoAnno> | null;
  investimenti?: Investimenti | null;
  appalti?: Appalti | null;
  concorrenza?: Concorrenza | null;
  notizie?: NotizieComune | null;
}

// ---------------------------------------------------------------- indirizzi
/** "campobasso-070006": il nome serve a chi legge l'indirizzo, il codice ISTAT a trovare i dati. */
export function slugComune(nome: string, istat: string): string {
  const base = senzaAccenti(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base}-${istat}`;
}

/** Il codice ISTAT in coda a un indirizzo ("campobasso-070006" o solo "070006"); null se non c'e'. */
export function istatDaSlug(slug: string): string | null {
  const m = slug.match(/(?:^|-)(\d{6})$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- formati
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const n0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "n.d." : nf.format(v));
const eur = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "n.d." : `${nf.format(v)} €`);
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "n.d." : `${nf1.format(v)}%`);
const mln = (v: number | null | undefined) =>
  v == null ? "n.d." : Math.abs(v) >= 1e6 ? `${nf1.format(v / 1e6)} milioni di €` : eur(v);

const dataIt = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
};

/** "più alta della mediana" / "più bassa della mediana" / "in linea con la mediana", con tolleranza del 3%. */
function rispettoAllaMediana(v: number | null, rif: number | null, maschile = false): string | null {
  if (v == null || rif == null || rif === 0) return null;
  const r = v / rif - 1;
  if (Math.abs(r) < 0.03) return "in linea con la mediana";
  const aggettivo = r > 0 ? (maschile ? "alto" : "alta") : maschile ? "basso" : "bassa";
  return `più ${aggettivo} della mediana`;
}

const ultimo = <T>(o: Record<string, T> | null | undefined): [string, T] | null => {
  const k = Object.keys(o ?? {}).sort();
  return k.length ? [k[k.length - 1], o![k[k.length - 1]]] : null;
};

// ---------------------------------------------------------------- contenuto
export interface Pagina {
  title: string;
  description: string;
  html: string;
}

export function paginaComune(v: VoceComune, d: DatiComune, origine: string): Pagina {
  const url = `${origine}/comune/${slugComune(v.name, v.istat)}`;
  const mappa = `${origine}/?comune=${v.istat}`;
  const storico = (d.history ?? []).filter((r) => r.expenditure_pc != null || r.revenue_pc != null);
  const ult = storico.length ? storico[storico.length - 1] : null;
  const simili = ult ? d.peers?.[String(ult.year)] ?? null : null;

  // -------- descrizione breve (meta description e prima frase)
  let spesaFrase = "";
  if (ult?.expenditure_pc != null) {
    spesaFrase = `Nel ${ult.year} ha speso ${eur(ult.expenditure_pc)} per abitante`;
    if (simili?.expenditure_pc != null) spesaFrase += `, contro una mediana di ${eur(simili.expenditure_pc)} dei comuni simili`;
    spesaFrase += ".";
  }
  const title = `Bilancio del Comune di ${v.name} (${v.province}): entrate e spese per abitante | Parimetro`;
  const description =
    `${v.name} (${v.region}), ${n0(v.population)} abitanti. ${spesaFrase} Entrate, spesa per categoria, reddito dei residenti, ` +
    `PNRR e appalti, confrontati con i comuni della stessa fascia.`.replace(/\s+/g, " ");

  const sezioni: string[] = [];

  // -------- conti
  if (ult) {
    const righe: string[] = [];
    righe.push(
      `<p>${esc(v.name)} è un comune di ${n0(v.population)} abitanti in provincia di ${esc(v.province)} (${esc(v.region)}). ` +
        `Nel ${ult.year} ha incassato ${eur(ult.revenue_pc)} e pagato ${eur(ult.expenditure_pc)} per abitante ` +
        `(dati di cassa SIOPE: incassi e pagamenti, non accertamenti e impegni).</p>`,
    );
    if (simili) {
      const c = rispettoAllaMediana(ult.expenditure_pc, simili.expenditure_pc);
      const posiz =
        simili.pct_expenditure != null
          ? ` Supera la spesa del ${simili.pct_expenditure}% dei ${n0(simili.n)} comuni della sua fascia demografica (${esc(simili.fascia)}).`
          : "";
      if (c) {
        righe.push(`<p>La spesa per abitante è ${c} dei comuni simili (${eur(simili.expenditure_pc)}).${posiz}</p>`);
      }
    }
    if (ult.autonomia != null) {
      righe.push(`<p>L'autonomia finanziaria, cioè la quota delle entrate correnti che il comune raccoglie da sé, è ${pct(ult.autonomia)}.</p>`);
    }
    sezioni.push(`<h2>Entrate e spese</h2>${righe.join("")}`);

    sezioni.push(
      `<table><caption>Entrate e spese per abitante, anno per anno (euro, dati di cassa)</caption>` +
        `<thead><tr><th scope="col">Anno</th><th scope="col">Entrate</th><th scope="col">Spese</th><th scope="col">Autonomia</th></tr></thead><tbody>` +
        storico
          .map(
            (r) =>
              `<tr><th scope="row">${r.year}</th><td>${eur(r.revenue_pc)}</td><td>${eur(r.expenditure_pc)}</td><td>${pct(r.autonomia)}</td></tr>`,
          )
          .join("") +
        `</tbody></table>`,
    );
  }

  // -------- spesa per categoria
  const cat = ultimo(d.categorie ? Object.fromEntries(Object.entries(d.categorie).filter(([, x]) => x)) : null);
  if (cat?.[1]?.aree?.length) {
    const aree = [...cat[1].aree].filter((a) => a.pc != null).sort((a, b) => (b.pc ?? 0) - (a.pc ?? 0)).slice(0, 8);
    sezioni.push(
      `<h2>In cosa spende</h2><p>Le voci di spesa principali nel ${esc(cat[0])}, per abitante, confrontate con la mediana dei comuni simili. ` +
        `Le voci generiche restano in «Non attribuibile»: nessuna è indovinata.</p>` +
        `<table><thead><tr><th scope="col">Area</th><th scope="col">Per abitante</th><th scope="col">Mediana dei simili</th></tr></thead><tbody>` +
        aree
          .map((a) => `<tr><th scope="row">${esc(AREE[a.area] ?? a.area)}</th><td>${eur(a.pc)}</td><td>${eur(a.mediana_pc)}</td></tr>`)
          .join("") +
        `</tbody></table>`,
    );
  }

  // -------- reddito
  const red = ultimo(d.reddito ?? null);
  if (red?.[1]?.medio != null) {
    const r = red[1];
    const c = rispettoAllaMediana(r.medio, r.mediana_simili, true);
    sezioni.push(
      `<h2>Reddito dei residenti</h2><p>Il reddito imponibile medio dei contribuenti IRPEF è ${eur(r.medio)} (anno d'imposta ${esc(red[0])}, ${n0(r.contribuenti)} contribuenti)` +
        (c && r.mediana_simili != null ? `, ${c} dei comuni simili (${eur(r.mediana_simili)})` : "") +
        `.` +
        (pochiContribuenti(r.contribuenti)
          ? ` Con così pochi contribuenti la media è instabile: due redditi alti bastano a spostarla.`
          : "") +
        `</p>`,
    );
  }

  // -------- PNRR e coesione
  const inv = d.investimenti;
  if (inv && (inv.pnrr.n > 0 || inv.coesione?.opere?.n > 0)) {
    const t: string[] = [];
    if (inv.pnrr.n > 0) {
      t.push(
        `${n0(inv.pnrr.n)} progetti PNRR di cui il comune è soggetto attuatore, per ${mln(inv.pnrr.fin_pnrr)} di finanziamento PNRR (${eur(inv.pnrr.pc)} per abitante)`,
      );
    }
    if (inv.coesione?.opere?.n > 0) {
      t.push(
        `${n0(inv.coesione.opere.n)} opere pubbliche finanziate dalle politiche di coesione sul suo territorio, per ${mln(inv.coesione.opere.fin)}`,
      );
    }
    sezioni.push(
      `<h2>PNRR e fondi di coesione</h2><p>Risultano ${t.join("; ")}.</p>` +
        `<p class="nota">Il PNRR è attribuito solo ai progetti in cui l'attuatore è il comune stesso; i progetti di regioni o enti nazionali non si assegnano a un comune.</p>`,
    );
  }

  // -------- appalti e concorrenza
  const app = d.appalti ? ultimo(d.appalti.anni) : null;
  if (app) {
    const [anno, a] = app;
    const conc = d.concorrenza?.[anno] ?? null;
    let p = `<p>Nel ${esc(anno)} il comune ha pubblicato ${n0(a.n)} lotti di appalto (CIG)`;
    if (a.quota_diretti != null) {
      p += `, il ${pct(a.quota_diretti)} dei quali affidati direttamente`;
      if (a.mediana_quota_diretti != null) p += ` (mediana dei comuni simili: ${pct(a.mediana_quota_diretti)})`;
    }
    p += `.`;
    if (conc?.quota_offerta_unica != null) {
      p += ` Tra le gare aggiudicate (procedure aperte, ristrette e negoziate), il ${pct(conc.quota_offerta_unica)} ha ricevuto una sola offerta` +
        (conc.mediana_quota_offerta_unica != null ? ` (mediana dei simili: ${pct(conc.mediana_quota_offerta_unica)})` : "") +
        `, con un ribasso mediano ${conc.ribasso_mediano != null ? `del ${pct(conc.ribasso_mediano)}` : "non disponibile"}.`;
    }
    p += `</p>`;
    sezioni.push(
      `<h2>Appalti</h2>${p}` +
        `<p class="nota">Solo i lotti banditi dal comune stesso, non quelli di centrali di committenza o società partecipate. ` +
        `Dal 2024 la rilevazione ANAC cambia: lotti e quota di affidamenti diretti non sono confrontabili con gli anni prima.</p>`,
    );
  }

  // -------- notizie
  if (d.notizie && d.notizie.notizie.length) {
    sezioni.push(
      `<h2>Notizie sui conti</h2><ul>` +
        d.notizie.notizie
          .map((n) => {
            let u = "";
            try {
              const x = new URL(n.url);
              if (x.protocol === "https:" || x.protocol === "http:") u = x.href;
            } catch {
              /* link non valido: si mostra solo il titolo */
            }
            return `<li>${u ? `<a href="${esc(u)}" rel="noopener noreferrer nofollow">${esc(n.titolo)}</a>` : esc(n.titolo)} <span class="nota">${esc(n.fonte)} · ${esc(dataIt(n.data))}</span></li>`;
          })
          .join("") +
        `</ul><p class="nota">Selezione automatica per parole chiave, non verificata da Parimetro. Ultima ricerca: ${esc(dataIt(d.notizie.raccolta_il))}.</p>`,
    );
  }

  // -------- dati strutturati
  const grafo = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Place",
        "@id": `${url}#luogo`,
        name: `Comune di ${v.name}`,
        address: { "@type": "PostalAddress", addressLocality: v.name, addressRegion: v.region, addressCountry: "IT" },
        geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lon },
      },
      {
        "@type": "Dataset",
        "@id": `${url}#dati`,
        name: `Entrate e spese del Comune di ${v.name}`,
        description: description,
        url,
        spatialCoverage: { "@id": `${url}#luogo` },
        isAccessibleForFree: true,
        license: "https://creativecommons.org/licenses/by-sa/4.0/",
        inLanguage: "it",
        isBasedOn: ["https://www.siope.it", "https://www.istat.it", "https://dati.anticorruzione.it/opendata"],
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${origine}/dati/comune/${v.istat}.json`,
        },
      },
    ],
  };
  const jsonld = JSON.stringify(grafo).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="it_IT">
<meta property="og:site_name" content="Parimetro">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${jsonld}</script>
<style>
:root{--fg:#0f172a;--bg:#f8fafc;--mut:#475569;--line:#cbd5e1;--link:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--fg:#e2e8f0;--bg:#0b1220;--mut:#94a3b8;--line:#334155;--link:#7dd3fc}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main,header,footer{max-width:46rem;margin:0 auto;padding:0 1rem}
header{padding-top:1rem}a{color:var(--link)}h1{font-size:1.6rem;line-height:1.25}h2{font-size:1.2rem;margin-top:2rem}
table{border-collapse:collapse;width:100%;font-size:.92rem;margin:1rem 0}caption{text-align:left;color:var(--mut);padding-bottom:.4rem}
th,td{border-bottom:1px solid var(--line);padding:.35rem .5rem;text-align:right}th[scope=row],thead th:first-child{text-align:left}
.nota{color:var(--mut);font-size:.88rem}.cta{display:inline-block;margin:.5rem 0 1rem;padding:.5rem 1rem;border:1px solid var(--link);border-radius:.5rem;text-decoration:none}
footer{padding-bottom:3rem;color:var(--mut);font-size:.88rem}
</style>
</head>
<body>
<header><a href="${esc(origine)}/">Parimetro</a> · <a href="${esc(origine)}/comuni">Tutti i comuni</a></header>
<main>
<h1>Bilancio del Comune di ${esc(v.name)} (${esc(v.province)}): entrate e spese per abitante</h1>
<a class="cta" href="${esc(mappa)}">Apri nella mappa 3D interattiva</a>
${sezioni.length ? sezioni.join("\n") : `<p>Per questo comune non ci sono ancora dati di bilancio nella banca dati.</p>`}
</main>
<footer>
<p>Fonti: ISTAT (confini e popolazione), SIOPE/BDAP (incassi e pagamenti), MEF (IRPEF), Italia Domani e OpenCoesione, ANAC (appalti, licenza CC BY-SA 4.0).
I dati pubblicati da Parimetro sono offerti sotto licenza <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it">CC BY-SA 4.0</a>;
il codice è MIT. Contabilità di cassa: incassi e pagamenti, non accertamenti e impegni. I confronti sono con i comuni della stessa fascia di popolazione.</p>
<p><a href="${esc(origine)}/dati/comune/${esc(v.istat)}.json" rel="nofollow">Scarica i dati di questo comune (JSON)</a></p>
</footer>
</body>
</html>`;

  return { title, description, html };
}

// ---------------------------------------------------------------- elenco, sitemap, robots, llms.txt
export function paginaElenco(indice: VoceComune[], origine: string): string {
  const perRegione = new Map<string, VoceComune[]>();
  for (const v of indice) {
    const l = perRegione.get(v.region) ?? [];
    l.push(v);
    perRegione.set(v.region, l);
  }
  const regioni = [...perRegione.keys()].sort((a, b) => a.localeCompare(b, "it"));
  const corpo = regioni
    .map(
      (r) =>
        `<h2 id="${esc(senzaAccenti(r).replace(/[^a-z0-9]+/g, "-"))}">${esc(r)}</h2><ul class="el">` +
        perRegione
          .get(r)!
          .sort((a, b) => a.name.localeCompare(b.name, "it"))
          .map((v) => `<li><a href="${esc(origine)}/comune/${esc(slugComune(v.name, v.istat))}">${esc(v.name)}</a> <span class="nota">${esc(v.province)}</span></li>`)
          .join("") +
        `</ul>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tutti i comuni italiani: bilanci, spese e appalti | Parimetro</title>
<meta name="description" content="Elenco dei ${indice.length} comuni italiani con i loro bilanci di cassa, la spesa per categoria, il reddito dei residenti, il PNRR e gli appalti.">
<link rel="canonical" href="${esc(origine)}/comuni">
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem}.el{columns:3 14rem;list-style:none;padding:0}.nota{color:#64748b;font-size:.85rem}</style>
</head><body>
<p><a href="${esc(origine)}/">Parimetro</a></p>
<h1>Tutti i comuni italiani</h1>
<p>Ogni scheda confronta il comune con quelli della sua fascia di popolazione: entrate e spese per abitante, spesa per categoria, reddito dei residenti, PNRR e appalti.</p>
${corpo}
</body></html>`;
}

export function sitemap(indice: VoceComune[], origine: string): string {
  const url = (p: string) => `<url><loc>${esc(origine)}${esc(p)}</loc></url>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    url("/") + url("/comuni") +
    indice.map((v) => url(`/comune/${slugComune(v.name, v.istat)}`)).join("") +
    `</urlset>`
  );
}

export const robots = (origine: string) =>
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origine}/sitemap.xml\n`;

export const llmsTxt = (origine: string, n: number) => `# Parimetro

> Mappa 3D e schede dei bilanci di ${n} comuni italiani: entrate e spese per abitante (dati di cassa SIOPE), spesa per categoria, reddito dei residenti (IRPEF), PNRR e fondi di coesione, appalti ANAC. Ogni comune è confrontato con quelli della stessa fascia di popolazione. Dati aperti; codice MIT, dati pubblicati CC BY-SA 4.0.

## Come leggere i dati
- Sono dati di CASSA (incassi e pagamenti), non di competenza.
- Il "rango" è una posizione 0-100 fra i comuni simili, non un voto né un posto in classifica.
- Gli importi degli appalti sono a base di gara; dal 2024 la rilevazione ANAC cambia e le serie non sono confrontabili.

## Pagine
- [Elenco di tutti i comuni](${origine}/comuni): un link per comune.
- Scheda di un comune: ${origine}/comune/{nome}-{codice ISTAT a 6 cifre}, per esempio ${origine}/comune/campobasso-070006
- [Sitemap](${origine}/sitemap.xml)

## Dati grezzi
- Per comune, in JSON: ${origine}/dati/comune/{codice ISTAT}.json (storico, confronto coi simili, spesa per categoria, reddito, investimenti, appalti, concorrenza)
- Indice dei comuni: ${origine}/dati/indice.json
`;
