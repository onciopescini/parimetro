// Il motore: dato un Intento (scelto dal modello, poi validato) calcola la risposta
// leggendo i JSON del sito. Qui nasce ogni numero che l'utente vedra'.
import { percorsoClassifica, URL_DATI, type VoceIndice } from "../dati";
import { AREE, type AreaSpesa, type CategorieComune } from "../categorie";
import { eConcentrata, righeVisibili } from "../classifica";
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
import type { Colonna, Contesto, Fatto, Intento, Leggi, RifComune, Risultato } from "./tipi";

interface RigaStorico {
  year: number;
  [k: string]: number | string | null;
}
interface SchedaComune {
  history: RigaStorico[];
  peers: Record<string, Record<string, unknown> | null>;
  categorie?: Record<string, CategorieComune | null>;
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
  "dirti quanto spende un comune in una certa area (rifiuti, strade, scuole…) e come sono andati i suoi conti negli anni. " +
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
    rango: { label: "Rango nella fascia", valore: fNum(b.fhi) },
    n_simili: { label: "Comuni nella fascia", valore: fNum(peers?.n) },
    spesa_simili: { label: "Spesa pro capite mediana dei simili", valore: fEur(peers?.expenditure_pc) },
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
    trovati.map(async (v) => ({ v, b: trovaAnno(await leggiScheda(leggi, v.istat), anno) })),
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

  const fatti: Record<string, Fatto> = { anno: { label: "Anno", valore: String(anno) } };
  dati.forEach(({ v, b }, n) => {
    fatti[`nome${n}`] = { label: `Comune ${n + 1}`, valore: v.name };
    fatti[`spesa${n}`] = { label: `Spesa pro capite di ${v.name}`, valore: fEur(b?.expenditure_pc) };
    fatti[`rango${n}`] = { label: `Rango di ${v.name}`, valore: fNum(b?.fhi) };
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

// ------------------------------------------------------------------ storico
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
  }
}
