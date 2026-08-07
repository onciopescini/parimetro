// ============================================================
// demo-budget.ts
// Bilanci SINTETICI e deterministici per l'anteprima locale.
// La geografia (confini, nomi, popolazione) è reale — ISTAT via
// data/comuni.geo.json — ma questi importi sono inventati:
// servono solo a far vedere la mappa viva finché Supabase non c'è.
//
// Stesso seme → stessi numeri, così la mappa non "balla" tra un
// refresh e l'altro e le serie storiche restano coerenti.
// ============================================================

export const DEMO_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

export interface BudgetFigures {
  revenue_total: number;
  expenditure_total: number;
  revenue_current: number;
  revenue_capital: number;
  debt_total: number;
  surplus_deficit: number;
  revenue_pc: number;
  expenditure_pc: number;
  debt_pc: number;
  fhi: number;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Profilo "strutturale" del comune, stabile negli anni.
 * I comuni piccoli hanno spesa pro capite più alta (economie di scala
 * mancanti): è il pattern reale, e rende la mappa leggibile.
 */
function profile(istat: string, population: number) {
  const rnd = mulberry32(fnv1a(istat));
  const scale = clamp(Math.log10(Math.max(population, 100)) / 6, 0, 1); // 0 = borgo, 1 = metropoli
  const smallBonus = (1 - scale) * 900;

  return {
    revenuePc: 780 + smallBonus + rnd() * 700,
    expenditurePc: 760 + smallBonus + rnd() * 760,
    debtPc: rnd() ** 1.8 * 2100,
    capitalShare: 0.12 + rnd() * 0.22,
    drift: 0.9 + rnd() * 0.35,
    noise: rnd(),
  };
}

export function budgetFor(istat: string, population: number, year: number): BudgetFigures {
  const p = profile(istat, population);
  const rnd = mulberry32(fnv1a(`${istat}:${year}`));

  const t = year - 2020;
  const inflation = 1 + 0.028 * t * p.drift;
  const wobble = 0.94 + rnd() * 0.14;

  const revenue_pc = Math.round(p.revenuePc * inflation * wobble);
  const expenditure_pc = Math.round(p.expenditurePc * inflation * (0.93 + rnd() * 0.17));
  const debt_pc = Math.round(p.debtPc * (1.06 - 0.02 * t) * (0.97 + rnd() * 0.06));

  const revenue_total = revenue_pc * population;
  const expenditure_total = expenditure_pc * population;
  const debt_total = debt_pc * population;
  const revenue_capital = Math.round(revenue_total * p.capitalShare);
  const revenue_current = revenue_total - revenue_capital;
  const surplus_deficit = revenue_total - expenditure_total;

  // FHI: indebitamento (peso maggiore) + tenuta del saldo, con un filo
  // di rumore. Stesso spirito del trigger SQL del Modulo 1.
  const debtScore = clamp(debt_pc / 2000, 0, 1);
  const deficitScore = clamp(-surplus_deficit / population / 320, 0, 1);
  const fhi = Math.round(
    clamp(96 - 46 * debtScore - 34 * deficitScore + (p.noise - 0.5) * 9, 5, 98),
  );

  return {
    revenue_total,
    expenditure_total,
    revenue_current,
    revenue_capital,
    debt_total,
    surplus_deficit,
    revenue_pc,
    expenditure_pc,
    debt_pc,
    fhi,
  };
}

export function historyFor(istat: string, population: number) {
  return DEMO_YEARS.map((year) => ({ year, ...budgetFor(istat, population, year) }));
}
