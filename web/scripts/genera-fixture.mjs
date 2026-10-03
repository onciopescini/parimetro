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
const METRICHE = ["fhi", "autonomia", "expenditure_pc", "revenue_pc", "reddito_medio", "pnrr_pc", "opere_pc"];

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

// Reddito IRPEF finto, con la forma di get_reddito_comune(). Alpe Nera (78 abitanti) ha pochi
// contribuenti, Valle Finta l'addizionale oscurata: servono a provare gli avvisi dell'interfaccia.
const redditi = {};
const redditoDi = new Map();
for (const c of COMUNI) {
  redditi[c.istat] = {};
  for (const b of storico[c.istat]) {
    const medio = Math.round(14000 + rnd() * 18000);
    redditi[c.istat][b.year] = {
      contribuenti: Math.round(c.population * 0.7),
      medio,
      pc: Math.round(medio * 0.6),
      addizionale_media: c.istat === "990007" ? null : Math.round(100 + rnd() * 150),
      rango: [0, 50, 100][Math.floor(rnd() * 3)],
      mediana_simili: Math.round(medio * (0.8 + rnd() * 0.4)),
      n_simili: 3,
    };
    redditoDi.set(b, medio);
  }
}

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
    m === "fhi" ? b.fhi : m === "autonomia" ? b.autonomia : m === "expenditure_pc" ? b.expenditure_pc
    : m === "reddito_medio" ? redditoDi.get(b) : m === "pnrr_pc" ? b.population % 7 * 900 + 400 : m === "opere_pc" ? b.population % 5 * 700 + 300 : b.revenue_pc;
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

// Investimenti finti (PNRR e coesione) con la forma di get_investimenti_comune(). Alpe Nera non ha
// progetti PNRR; Forli' di Prova ha un'opera di coesione che pesa piu' di meta' del totale.
const investimenti = (c) => {
  const grande = c.population > 100000;
  const nP = c.istat === "990006" ? 0 : Math.max(1, Math.round(c.population / 3000));
  const finP = nP === 0 ? 0 : Math.round(c.population * (150 + rnd() * 600));
  const nO = Math.max(1, Math.round(c.population / 5000));
  const finO = Math.round(c.population * (300 + rnd() * 900));
  return {
    pnrr: {
      n: nP, fin_pnrr: finP, fin_totale: Math.round(finP * 1.15), pc: nP ? Math.round(finP / c.population) : 0,
      mediana_pc: 410, rango: nP ? [10, 55, 90][Math.floor(rnd() * 3)] : 0, n_simili: 3, conclusi: Math.floor(nP / 3),
      missioni: nP ? [{ missione: "M4", descr: "Istruzione e ricerca", n: Math.ceil(nP / 2), fin_pnrr: Math.round(finP * 0.6) },
        { missione: "M2", descr: "Rivoluzione verde e transizione ecologica", n: Math.floor(nP / 2), fin_pnrr: Math.round(finP * 0.4) }] : [],
      progetti: Array.from({ length: Math.min(nP, 5) }, (_, i) => ({
        cup: `J${c.istat}${i}`, titolo: `Progetto PNRR di prova ${i + 1}`, misura: "Asili nido", fin_pnrr: Math.round(finP / (i + 2)),
        fin_totale: Math.round((finP / (i + 2)) * 1.2), stato: i % 2 ? "Concluso" : "In Corso", data_fine: "2026-03-31",
      })),
    },
    coesione: {
      opere: {
        n: nO, fin: finO, pagamenti: Math.round(finO * 0.6), pc: Math.round(finO / c.population), mediana_pc: 720,
        rango: [20, 60, 95][Math.floor(rnd() * 3)], n_simili: 3, stati: { Concluso: nO - 0, "In corso": grande ? 2 : 0 },
        cicli: [{ ciclo: 1, n: Math.ceil(nO / 2), fin: Math.round(finO * 0.4) }, { ciclo: 2, n: Math.floor(nO / 2), fin: Math.round(finO * 0.6) }],
        progetti: Array.from({ length: Math.min(nO, 5) }, (_, i) => ({
          titolo: `Opera di prova ${i + 1}`, ciclo: 2, tema: "Trasporti e mobilita", fin: Math.round((c.istat === "990004" ? finO * 0.7 : finO) / (i + 1.5)),
          pagamenti: 0, stato: "Concluso", inizio: 2016 + i, fine: 2019 + i, link: "https://opencoesione.gov.it/",
        })),
      },
      altri: { incentivi: { n: 12, fin: 340000 }, contributi: { n: 40, fin: 90000 } },
    },
  };
};

// Appalti finti con la forma di get_appalti_comune(). Alpe Nera: nessun appalto (il file non ha la chiave);
// Valle Finta: pochi lotti, quindi niente confronto con i simili.
const appalti = (c) => {
  if (c.istat === "990006") return null;
  const anni = {};
  for (const a of ANNI) {
    const n = c.istat === "990007" ? 3 : Math.max(8, Math.round(c.population / 400));
    const quota = Math.round(500 + rnd() * 450) / 10;
    anni[a] = {
      n, n_per_1000: Math.round((1000 * n) / c.population * 10) / 10, n_diretti: Math.round((n * quota) / 100), quota_diretti: quota,
      mediana_quota_diretti: n >= 5 ? 71.5 : null, rango_diretti: n >= 5 ? [10, 50, 90][Math.floor(rnd() * 3)] : null, n_simili: 3,
      n_adesioni: a === 2024 ? 0 : 4, n_aperte: Math.round(n * 0.1), quota_piattaforma: a === 2024 ? null : 62.5, n_pnrr: a >= 2023 ? 2 : 0,
      importo: Math.round(n * 61000), importo_diretti: Math.round(n * 21000), importo_mediano: a === 2024 ? 16000 : 41000,
      n_importo_anomalo: a === 2024 && c.istat === "990001" ? 2 : 0, n_senza_importo: a === 2024 ? 7 : 0,
    };
  }
  return {
    anni, tipi: { LAVORI: 40, SERVIZI: 120, FORNITURE: 25 },
    famiglie: { diretto: 110, aperta: 14, negoziata: 22, adesione: 8, in_house: 3, altra: 2 },
    maggiori: [1, 2, 3].map((i) => ({ anno: 2023, oggetto: `Lotto di prova ${i}`, importo: 900000 / i, tipo: "LAVORI", procedura: "PROCEDURA APERTA", cig: `ABC00${i}` })),
  };
};

for (const c of COMUNI) {
  scrivi(`comune/${c.istat}.json`, {
    appalti: appalti(c),
    categorie: Object.fromEntries(ANNI.map((a) => [a,
      a === 2022 ? null : categorie(c, storico[c.istat].find((x) => x.year === a))])),
    history: storico[c.istat],
    reddito: redditi[c.istat],
    investimenti: investimenti(c),
    peers: Object.fromEntries(ANNI.map((a) => [a, {
      fascia: fascia(c.population), n: 3, revenue_pc: 1500, expenditure_pc: 1480,
      debt_pc: null, fhi: 50, pct_revenue: 40, pct_expenditure: 55, pct_fhi: 60,
    }])),
  });
}
console.log(`fixture scritta in ${DEST}: ${COMUNI.length} comuni, anni ${ANNI.join(", ")}`);
