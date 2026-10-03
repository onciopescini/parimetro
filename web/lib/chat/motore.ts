// Il motore: dato un Intento (scelto dal modello, poi validato) calcola la risposta
// leggendo i JSON del sito. Qui nasce ogni numero che l'utente vedra'.
import { percorsoClassifica, URL_DATI, type VoceIndice } from "../dati";
import { AREE, type AreaSpesa, type CategorieComune } from "../categorie";
import { eConcentrata, righeVisibili } from "../classifica";
import { pochiContribuenti } from "../reddito";
import { risolviComune } from "./comuni";
import { normalizzaFascia, normalizzaRegione } from "./fasce";
import {
  ETICHETTE_METRICA,
  fEur,
  fEurBreve,
  fNum,
  fPct,
  formattaMetrica,
  numero,
} from "./formati";
import type { RedditoAnno } from "../reddito";
import { CICLI, GENERI_ALTRI, ordinaCicli, quotaDelPrimo, type Investimenti } from "../investimenti";
import { annoDisponibile, nuovaRilevazione, type Appalti } from "../appalti";
import type { Colonna, Contesto, Fatto, Intento, Leggi, RifComune, Risultato } from "./tipi";

interface RigaStorico {
  year: number;
  [k: string]: number | string | null;
}
interface SchedaComune {
  history: RigaStorico[];
  peers: Record<string, Record<string, unknown> | null>;
  categorie?: Record<string, CategorieComune | null>;
  reddito?: Record<string, RedditoAnno> | null;
  investimenti?: Investimenti | null;
  appalti?: Appalti | null;
}

type Cella = string | number | null;

const vuoto = (titolo: string, riassunto: string, extra: Partial<Risultato> = {}): Risultato => ({
  ok: false,
  titolo,
  colonne: [],
  righe: [],
  grezze: [],
  fatti: {},
  riassunto,
  note: [],
  ...extra,
});

export const CAPACITA =
  "Posso mostrarti la scheda di un comune, confrontare fino a quattro comuni, " +
  "fare una classifica (rango, autonomia, spesa o entrate pro capite, anche per fascia di popolazione o regione), " +
  "dirti quanto spende un comune in una certa area (rifiuti, strade, scuole…), come sono andati i suoi conti negli anni, quali progetti PNRR e opere pubbliche ha e come affida gli appalti. " +
  "Non faccio previsioni, non do giudizi politici e non conosco dati che non sono sul sito.";

/** Anno richiesto se esiste, altrimenti l'ultimo; con una nota se si e' dovuto cambiare. */
async function scegliAnno(leggi: Leggi, richiesto: number | undefined, contesto?: Contesto) {
  const anni = (await leggi(`${URL_DATI}/anni.json`)) as number[];
  const ultimo = anni[anni.length - 1];
  const voluto = richiesto ?? contesto?.anno;
  if (voluto == null) return { anno: ultimo, anni, nota: null as string | null };
  if (anni.includes(voluto)) return { anno: voluto, anni, nota: null };
  return {
    anno: ultimo,
    anni,
    nota: `Il ${voluto} non c'è: i dati vanno dal ${anni[0]} al ${ultimo}. Ti mostro il ${ultimo}.`,
  };
}

async function trovaComune(
  indice: VoceIndice[],
  rif: RifComune,
  contesto?: Contesto,
): Promise<{ voce: VoceIndice } | { errore: Risultato }> {
  const e = risolviComune(indice, rif, contesto);
  if (e.tipo === "trovato") return { voce: e.voce };
  if (e.tipo === "ambiguo") {
    return {
      errore: vuoto(
        "Quale comune?",
        `Ci sono più comuni che corrispondono a «${rif.comune}». Dimmi quale:`,
        {
          candidati: e.candidati.map((v) => ({
            istat: v.istat,
            nome: v.name,
            provincia: v.province,
            abitanti: v.population,
          })),
        },
      ),
    };
  }
  return {
    errore: vuoto(
      "Comune non trovato",
      `Non trovo nessun comune chiamato «${rif.comune}». Controlla l'ortografia, oppure scrivimi il nome con la provincia.`,
    ),
  };
}

const leggiScheda = (leggi: Leggi, istat: string) =>
  leggi(`${URL_DATI}/comune/${istat}.json`) as Promise<SchedaComune>;

const trovaAnno = (s: SchedaComune, anno: number) => s.history.find((h) => h.year === anno) ?? null;

/** Una voce di spesa che da sola supera la soglia: il pro capite dell'anno non e' confrontabile. */
function notaConcentrazione(cat: CategorieComune | null | undefined): string | null {
  const v = cat?.voci?.[0];
  if (!cat || !v || !(cat.totale > 0)) return null;
  const quota = (100 * v.importo) / cat.totale;
  return eConcentrata(quota)
    ? `Il ${Math.round(quota)}% della spesa dell'anno è una sola voce («${v.descrizione}»): è un investimento isolato, quindi il pro capite non è confrontabile con i comuni vicini.`
    : null;
}

const fasciaDi = (p: number) =>
  p < 1000 ? 0 : p < 5000 ? 1 : p < 20000 ? 2 : p < 60000 ? 3 : p < 250000 ? 4 : 5;

// ---------------------------------------------------------------- scheda
async function schedaComune(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "scheda_comune" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const t = await trovaComune(indice, i, contesto);
  if ("errore" in t) return t.errore;
  const { voce } = t;
  const { anno, nota } = await scegliAnno(leggi, i.anno, contesto);
  const s = await leggiScheda(leggi, voce.istat);
  const b = trovaAnno(s, anno);
  if (!b) {
    return vuoto(voce.name, `Per ${voce.name} non ho dati del ${anno}.`, { apri: voce.istat });
  }
  const peers = s.peers[String(anno)] ?? null;
  const cat = s.categorie?.[String(anno)] ?? null;

  const colonne: Colonna[] = [
    { k: "indicatore", label: "Indicatore" },
    { k: "comune", label: voce.name, dx: true },
    { k: "simili", label: "Mediana dei simili", dx: true },
  ];
  const righe: Record<string, string>[] = [];
  const grezze: Record<string, Cella>[] = [];
  const aggiungi = (indicatore: string, v: unknown, simili: unknown, fmt: (x: unknown) => string) => {
    righe.push({ indicatore, comune: fmt(v), simili: simili == null ? "—" : fmt(simili) });
    grezze.push({ indicatore, comune: numero(v), simili: numero(simili) });
  };
  aggiungi("Entrate pro capite", b.revenue_pc, peers?.revenue_pc, fEur);
  aggiungi("Spesa pro capite", b.expenditure_pc, peers?.expenditure_pc, fEur);
  aggiungi("Rango nella fascia (0-100)", b.fhi, peers?.fhi, fNum);
  aggiungi("Autonomia finanziaria", b.autonomia, null, fPct);
  aggiungi("Avanzo/disavanzo di cassa", b.surplus_deficit, null, fEurBreve);
  const red = s.reddito?.[String(anno)] ?? null;
  if (red?.medio != null) {
    aggiungi("Reddito imponibile medio", red.medio, red.mediana_simili, fEur);
    aggiungi("Addizionale comunale media", red.addizionale_media, null, fEur);
  }
  for (const a of (cat?.aree ?? []).filter((x) => x.importo > 0).slice(0, 5)) {
    aggiungi(`Spesa: ${AREE[a.area] ?? a.area} (€/ab)`, a.pc, a.n_simili > 1 ? a.mediana_pc : null, fEur);
  }

  const fatti: Record<string, Fatto> = {
    comune: { label: "Comune", valore: voce.name },
    provincia: { label: "Provincia", valore: voce.province },
    anno: { label: "Anno", valore: String(anno) },
    abitanti: { label: "Abitanti", valore: fNum(voce.population) },
    spesa_pc: { label: "Spesa pro capite", valore: fEur(b.expenditure_pc) },
    entrate_pc: { label: "Entrate pro capite", valore: fEur(b.revenue_pc) },
    rango: { label: "punteggio del rango (da 0 a 100, rispetto ai comuni della stessa fascia di popolazione; non è una posizione in classifica)", valore: b.fhi == null ? "n.d." : `${fNum(b.fhi)} su 100` },
    n_simili: { label: "Comuni nella fascia", valore: fNum(peers?.n) },
    spesa_simili: { label: "Spesa pro capite mediana dei simili", valore: fEur(peers?.expenditure_pc) },
    ...(red?.medio != null
      ? {
          reddito_medio: { label: "reddito imponibile medio dei residenti", valore: fEur(red.medio) },
          reddito_simili: { label: "reddito imponibile medio mediano dei comuni simili", valore: fEur(red.mediana_simili) },
        }
      : {}),
  };
  const note = [nota, notaConcentrazione(cat)].filter(Boolean) as string[];
  if (b.revenue_total == null) {
    note.push(
      "Per quest'anno SIOPE non riporta gli incassi di questo comune: entrate, saldo e rango non sono calcolabili.",
    );
  }
  const riassunto =
    `${voce.name} (${voce.province}), ${fNum(voce.population)} abitanti, ${anno}: ` +
    `spesa pro capite ${fEur(b.expenditure_pc)}` +
    (peers?.expenditure_pc != null ? ` (mediana dei comuni simili ${fEur(peers.expenditure_pc)})` : "") +
    (b.fhi != null ? `, rango ${fNum(b.fhi)} su 100 nella sua fascia` : "") +
    ".";
  return {
    ok: true,
    titolo: `${voce.name} · ${anno}`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto,
    note,
    apri: voce.istat,
  };
}

// ------------------------------------------------------------- confronto
async function confrontaComuni(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "confronta_comuni" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const trovati: VoceIndice[] = [];
  for (const rif of i.comuni) {
    const t = await trovaComune(indice, rif, contesto);
    if ("errore" in t) return t.errore;
    if (!trovati.some((v) => v.istat === t.voce.istat)) trovati.push(t.voce);
  }
  if (trovati.length < 2) {
    return vuoto("Confronto", "Per un confronto servono almeno due comuni diversi.");
  }
  const { anno, nota } = await scegliAnno(leggi, i.anno, contesto);
  const dati = await Promise.all(
    trovati.map(async (v) => {
      const s = await leggiScheda(leggi, v.istat);
      return { v, b: trovaAnno(s, anno), red: s.reddito?.[String(anno)] ?? null };
    }),
  );

  const colonne: Colonna[] = [
    { k: "indicatore", label: "Indicatore" },
    ...dati.map(({ v }, n) => ({ k: `c${n}`, label: v.name, dx: true })),
  ];
  const righe: Record<string, string>[] = [];
  const grezze: Record<string, Cella>[] = [];
  const aggiungi = (indicatore: string, chiave: string, fmt: (x: unknown) => string) => {
    const r: Record<string, string> = { indicatore };
    const g: Record<string, Cella> = { indicatore };
    dati.forEach(({ b }, n) => {
      r[`c${n}`] = b ? fmt(b[chiave]) : "n.d.";
      g[`c${n}`] = b ? numero(b[chiave]) : null;
    });
    righe.push(r);
    grezze.push(g);
  };
  // La popolazione non e' nella serie storica: si usa l'ultimo dato dell'anagrafica
  {
    const r: Record<string, string> = { indicatore: "Abitanti (ultimo dato)" };
    const g: Record<string, Cella> = { indicatore: "Abitanti (ultimo dato)" };
    dati.forEach(({ v }, n) => {
      r[`c${n}`] = fNum(v.population);
      g[`c${n}`] = v.population;
    });
    righe.push(r);
    grezze.push(g);
  }
  aggiungi("Entrate pro capite", "revenue_pc", fEur);
  aggiungi("Spesa pro capite", "expenditure_pc", fEur);
  aggiungi("Rango nella fascia (0-100)", "fhi", fNum);
  aggiungi("Autonomia finanziaria", "autonomia", fPct);
  aggiungi("Avanzo/disavanzo di cassa", "surplus_deficit", fEurBreve);
  {
    const r: Record<string, string> = { indicatore: "Reddito imponibile medio" };
    const g: Record<string, Cella> = { indicatore: "Reddito imponibile medio" };
    dati.forEach(({ red }, n) => {
      r[`c${n}`] = fEur(red?.medio);
      g[`c${n}`] = numero(red?.medio);
    });
    righe.push(r);
    grezze.push(g);
  }

  const fatti: Record<string, Fatto> = { anno: { label: "Anno", valore: String(anno) } };
  dati.forEach(({ v, b }, n) => {
    fatti[`nome${n}`] = { label: `Comune ${n + 1}`, valore: v.name };
    fatti[`spesa${n}`] = { label: `Spesa pro capite di ${v.name}`, valore: fEur(b?.expenditure_pc) };
    fatti[`rango${n}`] = { label: `punteggio del rango di ${v.name} (da 0 a 100, rispetto ai comuni della stessa fascia; non è una posizione in classifica)`, valore: b?.fhi == null ? "n.d." : `${fNum(b.fhi)} su 100` };
  });
  const note = [nota].filter(Boolean) as string[];
  if (new Set(trovati.map((v) => fasciaDi(v.population))).size > 1) {
    note.push(
      "I comuni sono di taglie diverse: il confronto del pro capite va letto con cautela (i costi fissi pesano di più sui comuni piccoli).",
    );
  }
  return {
    ok: true,
    titolo: `Confronto ${anno}`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto: `Confronto ${anno}: ${dati
      .map(({ v, b }) => `${v.name} spende ${fEur(b?.expenditure_pc)} a persona`)
      .join("; ")}.`,
    note,
  };
}

// -------------------------------------------------------------- classifica
interface RigaClassifica {
  posizione: number;
  istat: string;
  name: string;
  province: string;
  population: number;
  valore: string | number | null;
  fhi: number | null;
  concentrata?: number | string | null;
}

async function classifica(
  leggi: Leggi,
  i: Extract<Intento, { tipo: "classifica" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const { anno, nota } = await scegliAnno(leggi, i.anno, contesto);
  const filtri = (await leggi(`${URL_DATI}/classifiche/filtri-${anno}.json`)) as {
    fasce: { fascia: string }[];
    regioni: string[];
  };
  const note = [nota].filter(Boolean) as string[];

  let fascia: string | null = null;
  if (i.fascia) {
    fascia = normalizzaFascia(i.fascia);
    if (!fascia) note.push(`Non ho riconosciuto la fascia «${i.fascia}»: ho considerato tutti i comuni.`);
  }
  let regione: string | null = null;
  if (i.regione) {
    regione = normalizzaRegione(i.regione, filtri.regioni);
    if (!regione) note.push(`Non ho riconosciuto la regione «${i.regione}»: ho considerato tutta Italia.`);
  }
  const alto = i.ordine === "alto";
  let righe: RigaClassifica[];
  try {
    righe = (await leggi(percorsoClassifica(anno, i.metrica, alto, fascia, regione))) as RigaClassifica[];
  } catch {
    return vuoto("Classifica", "Non ho una classifica per questa combinazione di filtri.");
  }
  const visibili = righeVisibili(righe, !!i.senza_concentrate, 10);
  if (!visibili.length) return vuoto("Classifica", "Nessun comune con questi filtri.");

  const colonne: Colonna[] = [
    { k: "pos", label: "#", dx: true },
    { k: "comune", label: "Comune" },
    { k: "provincia", label: "Provincia" },
    { k: "abitanti", label: "Abitanti", dx: true },
    { k: "valore", label: ETICHETTE_METRICA[i.metrica], dx: true },
    { k: "nota", label: "" },
  ];
  const celle = visibili.map((r) => ({
    pos: String(r.posizione),
    comune: r.name,
    provincia: r.province,
    abitanti: fNum(r.population),
    valore: formattaMetrica(i.metrica, r.valore),
    nota: eConcentrata(r.concentrata) ? "spesa concentrata" : "",
  }));
  const grezze: Record<string, Cella>[] = visibili.map((r) => ({
    pos: r.posizione,
    comune: r.name,
    provincia: r.province,
    abitanti: r.population,
    valore: numero(r.valore),
    istat: r.istat,
    spesa_concentrata: eConcentrata(r.concentrata) ? "sì" : "no",
  }));
  const ambito = [fascia, regione].filter(Boolean).join(", ") || "tutta Italia";
  const primo = visibili[0];
  const fatti: Record<string, Fatto> = {
    anno: { label: "Anno", valore: String(anno) },
    ambito: { label: "Ambito", valore: ambito },
    metrica: { label: "Metrica", valore: ETICHETTE_METRICA[i.metrica] },
    primo: { label: "Primo in classifica", valore: primo.name },
    primo_valore: { label: "Valore del primo", valore: formattaMetrica(i.metrica, primo.valore) },
  };
  if (visibili.some((r) => eConcentrata(r.concentrata))) {
    note.push(
      "Alcuni comuni hanno una sola voce di spesa sopra il 40% dell'anno (un investimento isolato): il loro pro capite non è confrontabile. Puoi chiedermi la classifica senza di loro.",
    );
  }
  if (i.metrica === "fhi") {
    note.push(
      "Il rango dice dove sta un comune rispetto ai comuni della sua fascia: non è un voto alla gestione e a parità di punteggio decide l'autonomia finanziaria.",
    );
  }
  return {
    ok: true,
    titolo: `${ETICHETTE_METRICA[i.metrica]} · ${alto ? "più alti" : "più bassi"} · ${ambito} · ${anno}`,
    colonne,
    righe: celle,
    grezze,
    fatti,
    riassunto: `${ETICHETTE_METRICA[i.metrica]} ${anno}, ${ambito}: in testa ${primo.name} (${formattaMetrica(i.metrica, primo.valore)}).`,
    note,
  };
}

// -------------------------------------------------------------- spesa area
async function spesaArea(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "spesa_area" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const t = await trovaComune(indice, i, contesto);
  if ("errore" in t) return t.errore;
  const { voce } = t;
  if (!(i.area in AREE)) {
    return vuoto(
      "Area di spesa",
      `Non conosco l'area «${i.area}». Quelle che uso: ${Object.values(AREE).join(", ")}.`,
    );
  }
  const s = await leggiScheda(leggi, voce.istat);
  const colonne: Colonna[] = [
    { k: "anno", label: "Anno" },
    { k: "importo", label: "Pagato", dx: true },
    { k: "pc", label: "Per abitante", dx: true },
    { k: "mediana", label: "Mediana dei simili", dx: true },
    { k: "rango", label: "Spende più del…", dx: true },
  ];
  const righe: Record<string, string>[] = [];
  const grezze: Record<string, Cella>[] = [];
  let ultimo: { anno: number; a: AreaSpesa } | null = null;
  for (const [anno, cat] of Object.entries(s.categorie ?? {})) {
    const a = cat?.aree.find((x) => x.area === i.area);
    if (!a) continue;
    ultimo = { anno: Number(anno), a };
    const confrontabile = a.n_simili > 1;
    righe.push({
      anno,
      importo: fEurBreve(a.importo),
      pc: fEur(a.pc),
      mediana: confrontabile ? fEur(a.mediana_pc) : "—",
      rango: confrontabile ? `${fNum(a.rango)}% dei simili` : "—",
    });
    grezze.push({
      anno: Number(anno),
      importo: a.importo,
      pc: a.pc,
      mediana: confrontabile ? a.mediana_pc : null,
      rango: confrontabile ? a.rango : null,
    });
  }
  if (!ultimo) {
    return vuoto(voce.name, `Per ${voce.name} non ho il dettaglio per voce di spesa.`, {
      apri: voce.istat,
    });
  }
  const etichetta = AREE[i.area];
  const note: string[] = [];
  if (i.area === "non_attribuibile") {
    note.push(
      "«Non attribuibile» è la spesa registrata con voci generiche («altri servizi»): non si può dire a quale servizio sia andata.",
    );
  }
  const nc = notaConcentrazione(s.categorie?.[String(ultimo.anno)] ?? null);
  if (nc) note.push(nc);
  const fatti: Record<string, Fatto> = {
    comune: { label: "Comune", valore: voce.name },
    area: { label: "Area", valore: etichetta },
    anno: { label: "Ultimo anno", valore: String(ultimo.anno) },
    importo: { label: "Pagato nell'ultimo anno", valore: fEurBreve(ultimo.a.importo) },
    pc: { label: "Per abitante", valore: fEur(ultimo.a.pc) },
    mediana: {
      label: "Mediana dei simili",
      valore: ultimo.a.n_simili > 1 ? fEur(ultimo.a.mediana_pc) : "n.d.",
    },
  };
  return {
    ok: true,
    titolo: `${voce.name} · ${etichetta}`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto:
      `${voce.name}, ${etichetta}, ${ultimo.anno}: ${fEurBreve(ultimo.a.importo)} pagati, ${fEur(ultimo.a.pc)} a persona` +
      (ultimo.a.n_simili > 1 ? ` (mediana dei simili ${fEur(ultimo.a.mediana_pc)}).` : "."),
    note,
    apri: voce.istat,
  };
}

// ------------------------------------------------------------- investimenti
async function investimentiComune(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "investimenti_comune" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const t = await trovaComune(indice, i, contesto);
  if ("errore" in t) return t.errore;
  const { voce } = t;
  const s = await leggiScheda(leggi, voce.istat);
  const inv = s.investimenti;
  if (!inv) return vuoto(voce.name, `Per ${voce.name} non ho dati sugli investimenti.`, { apri: voce.istat });
  const { pnrr, coesione } = inv;
  const opere = coesione.opere;

  const colonne: Colonna[] = [
    { k: "indicatore", label: "Indicatore" },
    { k: "comune", label: voce.name, dx: true },
    { k: "simili", label: "Mediana dei simili", dx: true },
  ];
  const righe: Record<string, string>[] = [];
  const grezze: Record<string, Cella>[] = [];
  const aggiungi = (indicatore: string, v: string, grezzo: Cella, simili = "—", grezzoSimili: Cella = null) => {
    righe.push({ indicatore, comune: v, simili });
    grezze.push({ indicatore, comune: grezzo, simili: grezzoSimili });
  };
  aggiungi("PNRR: progetti gestiti dal comune", fNum(pnrr.n), pnrr.n);
  aggiungi("PNRR: finanziamento", fEurBreve(pnrr.fin_pnrr), pnrr.fin_pnrr);
  aggiungi("PNRR: euro per abitante", fEur(pnrr.pc), pnrr.pc, fEur(pnrr.mediana_pc), pnrr.mediana_pc);
  aggiungi("PNRR: progetti conclusi", `${fNum(pnrr.conclusi)} su ${fNum(pnrr.n)}`, pnrr.conclusi);
  aggiungi("Coesione: opere pubbliche", fNum(opere.n), opere.n);
  aggiungi("Coesione: finanziamento pubblico", fEurBreve(opere.fin), opere.fin);
  aggiungi("Coesione: pagato", fEurBreve(opere.pagamenti), opere.pagamenti);
  aggiungi("Coesione: euro per abitante", fEur(opere.pc), opere.pc, fEur(opere.mediana_pc), opere.mediana_pc);
  const maxP = pnrr.progetti[0];
  if (maxP) aggiungi("Maggior progetto PNRR", `${maxP.titolo ?? "senza titolo"} (${fEurBreve(maxP.fin_pnrr)})`, maxP.fin_pnrr);
  const maxO = opere.progetti[0];
  if (maxO) aggiungi("Maggior opera di coesione", `${maxO.titolo ?? "senza titolo"} (${fEurBreve(maxO.fin)})`, maxO.fin);

  const note = [
    "Il PNRR qui sono i progetti di cui il comune è soggetto attuatore: gli interventi di RFI, ministeri, Regioni o ASL sul suo territorio non sono attribuibili a un comune.",
    "Le opere di coesione sono quelle localizzate solo in questo comune; quelle su più comuni, una provincia o una regione non sono attribuite.",
  ];
  const qp = quotaDelPrimo(pnrr.progetti.map((p) => p.fin_pnrr), pnrr.fin_pnrr);
  if (qp != null && qp >= 50) note.push(`Un solo progetto PNRR pesa il ${Math.round(qp)}% del totale: il valore per abitante dipende da quell'opera.`);
  const qo = quotaDelPrimo(opere.progetti.map((p) => p.fin), opere.fin);
  if (qo != null && qo >= 50) note.push(`Un'opera di coesione sola pesa il ${Math.round(qo)}% del totale.`);
  const altri = Object.entries(coesione.altri).filter(([, v]) => v.n > 0);
  if (altri.length) {
    note.push(`Oltre alle opere ci sono ${altri.map(([g, v]) => `${fNum(v.n)} ${GENERI_ALTRI[g] ?? g}`).join(", ")}: non si mostrano i nomi (persone e imprese private).`);
  }

  const fatti: Record<string, Fatto> = {
    comune: { label: "Comune", valore: voce.name },
    pnrr_n: { label: "progetti PNRR gestiti dal comune", valore: fNum(pnrr.n) },
    pnrr_fin: { label: "finanziamento PNRR", valore: fEurBreve(pnrr.fin_pnrr) },
    pnrr_pc: { label: "PNRR per abitante", valore: fEur(pnrr.pc) },
    pnrr_simili: { label: "PNRR per abitante mediano dei comuni simili", valore: fEur(pnrr.mediana_pc) },
    opere_n: { label: "opere pubbliche di coesione", valore: fNum(opere.n) },
    opere_fin: { label: "finanziamento pubblico delle opere di coesione", valore: fEurBreve(opere.fin) },
    opere_pc: { label: "opere di coesione per abitante", valore: fEur(opere.pc) },
    opere_simili: { label: "opere di coesione per abitante mediane dei simili", valore: fEur(opere.mediana_pc) },
  };
  const cicli = ordinaCicli(opere.cicli).map((c) => `${CICLI[c.ciclo] ?? c.ciclo}: ${fNum(c.n)}`).join(", ");
  return {
    ok: true,
    titolo: `${voce.name} · investimenti`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto:
      `${voce.name}: ${fNum(pnrr.n)} progetti PNRR gestiti dal comune (${fEurBreve(pnrr.fin_pnrr)}, ${fEur(pnrr.pc)} per abitante); ` +
      `${fNum(opere.n)} opere pubbliche di coesione (${fEurBreve(opere.fin)}${cicli ? `; ${cicli}` : ""}).`,
    note,
    apri: voce.istat,
  };
}

// ------------------------------------------------------------------ appalti
async function appaltiComune(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "appalti_comune" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const t = await trovaComune(indice, i, contesto);
  if ("errore" in t) return t.errore;
  const { voce } = t;
  const s = await leggiScheda(leggi, voce.istat);
  if (!s.appalti) {
    return vuoto(voce.name, `Per ${voce.name} non risultano appalti banditi direttamente dal comune nella banca dati ANAC.`, { apri: voce.istat });
  }
  const richiesto = i.anno ?? contesto?.anno;
  const anno = annoDisponibile(s.appalti.anni, richiesto ?? Number.MAX_SAFE_INTEGER);
  const a = anno == null ? null : s.appalti.anni[String(anno)];
  if (anno == null || !a) return vuoto(voce.name, `Per ${voce.name} non ho appalti per quell'anno.`, { apri: voce.istat });

  const colonne: Colonna[] = [
    { k: "indicatore", label: "Indicatore" },
    { k: "comune", label: voce.name, dx: true },
    { k: "simili", label: "Mediana dei simili", dx: true },
  ];
  const righe: Record<string, string>[] = [];
  const grezze: Record<string, Cella>[] = [];
  const aggiungi = (indicatore: string, v: string, g: Cella, simili = "—", gs: Cella = null) => {
    righe.push({ indicatore, comune: v, simili });
    grezze.push({ indicatore, comune: g, simili: gs });
  };
  aggiungi("Lotti pubblicati", fNum(a.n), a.n);
  aggiungi("Lotti ogni 1.000 abitanti", a.n_per_1000 == null ? "n.d." : String(a.n_per_1000).replace(".", ","), a.n_per_1000);
  aggiungi("Quota di affidamenti diretti", fPct(a.quota_diretti), numero(a.quota_diretti), a.mediana_quota_diretti == null ? "—" : fPct(a.mediana_quota_diretti), numero(a.mediana_quota_diretti));
  aggiungi("Procedure aperte", fNum(a.n_aperte), a.n_aperte);
  aggiungi("Adesioni a convenzioni o accordi quadro", fNum(a.n_adesioni), a.n_adesioni);
  aggiungi("Valore mediano di un lotto", fEur(a.importo_mediano), numero(a.importo_mediano));
  aggiungi("Valore dei lotti attendibili", fEurBreve(a.importo), numero(a.importo));
  if (a.n_pnrr > 0) aggiungi("Lotti finanziati dal PNRR", fNum(a.n_pnrr), a.n_pnrr);

  const note: string[] = [];
  if (richiesto != null && richiesto !== anno && richiesto !== Number.MAX_SAFE_INTEGER) {
    note.push(`Per il ${richiesto} non ci sono dati: ti mostro il ${anno}.`);
  }
  if (nuovaRilevazione(anno)) {
    note.push("Dal 2024 cambia la rilevazione ANAC (nuovo codice dei contratti, CIG anche per i micro-affidamenti): lotti, quota di affidamenti diretti e valore mediano non sono confrontabili con gli anni prima.");
  }
  if (a.n_importo_anomalo > 0) note.push(`${fNum(a.n_importo_anomalo)} lotti con un importo impossibile (oltre 10 volte i pagamenti annui del comune) sono esclusi dai totali.`);
  if (a.n_adesioni > 0) note.push("L'importo delle adesioni a convenzioni e accordi quadro è il massimale dell'accordo, non una spesa del comune: non è sommato.");
  note.push("Sono i lotti banditi dal comune stesso, con l'importo a base di gara dichiarato, non quanto è stato pagato.");

  const fatti: Record<string, Fatto> = {
    comune: { label: "Comune", valore: voce.name },
    anno: { label: "Anno", valore: String(anno) },
    lotti: { label: "lotti pubblicati", valore: fNum(a.n) },
    quota_diretti: { label: "quota di affidamenti diretti", valore: fPct(a.quota_diretti) },
    mediana_diretti: { label: "quota mediana di affidamenti diretti dei comuni simili", valore: a.mediana_quota_diretti == null ? "n.d." : fPct(a.mediana_quota_diretti) },
    mediano: { label: "valore mediano di un lotto", valore: fEur(a.importo_mediano) },
    aperte: { label: "procedure aperte", valore: fNum(a.n_aperte) },
  };
  return {
    ok: true,
    titolo: `${voce.name} · appalti ${anno}`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto:
      `${voce.name}, ${anno}: ${fNum(a.n)} lotti banditi, ${fPct(a.quota_diretti)} affidati direttamente` +
      (a.mediana_quota_diretti != null ? ` (mediana dei comuni simili ${fPct(a.mediana_quota_diretti)})` : "") +
      `, valore mediano ${fEur(a.importo_mediano)}.`,
    note,
    apri: voce.istat,
  };
}

// ------------------------------------------------------------------ storico
/** Il reddito IRPEF vive nel suo blocco (anno d'imposta -> valori), non nella serie dei bilanci. */
function storicoReddito(voce: VoceIndice, s: SchedaComune, etichetta: string): Risultato {
  const anni = Object.keys(s.reddito ?? {}).sort();
  const serie = anni.filter((a) => s.reddito![a].medio != null);
  if (!serie.length) {
    return vuoto(voce.name, `Per ${voce.name} non ho dati sui redditi.`, { apri: voce.istat });
  }
  const prima = s.reddito![serie[0]];
  const ultima = s.reddito![serie[serie.length - 1]];
  const note: string[] = [];
  if (pochiContribuenti(ultima.contribuenti)) {
    note.push(`Ci sono solo ${fNum(ultima.contribuenti)} contribuenti: la media dipende da poche persone ed è poco stabile.`);
  }
  return {
    ok: true,
    titolo: `${voce.name} · ${etichetta}`,
    colonne: [
      { k: "anno", label: "Anno d'imposta" },
      { k: "valore", label: etichetta, dx: true },
      { k: "contribuenti", label: "Contribuenti", dx: true },
    ],
    righe: serie.map((a) => ({ anno: a, valore: fEur(s.reddito![a].medio), contribuenti: fNum(s.reddito![a].contribuenti) })),
    grezze: serie.map((a) => ({ anno: Number(a), valore: numero(s.reddito![a].medio), contribuenti: s.reddito![a].contribuenti })),
    fatti: {
      comune: { label: "Comune", valore: voce.name },
      anno_inizio: { label: "Primo anno d'imposta", valore: serie[0] },
      anno_fine: { label: "Ultimo anno d'imposta", valore: serie[serie.length - 1] },
      valore_inizio: { label: "reddito imponibile medio all'inizio", valore: fEur(prima.medio) },
      valore_fine: { label: "reddito imponibile medio alla fine", valore: fEur(ultima.medio) },
    },
    riassunto: `${voce.name}, reddito imponibile medio: ${fEur(prima.medio)} nel ${serie[0]}, ${fEur(ultima.medio)} nel ${serie[serie.length - 1]}.`,
    note,
    apri: voce.istat,
  };
}

async function storico(
  leggi: Leggi,
  indice: VoceIndice[],
  i: Extract<Intento, { tipo: "storico_comune" }>,
  contesto?: Contesto,
): Promise<Risultato> {
  const t = await trovaComune(indice, i, contesto);
  if ("errore" in t) return t.errore;
  const { voce } = t;
  const s = await leggiScheda(leggi, voce.istat);
  const etichetta = ETICHETTE_METRICA[i.metrica];
  if (i.metrica === "reddito_medio") return storicoReddito(voce, s, etichetta);
  if (!s.history.length) {
    return vuoto(voce.name, `Per ${voce.name} non ho serie storiche.`, { apri: voce.istat });
  }
  const colonne: Colonna[] = [
    { k: "anno", label: "Anno" },
    { k: "valore", label: etichetta, dx: true },
  ];
  const righe = s.history.map((h) => ({
    anno: String(h.year),
    valore: formattaMetrica(i.metrica, h[i.metrica]),
  }));
  const grezze: Record<string, Cella>[] = s.history.map((h) => ({
    anno: h.year,
    valore: numero(h[i.metrica]),
  }));
  const prima = s.history[0];
  const ultima = s.history[s.history.length - 1];
  const fatti: Record<string, Fatto> = {
    comune: { label: "Comune", valore: voce.name },
    metrica: { label: "Metrica", valore: etichetta },
    anno_inizio: { label: "Primo anno", valore: String(prima.year) },
    anno_fine: { label: "Ultimo anno", valore: String(ultima.year) },
    valore_inizio: { label: "Valore all'inizio", valore: formattaMetrica(i.metrica, prima[i.metrica]) },
    valore_fine: { label: "Valore alla fine", valore: formattaMetrica(i.metrica, ultima[i.metrica]) },
  };
  return {
    ok: true,
    titolo: `${voce.name} · ${etichetta}`,
    colonne,
    righe,
    grezze,
    fatti,
    riassunto: `${voce.name}, ${etichetta}: ${formattaMetrica(i.metrica, prima[i.metrica])} nel ${prima.year}, ${formattaMetrica(i.metrica, ultima[i.metrica])} nel ${ultima.year}.`,
    note: [],
    apri: voce.istat,
  };
}

export async function eseguiIntento(
  intento: Intento,
  leggi: Leggi,
  contesto?: Contesto,
): Promise<Risultato> {
  if (intento.tipo === "fuori_ambito") return vuoto("Fuori ambito", CAPACITA);
  const indice = (await leggi(`${URL_DATI}/indice.json`)) as VoceIndice[];
  switch (intento.tipo) {
    case "scheda_comune":
      return schedaComune(leggi, indice, intento, contesto);
    case "confronta_comuni":
      return confrontaComuni(leggi, indice, intento, contesto);
    case "classifica":
      return classifica(leggi, intento, contesto);
    case "spesa_area":
      return spesaArea(leggi, indice, intento, contesto);
    case "storico_comune":
      return storico(leggi, indice, intento, contesto);
    case "investimenti_comune":
      return investimentiComune(leggi, indice, intento, contesto);
    case "appalti_comune":
      return appaltiComune(leggi, indice, intento, contesto);
  }
}
