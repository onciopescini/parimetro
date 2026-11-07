// Le metriche della mappa: tipo + etichette in un modulo leggero, senza
// deck.gl. Pagina e mappa condividono i nomi ("Spesa", "Entrate"...) senza
// che la pagina debba caricarsi tutta la libreria grafica per leggere 5 stringhe.

export type MetricKey = "debt" | "expenditure" | "revenue" | "surplus" | "fhi" | "income";

export const METRIC_LABELS: Record<MetricKey, string> = {
  debt: "Debito",
  expenditure: "Spesa",
  revenue: "Entrate",
  surplus: "Avanzo/Disavanzo",
  // Non più "salute finanziaria": il punteggio è la posizione del comune fra
  // quelli della sua fascia demografica, quindi è relativo per costruzione.
  fhi: "Posizione nella fascia",
  income: "Reddito medio dei residenti",
};
