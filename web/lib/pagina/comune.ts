// La pagina di un comune pensata per essere letta da motori di ricerca e da assistenti AI: testo vero nell'HTML,
// numeri con il loro contesto, dati strutturati. E' una funzione pura (dati -> HTML) cosi' si prova con dei test;
// la serve functions/comune/[slug].ts leggendo gli stessi JSON che usa la mappa.
//
// Principi: solo cio' che i dati dicono, con le stesse cautele della mappa (il "rango" e' una posizione fra i
// simili, non un voto; sotto 100 contribuenti la media del reddito e' instabile; gli importi dei lotti sono a
// base di gara). Niente giudizi.

import { SCRIPT_MISURA } from "../misura";
import { AREE } from "../categorie";
import { senzaAccenti } from "../dati";
import type { Appalti, Concorrenza } from "../appalti";
import type { Investimenti } from "../investimenti";
import type { NotizieComune } from "../notizie";
import { eConcentrata } from "../classifica";
import { FASCE } from "../chat/fasce";
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
  categorie?: Record<string, { totale?: number; aree: AreaDati[]; voci?: { descrizione: string; importo: number }[] } | null>;
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

// ---------------------------------------------------------------- aspetto (l'identita' di Parimetro)
/** Il segno: due pillole di lunghezza diversa su un quadrato tondo. */
export const SEGNO =
  '<svg class="segno" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><rect width="48" height="48" rx="15" fill="#3B3BD6"/>' +
  '<rect x="10" y="15" width="20" height="8" rx="4" fill="#FFF6E5"/><rect x="10" y="26" width="29" height="8" rx="4" fill="#FFD23F"/></svg>';

/**
 * I caratteri stanno sul nostro sito (public/fonts, licenza OFL): nessuna richiesta a terzi. Fondo crema, titoli in
 * Fraunces morbida, forme tonde. In modalita' scura si inverte, senza cambiare voce.
 */
export const STILE = `
@font-face{font-family:"Fraunces";src:url(/fonts/fraunces-morbida-latin.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Figtree";src:url(/fonts/figtree-latin.woff2) format("woff2");font-weight:400 700;font-display:swap}
:root{--fg:#1B1A2E;--bg:#FFF6E5;--carta:#FFFDF8;--mut:#5A5873;--line:#E8DEC8;--link:#3B3BD6;--acc:#FFD23F}
@media (prefers-color-scheme:dark){:root{--fg:#FFF6E5;--bg:#1B1A2E;--carta:#26243F;--mut:#B9B5D6;--line:#3A3860;--link:#B8A1FF}}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.65 Figtree,system-ui,sans-serif}
main,header,footer{max-width:46rem;margin:0 auto;padding:0 1.25rem}
header{padding-top:1.1rem;display:flex;justify-content:space-between;align-items:center;font-weight:600}
a{color:var(--link);text-underline-offset:3px}.marchio{display:flex;align-items:center;gap:.6rem;color:var(--fg);text-decoration:none;font:700 1.5rem/1 Fraunces,Georgia,serif;letter-spacing:-.02em}
h1,h2{font-family:Fraunces,Georgia,serif;font-weight:700;letter-spacing:-.02em}
h1{font-size:2.5rem;line-height:1.05;margin:1.4rem 0}h2{font-size:1.65rem;line-height:1.15;margin:2.6rem 0 .6rem}
table{border-collapse:collapse;width:100%;font-size:1rem;margin:1rem 0;background:var(--carta);border-radius:20px;overflow:hidden}
caption{text-align:left;color:var(--mut);padding:.2rem .2rem .5rem;font-size:.92rem}
th,td{border-bottom:1px solid var(--line);padding:.55rem .8rem;text-align:right}th[scope=row],thead th:first-child{text-align:left}
thead th{color:var(--mut);font-size:.82rem;text-transform:uppercase;letter-spacing:.05em}
.avviso{background:var(--acc);color:#1B1A2E;padding:.8rem 1.1rem;border-radius:22px}
.nota{color:var(--mut);font-size:.92rem}
.breve,.avvertenze,.parole{border-radius:24px;padding:1rem 1.25rem;margin:1.2rem 0}
.breve{background:var(--carta);border:1px solid var(--line)}.breve ul{margin:.4rem 0 0;padding-left:1.2rem}.breve li{margin:.35rem 0}
.avvertenze{background:var(--acc);color:#1B1A2E}.avvertenze h2,.breve h2,.parole h2{margin:.2rem 0 .4rem;font-size:1.3rem}
.avvertenze ul{margin:0;padding-left:1.2rem}.avvertenze li{margin:.3rem 0}
.faq dt{font-weight:700;margin-top:.8rem}.faq dd{margin:.2rem 0 0}
.simili ul{margin:.4rem 0 0;padding-left:1.2rem}.simili li{margin:.3rem 0}
.parole dt{font-weight:700;margin-top:.7rem}.parole dd{margin:.15rem 0 0;color:var(--mut)}
.cta{display:inline-block;margin:.4rem 0 1rem;padding:.8rem 1.5rem;border-radius:99px;background:var(--link);color:#fff;text-decoration:none;font-weight:700}
@media (prefers-color-scheme:dark){.cta{color:#1B1A2E}}
footer{padding-bottom:3.5rem;color:var(--mut);font-size:.92rem}
`;

// ---------------------------------------------------------------- contenuto
// Il lessico della pagina: pochi termini, spiegati con parole semplici (la pagina si legge anche a 70 anni)
const PAROLE: [string, string][] = [
  ["Cassa", "Soldi realmente incassati e pagati dal comune nell'anno. Non sono gli accertamenti (le entrate dovute) né gli impegni (le spese decise ma non ancora pagate)."],
  ["Per abitante", "Il totale diviso per il numero di abitanti: permette di confrontare comuni di dimensioni diverse."],
  ["Comuni simili", "I comuni della stessa fascia di popolazione (per esempio da 5.000 a 20.000 abitanti)."],
  ["Mediana", "Il valore al centro: metà dei comuni simili sta sopra e metà sotto. Non è influenzata da pochi casi molto diversi."],
  ["Rango", "La posizione del comune nella sua fascia, da 0 a 100, su un indicatore di salute finanziaria (autonomia e saldo di gestione). Non è una pagella dell'amministrazione."],
  ["Autonomia finanziaria", "La quota delle entrate correnti che il comune raccoglie da sé (tributi ed entrate proprie), invece di riceverla da altri enti."],
  ["Spesa concentrata", "Una sola voce supera il 40% della spesa dell'anno, di solito un investimento isolato. Il pro capite di quell'anno non è confrontabile."],
  ["Non attribuibile", "Le spese che il codice del bilancio non permette di assegnare con sicurezza a un'area."],
]

export interface Pagina {
  title: string;
  description: string;
  html: string;
}

/** Indice della fascia di popolazione (0..5), con le stesse soglie di FASCE. */
export function indiceFascia(abitanti: number): number {
  if (abitanti < 1000) return 0;
  if (abitanti < 5000) return 1;
  if (abitanti < 20000) return 2;
  if (abitanti < 60000) return 3;
  if (abitanti < 250000) return 4;
  return 5;
}

/** I comuni simili a `v`: stessa fascia di popolazione, quelli con la dimensione piu' vicina. */
export function comuniSimili(indice: VoceComune[], v: VoceComune, n = 8): VoceComune[] {
  const fascia = indiceFascia(v.population);
  return indice
    .filter((c) => c.istat !== v.istat && indiceFascia(c.population) === fascia)
    .sort((a, b) => Math.abs(a.population - v.population) - Math.abs(b.population - v.population))
    .slice(0, n);
}

export function paginaComune(v: VoceComune, d: DatiComune, origine: string, comuniVicini: VoceComune[] = []): Pagina {
  const url = `${origine}/comune/${slugComune(v.name, v.istat)}`;
  const mappa = `${origine}/mappa?comune=${v.istat}`;
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

  // -------- in breve e avvertenze: la prima cosa che si legge
  if (ult) {
    const punti: string[] = [];
    if (simili) {
      const c = rispettoAllaMediana(ult.expenditure_pc, simili.expenditure_pc);
      if (c) punti.push(`La spesa per abitante nel ${ult.year} è ${c} dei comuni simili: ${eur(ult.expenditure_pc)}, contro una mediana di ${eur(simili.expenditure_pc)}.`);
      if (simili.pct_expenditure != null) {
        punti.push(`Supera la spesa del ${simili.pct_expenditure}% dei ${n0(simili.n)} comuni della sua fascia demografica (${esc(simili.fascia)}).`);
      }
    }
    const top = d.categorie?.[String(ult.year)]?.aree
      ?.filter((a) => a.area !== "non_attribuibile" && a.pc != null)
      .sort((a, b) => (b.pc ?? 0) - (a.pc ?? 0))[0];
    if (top) punti.push(`La voce di spesa più pesante è «${esc(AREE[top.area] ?? top.area)}»: ${eur(top.pc)} per abitante.`);
    if (punti.length) sezioni.push(`<section class="breve"><h2>In breve</h2><ul>${punti.map((x) => `<li>${x}</li>`).join("")}</ul></section>`);
    sezioni.push(
      `<aside class="avvertenze"><h2>Prima di leggere</h2><ul>` +
        "<li>Sono dati di cassa: incassi e pagamenti effettivi. Un anno può sembrare diverso da quello che ti aspetti.</li>" +
        "<li>Il confronto è con i comuni della stessa fascia di popolazione. Non è un giudizio sull'amministrazione.</li>" +
        "<li>Il rango è una posizione da 0 a 100, non una pagella.</li>" +
        `</ul></aside>`,
    );
  }

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
    // Una sola voce enorme (un investimento isolato) rende il pro capite di quell'anno inconfrontabile: la mappa lo
    // segnala, e una pagina letta da sola non puo' essere da meno.
    const cat = d.categorie?.[String(ult.year)];
    const prima = cat?.voci?.[0];
    if (cat?.totale && prima && eConcentrata((100 * prima.importo) / cat.totale)) {
      righe.push(
        `<p class="avviso"><strong>Attenzione:</strong> il ${n0((100 * prima.importo) / cat.totale)}% della spesa del ${ult.year} è una sola voce ` +
          `(«${esc(prima.descrizione)}», ${mln(prima.importo)}): di solito un investimento isolato. Il pro capite di quell'anno non è confrontabile con quello dei comuni simili.</p>`,
      );
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
        `Le spese che non si possono assegnare con sicurezza a un'area restano in «Non attribuibile».</p>` +
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

  // -------- domande frequenti: risposte con i numeri del comune (e lo stesso testo nei dati strutturati)
  const domande: [string, string][] = [];
  if (sezioni.length && ult) {
    if (ult.expenditure_pc != null) {
      let r = `Nel ${ult.year} ${v.name} ha speso ${eur(ult.expenditure_pc)} per abitante`;
      if (simili?.expenditure_pc != null) r += `, contro una mediana di ${eur(simili.expenditure_pc)} dei comuni della sua fascia`;
      domande.push([`Quanto spende ${v.name} per abitante?`, r + "."]);
    }
    if (ult.autonomia != null) {
      domande.push([
        `Quanta parte delle entrate di ${v.name} viene dal comune stesso?`,
        `Nel ${ult.year} l'autonomia finanziaria è ${pct(ult.autonomia)}: è la quota delle entrate correnti che il comune raccoglie da sé, invece di riceverla da altri enti.`,
      ]);
    }
    const top = d.categorie?.[String(ult.year)]?.aree
      ?.filter((a) => a.area !== "non_attribuibile" && a.pc != null)
      .sort((a, b) => (b.pc ?? 0) - (a.pc ?? 0))[0];
    if (top) {
      domande.push([`Su cosa spende di più ${v.name}?`, `Nel ${ult.year} la voce più pesante è «${AREE[top.area] ?? top.area}»: ${eur(top.pc)} per abitante.`]);
    }
    if (domande.length) {
      sezioni.push(
        `<section class="faq"><h2>Domande frequenti</h2><dl>` +
          domande.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("") +
          `</dl></section>`,
      );
    }
  }

  // -------- comuni simili: la rete di link tra le schede (e un confronto da fare a mano)
  if (sezioni.length && comuniVicini.length) {
    const fascia = FASCE[indiceFascia(v.population)];
    sezioni.push(
      `<section class="simili"><h2>Comuni simili</h2>` +
        `<p>Comuni della stessa fascia di popolazione (${esc(fascia)}), con dimensione vicina a ${esc(v.name)}. Puoi confrontarli dalle loro schede.</p>` +
        `<ul>` +
        comuniVicini
          .map(
            (c) =>
              `<li><a href="${esc(origine)}/comune/${esc(slugComune(c.name, c.istat))}">${esc(c.name)}</a> ` +
              `<span class="nota">${esc(c.province)} · ${n0(c.population)} abitanti</span></li>`,
          )
          .join("") +
        `</ul></section>`,
    );
  }

  // -------- parole da sapere, con il link al metodo (solo se la pagina ha dati)
  if (sezioni.length) sezioni.push(
    `<section class="parole"><h2>Parole da sapere</h2><dl>` +
      PAROLE.map(([t, spiegazione]) => `<dt>${esc(t)}</dt><dd>${esc(spiegazione)}</dd>`).join("") +
      `</dl><p><a href="${esc(origine)}/metodo">Come sono calcolati i numeri</a></p></section>`,
  );

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
      ...(domande.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${url}#faq`,
              mainEntity: domande.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
            },
          ]
        : []),
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
<style>${STILE}</style>
</head>
<body>
<header><a class="marchio" href="${esc(origine)}/">${SEGNO}<span>Parimetro</span></a><a href="${esc(origine)}/comuni">Tutti i comuni</a><a href="${esc(origine)}/metodo">Metodo</a></header>
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
${SCRIPT_MISURA}
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
<style>${STILE}main,header{max-width:62rem}.el{columns:3 15rem;list-style:none;padding:0;margin:0}.el li{padding:.15rem 0}</style>
</head><body>
<header><a class="marchio" href="${esc(origine)}/">${SEGNO}<span>Parimetro</span></a><a href="${esc(origine)}/comuni">Tutti i comuni</a></header>
<main>
<h1>Tutti i comuni italiani</h1>
<p>Ogni scheda confronta il comune con quelli della sua fascia di popolazione: entrate e spese per abitante, spesa per categoria, reddito dei residenti, PNRR e appalti.</p>
${corpo}
</main>
${SCRIPT_MISURA}</body></html>`;
}

export function sitemap(indice: VoceComune[], origine: string, pagineExtra: string[] = []): string {
  const url = (p: string) => `<url><loc>${esc(origine)}${esc(p)}</loc></url>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    url("/") + url("/mappa") + url("/comuni") + url("/privacy") + url("/metodo") + pagineExtra.map(url).join("") +
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
