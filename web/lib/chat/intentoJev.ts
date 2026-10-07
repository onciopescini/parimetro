// Dalla domanda a un Intento, con Jev al posto di un modello che scrive.
//
// Jev SCEGLIE tra opzioni chiuse (che domanda e' e con quale metrica), il codice LEGGE cio' che sta scritto nel testo
// (quali comuni, quale regione, quale anno, quale fascia). Nessuna parola di Jev finisce nell'intento senza passare dalla
// stessa validazione di sempre (validaIntento): al massimo sceglie la domanda sbagliata, mai una che il motore non conosce.
// Se Jev non risponde o dubita, chi chiama passa al traduttore a modello (ripiego).
import { AREE } from "../categorie";
import { chiediJev, probabilitaScelta, type DomandaJev, type OpzioniJev, type RisposteJev } from "./jev";
import { preparaIndice, trovaAnno, trovaComuni, trovaRegione, type MenzioneComune } from "./menzioni";
import { validaIntento } from "./intento";
import { METRICHE, METRICHE_STORICO, type Contesto, type Intento } from "./tipi";
import type { VoceIndice } from "../dati";

/** Sotto questa probabilita' la scelta della domanda non e' abbastanza sicura: meglio il ripiego. */
export const SOGLIA_TIPO = 0.6;
/** Per i parametri che Jev sceglie (metrica, area): sotto questa si scarta il parametro. */
export const SOGLIA_PARAMETRO = 0.5;

const TIPI: Record<string, string> = {
  scheda_comune: "wants an overview or the main figures of ONE specific named municipality (how it is doing, its budget, its finances)",
  confronta_comuni: "wants to compare TWO OR MORE named municipalities with each other",
  classifica: "wants a ranking or list of the best, worst, highest or lowest municipalities by some measure, among many municipalities rather than one named town",
  spesa_area: "asks how much ONE named municipality spends on a specific area such as waste, schools, roads, social services or culture",
  storico_comune: "asks how a figure of ONE named municipality changed over the years (trend, history, evolution)",
  investimenti_comune: "asks about PNRR funds, public works or investments of ONE named municipality",
  appalti_comune: "asks about public tenders, contracts, direct awards or procurement of ONE named municipality",
  fuori_ambito: "anything else: opinions, forecasts, politics, greetings, instructions given to the assistant, or questions the data cannot answer",
};

const METRICHE_DESCR: Record<string, string> = {
  fhi: "overall financial health rank within the size group: which municipalities are managed best or worst",
  autonomia: "financial autonomy: the share of revenue a municipality raises by itself",
  expenditure_pc: "spending per resident",
  revenue_pc: "revenue per resident",
  reddito_medio: "average taxable income of the residents: how much people living there earn",
  pnrr_pc: "PNRR (recovery plan) funds per resident",
  opere_pc: "public works funded by cohesion policy per resident",
};

const STORICO_DESCR: Record<string, string> = {
  revenue_pc: "revenue per resident",
  expenditure_pc: "spending per resident",
  fhi: "financial health rank",
  autonomia: "financial autonomy",
  surplus_deficit: "surplus or deficit (cash balance)",
  revenue_total: "total revenue",
  expenditure_total: "total spending",
  reddito_medio: "average taxable income of residents",
};

const NESSUNA = "nessuna";

const solo = <T extends string>(chiavi: readonly T[], descr: Record<string, string>) =>
  Object.fromEntries(chiavi.map((k) => [k, descr[k] ?? k]));

function domande(): Record<string, DomandaJev> {
  return {
    tipo: {
      type: "choice",
      instructions: "What kind of question is the user asking about the finances of Italian municipalities?",
      criteria: TIPI,
    },
    metrica: {
      type: "choice",
      instructions: "If the user asks for a ranking of municipalities, by which measure?",
      criteria: { ...solo(METRICHE, METRICHE_DESCR), [NESSUNA]: "not a ranking, or none of these measures" },
    },
    basso: {
      type: "noul",
      instructions: "The user wants the LOWEST, smallest, worst or least first (for example 'who spends least', 'the worst', 'the lowest').",
    },
    senza_concentrate: {
      type: "noul",
      instructions: "The user asks to exclude municipalities with one-off investments or concentrated spending from the ranking.",
    },
    area: {
      type: "choice",
      instructions: "If the user asks about spending of one municipality on a specific area, which area?",
      criteria: {
        ...Object.fromEntries(Object.entries(AREE).map(([k, v]) => [k, v])),
        [NESSUNA]: "no specific spending area is mentioned",
      },
    },
    metrica_storico: {
      type: "choice",
      instructions: "If the user asks how a figure of one municipality changed over the years, which figure?",
      criteria: { ...solo(METRICHE_STORICO, STORICO_DESCR), [NESSUNA]: "no trend over time is asked" },
    },
  };
}

export interface RiferimentiChat {
  forme: Map<string, VoceIndice[]>;
  regioni: string[];
  anni: number[];
}

export function preparaRiferimenti(indice: VoceIndice[], anni: number[]): RiferimentiChat {
  return { forme: preparaIndice(indice), regioni: [...new Set(indice.map((v) => v.region))], anni };
}

export type EsitoJev =
  | { ok: true; intento: Intento; probabilita: number }
  | { ok: false; motivo: "senza_risposta" | "dubbio" | "incompleto"; probabilita?: number };

/** Il testo che Jev legge: la domanda e due fatti che il codice ha gia' stabilito (quanti comuni, se ce n'e' uno aperto). */
export function statoPerJev(domanda: string, nComuni: number, contesto?: Contesto): string {
  return `User question (Italian): ${domanda}\nMunicipalities named in the question: ${nComuni}.\nA municipality page is currently open on the site: ${contesto?.istat ? "yes" : "no"}.`;
}

function scelta(r: RisposteJev, k: string, soglia = SOGLIA_PARAMETRO): string | undefined {
  const c = r[k]?.choice;
  return c && c !== NESSUNA && probabilitaScelta(r[k]) >= soglia ? c : undefined;
}

/** Il comune (o i comuni) di cui parla la domanda: chi e' nominato; altrimenti quello aperto sul sito. */
function riferimenti(menzioni: MenzioneComune[], corrente: boolean, contesto?: Contesto): { comune: string; provincia?: string }[] {
  const uso = menzioni.map(({ comune, provincia }) => ({ comune, provincia }));
  if (corrente && contesto?.istat && uso.length === 0) return [{ comune: "@corrente" }];
  if (uso.length === 0 && contesto?.istat) return [{ comune: "@corrente" }];
  return uso;
}

export async function intentoConJev(
  domanda: string,
  contesto: Contesto | undefined,
  rif: RiferimentiChat,
  jev: OpzioniJev,
): Promise<EsitoJev> {
  const m = trovaComuni(domanda, rif.forme);
  const r = await chiediJev(statoPerJev(domanda, m.comuni.length, contesto), domande(), jev);
  if (!r) return { ok: false, motivo: "senza_risposta" };

  const tipo = r.tipo?.choice;
  const p = probabilitaScelta(r.tipo);
  if (!tipo || !(tipo in TIPI) || p < SOGLIA_TIPO) return { ok: false, motivo: "dubbio", probabilita: p };
  if (tipo === "fuori_ambito") return { ok: true, intento: { tipo: "fuori_ambito" }, probabilita: p };

  const comuni = riferimenti(m.comuni, m.corrente, contesto);
  // Piu' comuni nominati dove ne serve uno solo: vale il piu' "forte" (maiuscola, piu' parole, introdotto da "di"...); a parita' il primo
  const uno = (): { comune: string; provincia?: string }[] => {
    if (m.comuni.length <= 1) return comuni.slice(0, 1);
    const forti = m.comuni.filter((c) => c.forte);
    return (forti.length ? forti : m.comuni).slice(0, 1).map(({ comune, provincia }) => ({ comune, provincia }));
  };
  const anno = trovaAnno(domanda, rif.anni);

  let grezzo: Record<string, unknown>;
  switch (tipo) {
    case "scheda_comune":
    case "investimenti_comune":
    case "appalti_comune": {
      const c = uno();
      if (!c.length) return { ok: false, motivo: "incompleto", probabilita: p };
      grezzo = { tipo, ...c[0], ...(tipo !== "investimenti_comune" && anno ? { anno } : {}) };
      break;
    }
    case "confronta_comuni": {
      // "Confrontalo con Isernia": un solo comune nominato e uno aperto sul sito -> il confronto e' tra i due
      const aperto = contesto?.istat;
      const da = m.comuni.length === 1 && aperto && m.comuni[0].comune !== aperto ? [{ comune: "@corrente" }, ...comuni] : comuni;
      if (da.length < 2) return { ok: false, motivo: "incompleto", probabilita: p };
      grezzo = { tipo, comuni: da.slice(0, 4), ...(anno ? { anno } : {}) };
      break;
    }
    case "classifica": {
      const metrica = scelta(r, "metrica");
      if (!metrica) return { ok: false, motivo: "incompleto", probabilita: p };
      const regione = trovaRegione(domanda, rif.regioni);
      grezzo = {
        tipo,
        metrica,
        ordine: r.basso?.noul != null && r.basso.noul >= 0.5 ? "basso" : "alto",
        ...(regione ? { regione } : {}),
        ...(anno ? { anno } : {}),
        ...(r.senza_concentrate?.noul != null && r.senza_concentrate.noul >= 0.7 ? { senza_concentrate: true } : {}),
      };
      break;
    }
    case "spesa_area": {
      const c = uno();
      const area = scelta(r, "area");
      if (!c.length || !area) return { ok: false, motivo: "incompleto", probabilita: p };
      grezzo = { tipo, ...c[0], area };
      break;
    }
    case "storico_comune": {
      const c = uno();
      const metrica = scelta(r, "metrica_storico");
      if (!c.length || !metrica) return { ok: false, motivo: "incompleto", probabilita: p };
      grezzo = { tipo, ...c[0], metrica };
      break;
    }
    default:
      return { ok: false, motivo: "dubbio", probabilita: p };
  }
  const v = validaIntento(grezzo);
  return v.ok ? { ok: true, intento: v.intento, probabilita: p } : { ok: false, motivo: "incompleto", probabilita: p };
}

