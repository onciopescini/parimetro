// Etichette e tipi della spesa per categoria. Le chiavi sono quelle di
// etl/categorie_spesa.py (AREE, NATURE): un test controlla che coincidano.

export const AREE: Record<string, string> = {
  personale: "Personale",
  rifiuti: "Rifiuti e igiene urbana",
  strade_trasporti: "Strade, illuminazione e trasporti",
  istruzione: "Scuole e istruzione",
  sociale_sanita: "Servizi sociali e sanità",
  ambiente_territorio: "Ambiente, suolo e acqua",
  cultura_sport_turismo: "Cultura, sport e turismo",
  utenze: "Utenze ed energia",
  debito: "Debito e interessi",
  trasferimenti_imposte: "Trasferimenti, contributi e imposte",
  funzionamento: "Funzionamento dell'ente",
  patrimonio: "Immobili e patrimonio",
  operazioni_finanziarie: "Operazioni finanziarie",
  non_attribuibile: "Non attribuibile",
};

export const NATURE: Record<string, string> = {
  personale: "Personale",
  imposte_e_tasse: "Imposte e tasse",
  beni_e_servizi: "Beni e servizi",
  trasferimenti_correnti: "Trasferimenti correnti",
  interessi_passivi: "Interessi passivi",
  altre_spese_correnti: "Altre spese correnti",
  investimenti: "Investimenti diretti",
  contributi_investimenti: "Contributi agli investimenti",
  altre_spese_capitale: "Altre spese in conto capitale",
  attivita_finanziarie: "Attività finanziarie",
  rimborso_prestiti: "Rimborso di prestiti",
};

export interface AreaSpesa {
  area: string;
  importo: number;
  pc: number;
  /** Mediana pro capite dei comuni della stessa fascia (gli zeri contano) */
  mediana_pc: number;
  n_simili: number;
  /** Percentile 0-100 nella fascia: quanti simili spendono meno su questa area */
  rango: number;
}

export interface VoceSpesa {
  codice: string;
  descrizione: string;
  area: string;
  importo: number;
}

export interface CategorieComune {
  totale: number;
  aree: AreaSpesa[];
  nature: { natura: string; importo: number }[];
  voci: VoceSpesa[];
  altre_voci: { n: number; importo: number };
}
