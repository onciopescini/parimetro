// Appalti banditi da un comune (ANAC, CC BY-SA 4.0).
// Forma di get_appalti_comune() nel file comune/{istat}.json -> "appalti".

export interface AppaltiAnno {
  /** Lotti (CIG) banditi dal comune nell'anno di pubblicazione */
  n: number;
  n_per_1000: number | null;
  /** Affidamenti diretti, compresi quelli a societa' in house */
  n_diretti: number;
  quota_diretti: number | null;
  /** Mediana della quota dei comuni della stessa fascia; null se troppo pochi lotti per confrontare */
  mediana_quota_diretti: number | null;
  rango_diretti: number | null;
  n_simili: number;
  n_adesioni: number;
  n_aperte: number;
  /** null se il dato non c'e' per almeno meta' dei lotti */
  quota_piattaforma: number | null;
  n_pnrr: number;
  /** Somma dei SOLI lotti attendibili: vedi la migrazione degli appalti */
  importo: number | null;
  importo_diretti: number | null;
  importo_mediano: number | null;
  /** Importo oltre 10 volte i pagamenti annui del comune: un refuso, escluso dai totali */
  n_importo_anomalo: number;
  /** Lotti senza importo: dato mancante */
  n_senza_importo: number;
}

export interface LottoGrande {
  anno: number;
  oggetto: string | null;
  importo: number;
  tipo: string | null;
  procedura: string | null;
  cig: string;
}

/** A cosa servono i lotti di un anno, secondo la classificazione automatica (Jev): get_appalti_comune() -> "aree". */
export interface AreeAnno {
  /** Lotti (non adesioni) dell'anno */
  lotti: number;
  /** Quelli a cui il modello ha dato un'area con confidenza sufficiente */
  classificati: number;
  voci: { area: string; n: number; importo: number | null }[];
}

/** Che cosa si compra, secondo la classificazione automatica (Jev): get_appalti_comune() -> "interventi". */
export interface InterventiAnno {
  lotti: number;
  classificati: number;
  voci: { intervento: string; n: number; importo: number | null }[];
}

export const NOME_INTERVENTO: Record<string, string> = {
  nuova_opera: "Nuove opere",
  manutenzione: "Manutenzione",
  fornitura: "Forniture",
  servizio: "Servizi",
  incarico_tecnico: "Incarichi tecnici",
  non_classificabile: "Non classificabili",
};

/** Sempre nello stesso ordine, perche' si confrontino a colpo d'occhio un comune e l'altro; i non classificabili in fondo. */
const ORDINE_INTERVENTI = ["nuova_opera", "manutenzione", "fornitura", "servizio", "incarico_tecnico", "non_classificabile"];

export function vociInterventi(a: InterventiAnno): VoceArea[] {
  const tot = a.voci.reduce((s, v) => s + v.n, 0);
  if (tot <= 0) return [];
  return a.voci
    .filter((v) => v.intervento in NOME_INTERVENTO)
    .map((v) => ({ area: v.intervento, n: v.n, importo: v.importo, quota: Math.round((1000 * v.n) / tot) / 10 }))
    .sort((x, y) => ORDINE_INTERVENTI.indexOf(x.area) - ORDINE_INTERVENTI.indexOf(y.area));
}

export interface Appalti {
  anni: Record<string, AppaltiAnno>;
  tipi: Record<string, number>;
  famiglie: Record<string, number>;
  maggiori: LottoGrande[];
  /** Solo gli anni gia' classificati; assente nei file vecchi */
  aree?: Record<string, AreeAnno>;
  /** Solo gli anni con il tipo di intervento */
  interventi?: Record<string, InterventiAnno>;
}

export interface VoceArea {
  area: string;
  n: number;
  /** Quota dei lotti dell'anno, 0-100 (un decimale) */
  quota: number;
  importo: number | null;
}

/**
 * Le voci da mostrare: le aree in ordine di numero di lotti, con "non classificabili" sempre in fondo (non e' un'area,
 * e' cio' che il modello non ha saputo dire). Le quote sono sui lotti, non sugli importi: gli importi dei lotti sono
 * troppo irregolari per fare da misura.
 */
export function vociAree(a: AreeAnno): VoceArea[] {
  const tot = a.voci.reduce((s, v) => s + v.n, 0);
  if (tot <= 0) return [];
  const voci = a.voci.map((v) => ({ area: v.area, n: v.n, importo: v.importo, quota: Math.round((1000 * v.n) / tot) / 10 }));
  return [
    ...voci.filter((v) => v.area !== "non_classificabile").sort((x, y) => y.n - x.n),
    ...voci.filter((v) => v.area === "non_classificabile"),
  ];
}

/** Quanta parte dei lotti ha un'area, in percentuale intera. */
export const copertura = (a: AreeAnno) => (a.lotti > 0 ? Math.round((100 * a.classificati) / a.lotti) : 0);

/** Concorrenza nelle gare vere (aperte, ristrette, negoziate) di un anno: get_concorrenza_comune(). */
export interface ConcorrenzaAnno {
  n_gare: number;
  /** Gare di cui si sa quante offerte sono arrivate */
  n_con_offerte: number;
  n_offerta_unica: number;
  /** null sotto 5 gare con l'informazione */
  quota_offerta_unica: number | null;
  mediana_quota_offerta_unica: number | null;
  rango_offerta_unica: number | null;
  n_simili: number;
  offerte_mediane: number | null;
  /** null sotto 5 gare che lo indicano */
  ribasso_mediano: number | null;
}

export type Concorrenza = Record<string, ConcorrenzaAnno>;

export const FAMIGLIE: Record<string, string> = {
  diretto: "affidamenti diretti",
  in_house: "affidamenti in house",
  adesione: "adesioni a convenzioni o accordi quadro",
  aperta: "procedure aperte",
  ristretta: "procedure ristrette",
  negoziata: "procedure negoziate",
  altra: "altre procedure",
};

/**
 * Dal 2024 la rilevazione ANAC cambia (nuovo codice dei contratti, CIG anche per i micro-affidamenti
 * su piattaforme certificate): i lotti, la quota di affidamenti diretti e l'importo mediano non sono
 * confrontabili con gli anni prima. Il confronto con i comuni simili dello STESSO anno resta valido.
 */
export const PRIMO_ANNO_NUOVA_RILEVAZIONE = 2024;

export const nuovaRilevazione = (anno: number) => anno >= PRIMO_ANNO_NUOVA_RILEVAZIONE;

/** L'anno da mostrare: quello richiesto se ci sono dati, altrimenti l'ultimo disponibile. */
export function annoDisponibile(anni: Record<string, unknown>, richiesto: number): number | null {
  if (String(richiesto) in anni) return richiesto;
  const ordinati = Object.keys(anni).map(Number).sort((a, b) => a - b);
  return ordinati.length ? ordinati[ordinati.length - 1] : null;
}
