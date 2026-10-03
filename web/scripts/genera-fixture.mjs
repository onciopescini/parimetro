// ============================================================
// Dataset FINTO per sviluppare e provare il sito senza database.
//
//   node scripts/genera-fixture.mjs
//
// Scrive in public/dati/ (cartella ignorata da git) file con la stessa forma
// di quelli prodotti da etl/05_esporta_statico.py. I comuni e i numeri sono
// inventati: i nomi sono volutamente finti e i codici ISTAT non esistono, cosi'
// non si scambiano per dati veri.
//
// Importa slug() e percorsoClassifica() dal sito stesso: la fixture non puo'
// divergere dai nomi di file che la pagina cerca. (Node 24 esegue i .ts
// eliminando i tipi, per questo l'estensione esplicita.)
// ============================================================
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { percorsoClassifica } from "../lib/dati.ts";
import { AREE, NATURE } from "../lib/categorie.ts";

const DEST = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "dati");
const ANNI = [2022, 2023, 2024];
const METRICHE = ["fhi", "autonomia", "expenditure_pc", "revenue_pc"];

// Generatore pseudo-casuale con seme: due esecuzioni danno gli stessi file
let seme = 42;
const rnd = () => ((seme = (seme * 1664525 + 1013904223) % 4294967296) / 4294967296);

const COMUNI = [
  ["990001", "Borgo Tevere", "Lazio", "Roma", 2_750_000, 12.47, 41.88],
  ["990002", "Pieve Naviglio", "Lombardia", "Milano", 1_370_000, 9.19, 45.46],
  ["990003", "Marina Vesuvio", "Campania", "Napoli", 910_000, 14.27, 40.85],
  ["990004", "Forlì di Prova", "Emilia-Romagna", "Forlì-Cesena", 117_000, 12.04, 44.22],
  ["990005", "Sant'Agata Finta", "Emilia-Romagna", "Bologna", 7_500, 11.2, 44.6],
  ["990006", "Alpe Nera", "Piemonte", "Cuneo", 78, 7.1, 44.47],
  ["990007", "Valle Finta", "Valle D'Aosta", "Aosta", 3_400, 7.32, 45.74],
].map(([istat, name, region, province, population, lon, lat]) => ({
  istat, name, region, province, population, lon, lat,
}));

const fascia = (p) =>
  p < 1000 ? "sotto 1.000 abitanti"
  : p < 5000 ? "da 1.000 a 5.000 abitanti"
  : p < 20000 ? "da 5.000 a 20.000 abitanti"
  : p < 60000 ? "da 20.000 a 60.000 abitanti"
  : p < 250000 ? "da 60.000 a 250.000 abitanti"
  : "oltre 250.000 abitanti";

const scrivi = (rel, dati) => {
  const p = join(DEST, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(dati));
};

// Un bilancio plausibile per (comune, anno)
const bilancio = (c, anno) => {
  const k = 1 + (anno - 2022) * 0.04;
  const rpc = (1100 + rnd() * 1500) * k;
  const epc = rpc * (0.9 + rnd() * 0.2);
  const rev = rpc * c.population;
  const exp = epc * c.population;
  const corr = rev * 0.8;
  const proprie = corr * (0.55 + rnd() * 0.4);
  return {
    year: anno,
    revenue_total: Math.round(rev), expenditure_total: Math.round(exp),
    revenue_current: Math.round(corr), revenue_capital: Math.round(rev - corr),
    own_revenue: Math.round(proprie), debt_total: null,
    surplus_deficit: Math.round(rev - exp),
    revenue_pc: +rpc.toFixed(2), expenditure_pc: +epc.toFixed(2), debt_pc: null,
    autonomia: +((100 * proprie) / corr).toFixed(1),
    fhi: Math.round(rnd() * 100),
  };
};

rmSync(DEST, { recursive: true, force: true });
const storico = Object.fromEntries(COMUNI.map((c) => [c.istat, ANNI.map((a) => bilancio(c, a))]));

scrivi("anni.json", ANNI);
scrivi("nazionale.json", Object.fromEntries(ANNI.map((a) => [a,
  { revenue_pc: 1500 + (a - 2022) * 60, expenditure_pc: 1480 + (a - 2022) * 60, debt_pc: null, fhi: 50 }])));
scrivi("indice.json", COMUNI.map(({ istat, name, region, province, population, lon, lat }) =>
  ({ istat, name, region, province, population, lon, lat })));

for (const a of ANNI) {
  const riga = (c) => ({ c, b: storico[c.istat].find((x) => x.year === a) });

  // Poligoni quadrati attorno al punto: bastano per vedere le colonne
  scrivi(`comuni-${a}.json`, {
    type: "FeatureCollection",
    features: COMUNI.map(riga).map(({ c, b }) => {
      const r = 0.05;
      return {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: [[[
          [c.lon - r, c.lat - r], [c.lon + r, c.lat - r], [c.lon + r, c.lat + r],
          [c.lon - r, c.lat + r], [c.lon - r, c.lat - r]]]] },
        properties: {
          istat: c.istat, name: c.name, region: c.region, province: c.province,
          population: c.population, revenue_total: b.revenue_total,
          expenditure_total: b.expenditure_total, debt_total: null,
          surplus_deficit: b.surplus_deficit, revenue_pc: b.revenue_pc,
          expenditure_pc: b.expenditure_pc, debt_pc: null, fhi: b.fhi,
        },
      };
    }),
  });

  scrivi(`province-${a}.json`, COMUNI.map(riga).map(({ c, b }) => ({
    province: c.province, region: c.region, lon: c.lon, lat: c.lat,
    population: c.population, revenue_total: b.revenue_total,
    expenditure_total: b.expenditure_total, debt_total: 0,
    surplus_deficit: b.surplus_deficit, revenue_pc: b.revenue_pc,
    expenditure_pc: b.expenditure_pc, debt_pc: 0, fhi: b.fhi,
  })));

  // Classifiche: tutte le combinazioni, come l'esportatore vero
  const fasce = [...new Set(COMUNI.map((c) => fascia(c.population)))];
  const regioni = [...new Set(COMUNI.map((c) => c.region))].sort();
  scrivi(`classifiche/filtri-${a}.json`, {
    fasce: fasce.map((f) => ({ fascia: f, n: COMUNI.filter((c) => fascia(c.population) === f).length })),
    regioni,
  });
  const valore = (b, m) =>
    m === "fhi" ? b.fhi : m === "autonomia" ? b.autonomia : m === "expenditure_pc" ? b.expenditure_pc : b.revenue_pc;
  for (const m of METRICHE)
    for (const desc of [true, false])
      for (const fa of [null, ...fasce])
        for (const re of [null, ...regioni]) {
          const righe = COMUNI.map(riga)
            .filter(({ c }) => (!fa || fascia(c.population) === fa) && (!re || c.region === re))
            .sort((x, y) => (desc ? 1 : -1) * (valore(y.b, m) - valore(x.b, m)))
            .map(({ c, b }, i) => ({
              posizione: i + 1, istat: c.istat, name: c.name, region: c.region,
              province: c.province, population: c.population, valore: valore(b, m),
              fhi: b.fhi, autonomia: b.autonomia, fascia: fascia(c.population),
              // Il primo comune finto ha una voce enorme: prova l'etichetta e il filtro
              concentrata: c.istat === "990004" ? 72.5 : +(5 + rnd() * 30).toFixed(1),
              lon: c.lon, lat: c.lat,
            }));
          // "/dati/" in testa al percorso del sito: qui si scrive relativo a public/dati
          scrivi(percorsoClassifica(a, m, desc, fa, re).replace(/^\/dati\//, ""), righe);
        }
}

// Spesa per area: quote inventate che sommano al totale, come nei dati veri.
// Il 2022 resta senza dettaglio, per provare anche il caso "non disponibile".
const categorie = (c, b) => {
  const chiavi = Object.keys(AREE);
  const pesi = chiavi.map((k) => (k === "non_attribuibile" ? 0.12 : 0.2 + rnd()));
  const somma = pesi.reduce((x, y) => x + y, 0);
  const totale = b.expenditure_total;
  const aree = chiavi.map((area, i) => {
    const importo = Math.round((totale * pesi[i]) / somma);
    const pc = +(importo / c.population).toFixed(2);
    return { area, importo, pc, mediana_pc: +(pc * (0.7 + rnd() * 0.6)).toFixed(2),
      n_simili: 3, rango: [0, 50, 100][Math.floor(rnd() * 3)] };
  }).sort((x, y) => y.importo - x.importo);
  const nat = Object.keys(NATURE);
  const nature = nat.map((natura, i) => ({ natura, importo: Math.round(totale / nat.length * (1.6 - i * 0.12)) }));
  const voci = aree.slice(0, 12).map((a, i) => ({
    codice: `U99${String(i).padStart(8, "0")}`, descrizione: `Voce di prova ${i + 1}`,
    area: a.area, importo: Math.round(a.importo * 0.6),
  }));
  return { totale, aree, nature, voci,
    altre_voci: { n: 40, importo: totale - voci.reduce((s, v) => s + v.importo, 0) } };
};

for (const c of COMUNI) {
  scrivi(`comune/${c.istat}.json`, {
    categorie: Object.fromEntries(ANNI.map((a) => [a,
      a === 2022 ? null : categorie(c, storico[c.istat].find((x) => x.year === a))])),
    history: storico[c.istat],
    peers: Object.fromEntries(ANNI.map((a) => [a, {
      fascia: fascia(c.population), n: 3, revenue_pc: 1500, expenditure_pc: 1480,
      debt_pc: null, fhi: 50, pct_revenue: 40, pct_expenditure: 55, pct_fhi: 60,
    }])),
  });
}
console.log(`fixture scritta in ${DEST}: ${COMUNI.length} comuni, anni ${ANNI.join(", ")}`);
