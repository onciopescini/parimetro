// Un mondo finto con la stessa forma dei file veri: serve ai test della chat e dell'MCP.
import type { Leggi } from "../../lib/chat/tipi";
import { percorsoClassifica, type VoceIndice } from "../../lib/dati";

// ---- un mondo finto, con la stessa forma dei file veri ----------------------------
export const v = (istat: string, name: string, province: string, population: number, region = "Lazio"): VoceIndice => ({
  istat, name, region, province, population, lon: 12, lat: 42,
});
export const INDICE: VoceIndice[] = [
  v("058091", "Roma", "Roma", 2_750_000),
  v("015146", "Milano", "Milano", 1_370_000, "Lombardia"),
  v("070006", "Campobasso", "Campobasso", 48_000, "Molise"),
  v("004083", "Elva", "Cuneo", 78, "Piemonte"),
  v("001001", "Castro", "Bergamo", 1_300, "Lombardia"),
  v("075099", "Castro", "Lecce", 2_400, "Puglia"),
  v("001002", "San Giovanni al Natisone", "Udine", 6_000, "Friuli-Venezia Giulia"),
  v("001003", "San Giovanni Rotondo", "Foggia", 26_000, "Puglia"),
];

export const anno = (year: number, k: number) => ({
  year, population: 1000 * k, revenue_pc: 1000 + k * 10, expenditure_pc: 900 + k * 10,
  fhi: 40 + k, autonomia: 55.5, surplus_deficit: 1_500_000 * k, revenue_total: 3e6 * k, expenditure_total: 2.5e6 * k,
});
export const categorie = (concentrata: boolean) => ({
  totale: 1_000_000,
  aree: [
    { area: "rifiuti", importo: 300_000, pc: 150, mediana_pc: 120, n_simili: 10, rango: 80 },
    { area: "strade_trasporti", importo: 200_000, pc: 100, mediana_pc: 110, n_simili: 10, rango: 40 },
    { area: "personale", importo: 0, pc: 0, mediana_pc: 90, n_simili: 10, rango: 0 },
  ],
  nature: [],
  voci: [{ codice: "U2020109999", descrizione: "Beni immobili n.a.c.", area: "patrimonio", importo: concentrata ? 700_000 : 100_000 }],
  altre_voci: { n: 0, importo: 0 },
});
export const scheda = (k: number, concentrata = false) => ({
  history: [anno(2023, k), anno(2024, k)],
  peers: {
    "2023": null,
    "2024": { fascia: "x", n: 12, revenue_pc: 1000, expenditure_pc: 880, debt_pc: null, fhi: 50, pct_revenue: 50, pct_expenditure: 50, pct_fhi: 50 },
  },
  categorie: { "2023": null, "2024": categorie(concentrata) },
  appalti: {
    anni: {
      "2023": { n: 200, n_per_1000: 2.5, n_diretti: 120, quota_diretti: 60, mediana_quota_diretti: 70, rango_diretti: 30, n_simili: 12, n_adesioni: 10, n_aperte: 20, quota_piattaforma: 80, n_pnrr: 3, importo: 30_000_000, importo_diretti: 4_000_000, importo_mediano: 40_000, n_importo_anomalo: 0, n_senza_importo: 0 },
      "2024": { n: 600, n_per_1000: 7.5, n_diretti: 540, quota_diretti: 90, mediana_quota_diretti: 88.6, rango_diretti: 55, n_simili: 12, n_adesioni: 5, n_aperte: 15, quota_piattaforma: null, n_pnrr: 4, importo: 25_000_000, importo_diretti: 9_000_000, importo_mediano: 16_000, n_importo_anomalo: 2, n_senza_importo: 7 },
    },
    tipi: { LAVORI: 100, SERVIZI: 400, FORNITURE: 100 },
    famiglie: { diretto: 660, aperta: 35, adesione: 15 },
    maggiori: [{ anno: 2023, oggetto: "Raccolta rifiuti", importo: 9_000_000, tipo: "SERVIZI", procedura: "PROCEDURA APERTA", cig: "CIG1" }],
  },
  concorrenza: {
    "2024": { n_gare: 30, n_con_offerte: 28, n_offerta_unica: 10, quota_offerta_unica: 35.7, mediana_quota_offerta_unica: 28.6, rango_offerta_unica: 70, n_simili: 12, offerte_mediane: 2, ribasso_mediano: 8.4 },
  },
  investimenti: {
    pnrr: {
      n: 10, fin_pnrr: concentrata ? 3_000_000 : 20_000_000, fin_totale: 25_000_000, pc: 500, mediana_pc: 300, rango: 80, n_simili: 12, conclusi: 4,
      missioni: [{ missione: "M4", descr: "Istruzione", n: 6, fin_pnrr: 12_000_000 }],
      progetti: [
        { cup: "J1", titolo: "Asilo nido", misura: "Nidi", fin_pnrr: concentrata ? 2_700_000 : 5_000_000, fin_totale: 6_000_000, stato: "In Corso", data_fine: "2026-03-31" },
        { cup: "J2", titolo: "Scuola", misura: "Scuole", fin_pnrr: 1_000_000, fin_totale: 1_200_000, stato: "Concluso", data_fine: "2025-06-30" },
      ],
    },
    coesione: {
      opere: {
        n: 3, fin: 8_000_000, pagamenti: 5_000_000, pc: 400, mediana_pc: 700, rango: 30, n_simili: 12,
        stati: { Concluso: 3 }, cicli: [{ ciclo: 2, n: 3, fin: 8_000_000 }],
        progetti: [{ titolo: "Strada di collegamento", ciclo: 2, tema: "Trasporti", fin: 5_000_000, pagamenti: 4_000_000, stato: "Concluso", inizio: 2016, fine: 2019, link: "https://opencoesione.gov.it/x/" }],
      },
      altri: { incentivi: { n: 40, fin: 900_000 }, contributi: { n: 200, fin: 150_000 } },
    },
  },
  reddito: {
    "2023": { contribuenti: concentrata ? 50 : 700 * k, medio: 19000 + k * 500, pc: 12000, addizionale_media: 150, rango: 40, mediana_simili: 20000, n_simili: 12 },
    "2024": { contribuenti: concentrata ? 50 : 700 * k, medio: 20000 + k * 1000, pc: 13000, addizionale_media: null, rango: 60, mediana_simili: 21000, n_simili: 12 },
  },
});
export const riga = (posizione: number, name: string, concentrata: number | string | null) => ({
  posizione, istat: "00000" + posizione, name, province: "XX", population: 500, valore: "50000.5", fhi: 90, autonomia: "80", fascia: "f", concentrata, lon: 1, lat: 1,
});

export const FILE: Record<string, unknown> = {
  "/dati/anni.json": [2023, 2024],
  "/dati/indice.json": INDICE,
  "/dati/comune/058091.json": scheda(2),
  "/dati/comune/015146.json": scheda(3),
  "/dati/comune/004083.json": scheda(1, true),
  "/dati/classifiche/filtri-2024.json": { fasce: [], regioni: ["Lazio", "Molise", "Trentino-Alto Adige/Südtirol", "Valle d'Aosta/Vallée d'Aoste"] },
  [percorsoClassifica(2024, "expenditure_pc", true, null, null)]: [
    riga(1, "Elva", "90.1"), riga(2, "Piccolo", 10), riga(3, "Altro", "55"), riga(4, "Quarto", null),
  ],
};
export const leggi: Leggi = async (p) => {
  if (!(p in FILE)) throw new Error(`${p}: HTTP 404`);
  return FILE[p];
};
