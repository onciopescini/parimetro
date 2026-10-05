// Cosa scrivere su una card da condividere. Funzioni pure (dati -> contenuto): il disegno sta in disegna.ts.
//
// Principi, gli stessi del resto del sito: solo cio' che i dati dicono; mai un numero senza il suo confronto coi
// comuni simili; le avvertenze sono parte della card e non si tolgono; una domanda non e' un'accusa.

import { AREE, type CategorieComune } from "../categorie";
import type { Appalti, Concorrenza } from "../appalti";
import type { Investimenti } from "../investimenti";
import type { RedditoAnno } from "../reddito";
import { eConcentrata } from "../classifica";

export type TipoCard = "cento" | "tre" | "domanda";

export interface VoceCard {
  istat: string;
  name: string;
  province: string;
  region: string;
  population: number;
}

export interface SimiliCard {
  fascia: string;
  n: number;
  expenditure_pc: number | null;
}

export interface DatiCard {
  voce: VoceCard;
  anno: number;
  /** Spesa per abitante del comune nell'anno */
  spesaPc: number | null;
  simili: SimiliCard | null;
  categorie: CategorieComune | null;
  investimenti: Investimenti | null;
  appalti: Appalti | null;
  concorrenza: Concorrenza | null;
  reddito: RedditoAnno | null;
}

// ---------------------------------------------------------------- formati (it-IT, come il resto del sito)
const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
export const euro = (v: number) => `${nf.format(Math.round(v))} €`;
export const percento = (v: number) => `${nf1.format(v)}%`;
export const milioni = (v: number) => `${nf1.format(v / 1e6)} M€`;

// ---------------------------------------------------------------- aree di spesa
/** Nomi corti per la legenda, dove il nome intero non ci sta. */
const NOME_CORTO: Record<string, string> = {
  funzionamento: "Funzionamento",
  non_attribuibile: "Non attribuibile",
  personale: "Personale",
  strade_trasporti: "Strade e trasporti",
  rifiuti: "Rifiuti",
  istruzione: "Scuole",
  sociale_sanita: "Servizi sociali",
  ambiente_territorio: "Ambiente",
  cultura_sport_turismo: "Cultura e sport",
  patrimonio: "Immobili",
  utenze: "Utenze",
  trasferimenti_imposte: "Trasferimenti e imposte",
  debito: "Debito",
  operazioni_finanziarie: "Operazioni finanziarie",
};

/** Un colore per area, sempre lo stesso: cosi' le card di comuni diversi si leggono allo stesso modo. */
export const COLORE_AREA: Record<string, string> = {
  funzionamento: "#F2B544",
  non_attribuibile: "#6C7F99",
  personale: "#2563EB",
  strade_trasporti: "#3FC1A5",
  rifiuti: "#F2725B",
  istruzione: "#7DD3FC",
  sociale_sanita: "#C084FC",
  ambiente_territorio: "#84CC16",
  cultura_sport_turismo: "#F472B6",
  patrimonio: "#FB923C",
  utenze: "#FACC15",
  trasferimenti_imposte: "#94A3B8",
  debito: "#A78BFA",
  operazioni_finanziarie: "#64748B",
};
export const COLORE_RESTO = "#3F5877";

export const nomeArea = (area: string) => NOME_CORTO[area] ?? AREE[area] ?? area;

export interface Fetta {
  nome: string;
  euro: number;
  colore: string;
}

/**
 * Su 100 euro spesi, quanti vanno a ogni voce. Le prime `quante` aree, il resto raggruppato, e la somma fa
 * SEMPRE 100 (metodo del resto piu' grande): una card che somma 99 o 101 si fa notare per il motivo sbagliato.
 */
export function ognicento(categorie: CategorieComune | null, quante = 6): Fetta[] | null {
  if (!categorie || !categorie.totale || categorie.totale <= 0) return null;
  const aree = categorie.aree.filter((a) => a.importo > 0).sort((a, b) => b.importo - a.importo);
  if (!aree.length) return null;
  const prime = aree.slice(0, quante);
  const resto = aree.slice(quante).reduce((s, a) => s + a.importo, 0);
  const pezzi = [
    ...prime.map((a) => ({ nome: nomeArea(a.area), valore: a.importo, colore: COLORE_AREA[a.area] ?? COLORE_RESTO })),
    ...(resto > 0 ? [{ nome: "Tutto il resto", valore: resto, colore: COLORE_RESTO }] : []),
  ];
  const tot = pezzi.reduce((s, p) => s + p.valore, 0);
  const grezzi = pezzi.map((p) => (100 * p.valore) / tot);
  const interi = grezzi.map(Math.floor);
  let mancano = 100 - interi.reduce((s, v) => s + v, 0);
  const ordine = grezzi.map((g, i) => ({ i, r: g - interi[i] })).sort((a, b) => b.r - a.r);
  for (let k = 0; mancano > 0; k = (k + 1) % ordine.length, mancano--) interi[ordine[k].i]++;
  return pezzi.map((p, i) => ({ nome: p.nome, euro: interi[i], colore: p.colore })).filter((f) => f.euro > 0);
}

/** Una sola voce che pesa il 40% o piu': di solito un investimento isolato, e il pro capite non e' confrontabile. */
export function spesaConcentrata(categorie: CategorieComune | null): { quota: number; voce: string } | null {
  const prima = categorie?.voci?.[0];
  if (!categorie?.totale || !prima) return null;
  const quota = (100 * prima.importo) / categorie.totale;
  return eConcentrata(quota) ? { quota: Math.round(quota), voce: prima.descrizione } : null;
}

// ---------------------------------------------------------------- tre numeri
export interface Numero {
  valore: string;
  etichetta: string;
  confronto: string;
}

const ultimo = <T>(o: Record<string, T> | null | undefined): [string, T] | null => {
  const k = Object.keys(o ?? {}).sort();
  return k.length ? [k[k.length - 1], o![k[k.length - 1]]] : null;
};

function confrontoSpesa(v: number, med: number): string {
  const d = v - med;
  if (Math.abs(d) < 0.03 * med) return `in linea con i comuni simili (${euro(med)})`;
  return `${euro(Math.abs(d))} ${d > 0 ? "più" : "meno"} dei comuni simili (${euro(med)})`;
}

/** Fino a tre numeri; meno di due non fanno una card. */
export function treNumeri(d: DatiCard): Numero[] | null {
  const out: Numero[] = [];
  if (d.spesaPc != null && d.simili?.expenditure_pc != null) {
    out.push({ valore: euro(d.spesaPc), etichetta: "spesi per abitante", confronto: confrontoSpesa(d.spesaPc, d.simili.expenditure_pc) });
  }
  const p = d.investimenti?.pnrr;
  if (p && p.n > 0 && p.fin_pnrr > 0) {
    out.push({
      valore: milioni(p.fin_pnrr),
      etichetta: `dal PNRR, in ${nf.format(p.n)} ${p.n === 1 ? "progetto" : "progetti"}`,
      confronto: `${euro(p.pc)} per abitante`,
    });
  }
  const c = ultimo(d.concorrenza);
  const a = ultimo(d.appalti?.anni);
  if (c && c[1].quota_offerta_unica != null) {
    out.push({
      valore: percento(c[1].quota_offerta_unica),
      etichetta: "delle gare con un solo concorrente",
      confronto:
        c[1].mediana_quota_offerta_unica != null
          ? `nei comuni simili: ${percento(c[1].mediana_quota_offerta_unica)} (${c[0]})`
          : `anno ${c[0]}`,
    });
  } else if (a && a[1].quota_diretti != null) {
    out.push({
      valore: percento(a[1].quota_diretti),
      etichetta: "degli appalti assegnati senza gara",
      confronto:
        a[1].mediana_quota_diretti != null ? `nei comuni simili: ${percento(a[1].mediana_quota_diretti)} (${a[0]})` : `anno ${a[0]}`,
    });
  } else if (d.reddito?.medio != null) {
    out.push({
      valore: euro(d.reddito.medio),
      etichetta: "reddito medio dei residenti",
      confronto: d.reddito.mediana_simili != null ? `nei comuni simili: ${euro(d.reddito.mediana_simili)}` : "dichiarazioni IRPEF",
    });
  }
  return out.length >= 2 ? out : null;
}

// ---------------------------------------------------------------- una domanda
export interface Domanda {
  area: string;
  nome: string;
  pc: number;
  mediana: number;
  /** "più" o "meno" della mediana dei simili */
  direzione: "più" | "meno";
  rapporto: number;
}

/** Aree dove un confronto per abitante dice poco o e' un artefatto contabile: non fanno domanda. */
const NON_FANNO_DOMANDA = new Set(["non_attribuibile", "trasferimenti_imposte", "debito", "operazioni_finanziarie"]);

/**
 * L'area dove il comune si discosta di piu' dai simili, in un senso o nell'altro. Niente domanda se la spesa e'
 * concentrata (il pro capite di quell'anno non e' confrontabile) o se i simili sono troppo pochi.
 */
export function domanda(categorie: CategorieComune | null): Domanda | null {
  if (!categorie || spesaConcentrata(categorie)) return null;
  let migliore: Domanda | null = null;
  let punteggio = 0;
  for (const a of categorie.aree) {
    if (NON_FANNO_DOMANDA.has(a.area) || a.n_simili < 10) continue;
    if (!(a.pc >= 30) || !(a.mediana_pc >= 20)) continue; // sotto queste cifre il rapporto e' rumore
    const rapporto = a.pc / a.mediana_pc;
    const forza = rapporto >= 1 ? rapporto : 1 / rapporto;
    if (forza < 1.5 || forza <= punteggio) continue;
    punteggio = forza;
    migliore = {
      area: a.area,
      nome: AREE[a.area] ?? a.area,
      pc: a.pc,
      mediana: a.mediana_pc,
      direzione: rapporto >= 1 ? "più" : "meno",
      rapporto: forza,
    };
  }
  return migliore;
}

// ---------------------------------------------------------------- avvertenze, sempre sulla card
export function avvertenza(d: DatiCard, tipo: TipoCard): string {
  const parti: string[] = [];
  const conc = spesaConcentrata(d.categorie);
  if (tipo === "domanda") parti.push("Non è un’accusa: è una domanda.");
  parti.push(`Dati di cassa ${d.anno} (incassi e pagamenti), fonte SIOPE.`);
  if (d.simili) parti.push(`Confronto con ${nf.format(d.simili.n)} comuni della stessa fascia (${d.simili.fascia}).`);
  if (tipo === "tre" && (d.concorrenza || d.appalti)) parti.push("Gare: fonte ANAC, anno più recente.");
  if (conc && tipo !== "domanda") {
    parti.push(`Una sola voce pesa il ${conc.quota}% della spesa: di solito un investimento isolato, il pro capite non è confrontabile.`);
  }
  if (tipo === "domanda") parti.push("Puoi chiederlo al Comune con l’accesso civico.");
  return parti.join(" ");
}

// ---------------------------------------------------------------- tutto insieme
export interface ContenutoCard {
  tipo: TipoCard;
  titolo: string;
  sottotitolo: string;
  anno: number;
  fette?: Fetta[];
  numeri?: Numero[];
  domanda?: Domanda;
  avvertenza: string;
  /** Nome del file da scaricare, senza estensione */
  file: string;
  /** Testo alternativo, per chi non vede l'immagine */
  descrizione: string;
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/\p{Mn}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Cosa si puo' fare con questi dati: per ogni tipo, il contenuto oppure il motivo per cui non c'e'. */
export function costruisci(d: DatiCard): Record<TipoCard, ContenutoCard | { motivo: string }> {
  const base = {
    anno: d.anno,
    sottotitolo: `${d.voce.region} · ${nf.format(d.voce.population)} abitanti`,
  };
  const out = {} as Record<TipoCard, ContenutoCard | { motivo: string }>;

  const fette = ognicento(d.categorie);
  out.cento = fette
    ? {
        ...base,
        tipo: "cento",
        titolo: d.voce.name,
        fette,
        avvertenza: avvertenza(d, "cento"),
        file: `parimetro-${slug(d.voce.name)}-ogni-100-euro`,
        descrizione: `Ogni 100 euro spesi da ${d.voce.name} nel ${d.anno}: ${fette.map((f) => `${f.euro} ${f.nome}`).join(", ")}.`,
      }
    : { motivo: "Per questo comune non c’è la spesa divisa per voce." };

  const numeri = treNumeri(d);
  out.tre = numeri
    ? {
        ...base,
        tipo: "tre",
        titolo: d.voce.name,
        numeri,
        avvertenza: avvertenza(d, "tre"),
        file: `parimetro-${slug(d.voce.name)}-tre-numeri`,
        descrizione: `${d.voce.name}: ${numeri.map((n) => `${n.valore} ${n.etichetta}`).join("; ")}.`,
      }
    : { motivo: "Servono almeno due dati confrontabili, e per questo comune non ci sono." };

  const dom = domanda(d.categorie);
  out.domanda = dom
    ? {
        ...base,
        tipo: "domanda",
        titolo: d.voce.name,
        domanda: dom,
        avvertenza: avvertenza(d, "domanda"),
        file: `parimetro-${slug(d.voce.name)}-una-domanda`,
        descrizione: `${d.voce.name}, ${dom.nome}: ${euro(dom.pc)} per abitante contro ${euro(dom.mediana)} dei comuni simili. Cosa spiega la differenza?`,
      }
    : {
        motivo: spesaConcentrata(d.categorie)
          ? "Una sola voce pesa troppo sulla spesa di quest’anno: il confronto per abitante non è affidabile."
          : "Nessuna voce di spesa si discosta abbastanza dai comuni simili per fare una domanda.",
      };
  return out;
}

export const disponibile = (c: ContenutoCard | { motivo: string }): c is ContenutoCard => "tipo" in c;
