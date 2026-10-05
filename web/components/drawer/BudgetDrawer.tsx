"use client";

// ============================================================
// BudgetDrawer.tsx · Modulo 3
// Drawer laterale glassmorphism (bottom-sheet su mobile):
// header con badge del rango nella fascia demografica, KPI comparativi
// (vs comuni simili o vs media nazionale), grafici Recharts e alert
// di Civic Intelligence.
//
// Dipendenze: npm i recharts framer-motion lucide-react
// ============================================================

import { useMemo, useState } from "react";
import SpesaPerCategoria from "./SpesaPerCategoria";
import RedditoResidenti from "./RedditoResidenti";
import InvestimentiComune from "./InvestimentiComune";
import AppaltiComune from "./AppaltiComune";
import type { Appalti, Concorrenza } from "@/lib/appalti";
import NotizieComune from "./NotizieComune";
import CreaCard from "../card/CreaCard";
import type { DatiCard } from "@/lib/card/contenuto";
import { slugComune } from "@/lib/pagina/comune";
import type { NotizieComune as NotizieDati } from "@/lib/notizie";
import type { Investimenti } from "@/lib/investimenti";
import type { RedditoAnno } from "@/lib/reddito";
import type { CategorieComune } from "@/lib/categorie";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Landmark,
  MapPin,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ---------------------------------------------------------- //
// Tipi (allineati alle RPC get_municipality_history /
// get_national_averages del Modulo 1)
// ---------------------------------------------------------- //
export interface BudgetYear {
  year: number;
  revenue_total: number | null;
  expenditure_total: number | null;
  revenue_current: number | null;
  revenue_capital: number | null;
  own_revenue?: number | null;
  /** Entrate proprie su entrate correnti, in %. Una delle due componenti del rango. */
  autonomia?: number | null;
  debt_total: number | null;
  surplus_deficit: number | null;
  revenue_pc: number | null;
  expenditure_pc: number | null;
  debt_pc: number | null;
  fhi: number | null;
}

export interface MunicipalityDetail {
  istat: string;
  name: string;
  region: string;
  province: string;
  population: number;
  history: BudgetYear[];
}

export interface NationalAverages {
  revenue_pc: number;
  expenditure_pc: number;
  debt_pc: number;
  fhi: number;
}

/**
 * Mediane dei comuni della stessa fascia demografica, più la posizione del
 * comune dentro la fascia. Estende NationalAverages così le due basi di
 * confronto sono intercambiabili senza logica aggiuntiva.
 */
export interface PeerComparison extends NationalAverages {
  /** Etichetta della fascia, es. "da 1.000 a 5.000 abitanti" */
  fascia: string;
  /** Quanti comuni compongono la fascia */
  n: number;
  pct_revenue: number | null;
  pct_expenditure: number | null;
  pct_fhi: number | null;
}

interface BudgetDrawerProps {
  data: MunicipalityDetail | null;
  year: number;
  nationalAvg?: NationalAverages | null;
  peerAvg?: PeerComparison | null;
  categorie?: CategorieComune | null;
  /** Reddito IRPEF dei residenti nell'anno mostrato */
  reddito?: RedditoAnno | null;
  /** PNRR e opere di coesione (non dipendono dall'anno: sono un quadro complessivo) */
  investimenti?: Investimenti | null;
  /** Appalti banditi dal comune, anno per anno */
  appalti?: Appalti | null;
  /** Notizie sui conti (titolo, fonte, data, link); null = mai cercate: il tab non compare */
  notizie?: NotizieDati | null;
  /** Offerte e ribasso nelle gare, anno per anno */
  concorrenza?: Concorrenza | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "quadro" | "spese" | "opere" | "appalti" | "notizie" | "grafici" | "debito";

// ---------------------------------------------------------- //
// Utilità di formattazione (locale it-IT)
// ---------------------------------------------------------- //
const eur = (v: number | null | undefined, compact = false) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: 0,
      }).format(v);

const num = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("it-IT").format(v);

// Il rango e' una pillola piena (testo scuro su colore chiaro: sempre leggibile)
const fhiPill = (v: number | null | undefined) =>
  v == null ? "bg-sabbia" : v >= 70 ? "bg-menta" : v >= 40 ? "bg-limone" : "bg-pesca";

// Tema carta per Recharts
const GRID = "#E8DEC8";
const TICK = { fill: "#5A5873", fontSize: 12 };
const TOOLTIP_STYLE = {
  backgroundColor: "#FFFDF8",
  border: "1px solid #E8DEC8",
  borderRadius: 16,
  color: "#1B1A2E",
  fontSize: 13,
};

// ---------------------------------------------------------- //
// KPI Card con comparativo % vs media nazionale
// invert=true → un valore SOTTO la media è positivo (spesa, debito)
// ---------------------------------------------------------- //
function KpiCard({
  label,
  value,
  diff,
  baseline = "vs media nazionale",
  invert = false,
}: {
  label: string;
  value: string;
  diff: number | null;
  /** Contro cosa è calcolato il diff: cambia con la base di confronto scelta */
  baseline?: string;
  invert?: boolean;
}) {
  const good = diff != null && (invert ? diff < 0 : diff > 0);
  return (
    <div className="rounded-3xl border border-[#E8DEC8] bg-carta p-4">
      <div className="text-xs uppercase tracking-wide text-grigio">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-inchiostro">{value}</div>
      {diff != null && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-inchiostro ${
            good ? "bg-menta/40" : "bg-pesca/60"
          }`}
        >
          {diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(diff).toFixed(1)}% {baseline}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------- //
// Componente principale
// ---------------------------------------------------------- //
export default function BudgetDrawer({
  data,
  year,
  nationalAvg,
  peerAvg,
  categorie,
  reddito,
  investimenti,
  appalti,
  notizie,
  concorrenza,
  open,
  onClose,
}: BudgetDrawerProps) {
  const [tab, setTab] = useState<Tab>("quadro");
  const [creaCard, setCreaCard] = useState(false);
  // Passando a un comune senza notizie il tab non c'e' piu': si torna al quadro invece di mostrare il vuoto
  if (tab === "notizie" && !notizie) setTab("quadro");
  // Default sui comuni simili: è il confronto che dice qualcosa. Rispetto alla
  // media nazionale un paese di 800 abitanti risulta sempre spendaccione, ma
  // solo perché i costi fissi si dividono per pochi residenti.
  const [base, setBase] = useState<"simili" | "nazionale">("simili");

  const usaSimili = base === "simili" && !!peerAvg;
  const confronto: NationalAverages | null | undefined = usaSimili ? peerAvg : nationalAvg;
  const etichettaBase = usaSimili ? "vs comuni simili" : "vs media nazionale";

  const current = useMemo(() => {
    if (!data?.history?.length) return null;
    return data.history.find((h) => h.year === year) ?? data.history[data.history.length - 1];
  }, [data, year]);

  const pctDiff = (v?: number | null, avg?: number | null) =>
    v == null || !avg ? null : ((v - avg) / avg) * 100;

  // Cio' che serve a una card da condividere. Se l'anno mostrato non e' quello richiesto (scivola sull'ultimo
  // disponibile) i dati per anno non si mescolano: la card parla solo di anni coerenti.
  const datiCard = useMemo<DatiCard | null>(() => {
    if (!data || !current) return null;
    const coerente = current.year === year;
    return {
      voce: { istat: data.istat, name: data.name, province: data.province, region: data.region, population: data.population },
      anno: current.year,
      spesaPc: current.expenditure_pc,
      simili: coerente && peerAvg ? { fascia: peerAvg.fascia, n: peerAvg.n, expenditure_pc: peerAvg.expenditure_pc } : null,
      categorie: coerente ? (categorie ?? null) : null,
      investimenti: investimenti ?? null,
      appalti: appalti ?? null,
      concorrenza: concorrenza ?? null,
      reddito: coerente ? (reddito ?? null) : null,
    };
  }, [data, current, year, peerAvg, categorie, investimenti, appalti, concorrenza, reddito]);

  /** La sorgente porta il debito? Con SIOPE (cassa) no: è NULL su tutta la serie. */
  const haDebito = useMemo(
    () => (data?.history ?? []).some((h) => h.debt_total != null),
    [data],
  );

  // ---- Civic Intelligence: alert calcolati sulla serie storica ----
  const alerts = useMemo(() => {
    const list: { level: "ok" | "warn" | "crit"; text: string }[] = [];
    if (!data?.history?.length || !current) return list;
    const h = data.history;

    if (current.debt_pc != null) {
      if (current.debt_pc > 1200) {
        list.push({
          level: "crit",
          text: `Debito pro capite elevato: ${eur(current.debt_pc)}/ab${
            nationalAvg ? ` (media nazionale ${eur(nationalAvg.debt_pc)}/ab)` : ""
          }.`,
        });
      } else if (current.debt_pc > 700) {
        list.push({
          level: "warn",
          text: `Debito pro capite sopra la soglia di attenzione (${eur(current.debt_pc)}/ab).`,
        });
      }
    }

    const lastTwo = h.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((x) => (x.surplus_deficit ?? 0) < 0)) {
      list.push({
        // "Disavanzo di amministrazione" è un concetto di competenza: sui dati
        // di cassa il saldo negativo non lo dimostra. Formulazione neutra, vera
        // con entrambe le sorgenti.
        level: "warn",
        text: "Saldo negativo per due esercizi consecutivi.",
      });
    }

    const idx = h.findIndex((x) => x.year === current.year);
    const prev = idx > 0 ? h[idx - 1] : null;
    if (prev?.expenditure_total && current.expenditure_total) {
      const yoy = (current.expenditure_total - prev.expenditure_total) / prev.expenditure_total;
      if (yoy > 0.25) {
        list.push({
          level: "warn",
          text: `Picco di spesa anomalo: +${(yoy * 100).toFixed(0)}% rispetto al ${prev.year}.`,
        });
      }
    }

    if ((current.fhi ?? 0) >= 75) {
      list.push({
        level: "ok",
        // A rango 100 "meglio del 100%" si leggerebbe come "meglio di tutti,
        // sé compreso": meglio dirlo in chiaro.
        text:
          current.fhi === 100
            ? "È il primo della sua fascia demografica per autonomia finanziaria e saldo di gestione (al netto dei prestiti)."
            : `Fra i comuni della sua fascia demografica sta meglio del ${current.fhi}%, su autonomia finanziaria e saldo di gestione (al netto dei prestiti).`,
      });
    }
    if (!list.length) {
      list.push({ level: "ok", text: "Nessuna anomalia rilevante sugli indicatori monitorati." });
    }
    return list;
  }, [data, current, nationalAvg]);

  // ---- Dataset per i grafici ----
  const trendData = useMemo(
    () =>
      (data?.history ?? []).map((h) => ({
        year: h.year,
        Entrate: h.revenue_total,
        Spese: h.expenditure_total,
        Debito: h.debt_total,
      })),
    [data],
  );

  const stackedData = useMemo(
    () =>
      (data?.history ?? []).map((h) => ({
        year: h.year,
        "Entrate correnti": h.revenue_current,
        "Conto capitale": h.revenue_capital,
      })),
    [data],
  );

  return (
    <>
    <AnimatePresence>
      {open && data && current && (
        <motion.aside
          key={data.istat}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-40 flex max-h-[84vh] flex-col rounded-t-[32px] border-t border-[#E8DEC8] bg-crema text-inchiostro shadow-[0_12px_40px_rgba(27,26,46,0.16)] md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[440px] md:rounded-l-[32px] md:rounded-tr-none md:border-l md:border-t-0"
        >
          {/* ---------- Header ---------- */}
          <header className="flex items-start justify-between gap-3 border-b border-[#E8DEC8] p-4">
            <div>
              <h2 className="font-display text-3xl font-semibold leading-tight">{data.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-grigio">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {data.province} · {data.region}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users size={12} /> {num(data.population)} ab.
                </span>
                <span className="inline-flex items-center gap-1">
                  <Landmark size={12} /> Esercizio {current.year}
                </span>
                {/* la stessa scheda come pagina leggibile e condivisibile (testo, non mappa) */}
                <a
                  href={`/comune/${slugComune(data.name, data.istat)}`}
                  target="_blank"
                  rel="noopener"
                  className="underline decoration-grigio underline-offset-2 hover:text-inchiostro"
                >
                  Pagina del comune
                </a>
              </div>
              {datiCard && (
                <button
                  onClick={() => setCreaCard(true)}
                  className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-limone px-5 text-sm font-semibold text-inchiostro shadow-[0_4px_0_#1B1A2E] transition hover:brightness-95 active:translate-y-0.5 active:shadow-none"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                  </svg>
                  Crea la card da condividere
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                title={
                  peerAvg
                    ? `Posizione fra i ${num(peerAvg.n)} comuni della fascia ${peerAvg.fascia}: meglio del ${current.fhi ?? "—"}% di loro, su autonomia finanziaria e saldo di gestione (al netto dei prestiti).`
                    : "Posizione del comune fra quelli della sua fascia demografica (0-100)."
                }
                className={`rounded-2xl px-3 py-1.5 text-center text-inchiostro ${fhiPill(current.fhi)}`}
              >
                <div className="font-display text-xl font-bold leading-none">{current.fhi ?? "—"}</div>
                <div className="text-xs uppercase tracking-wider">Rango</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Chiudi pannello"
                className="grid size-12 place-items-center rounded-full text-grigio transition hover:bg-sabbia/30 hover:text-inchiostro"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* ---------- Tab bar ---------- */}
          <nav className="flex gap-1.5 overflow-x-auto border-b border-[#E8DEC8] p-2.5">
            {(
              [
                ["quadro", "Quadro"],
                ["spese", "Spese"],
                ["opere", "Opere"],
                ["appalti", "Appalti"],
                ...(notizie ? ([["notizie", "Notizie"]] as [Tab, string][]) : []),
                ["grafici", "Grafici"],
                ["debito", haDebito ? "Debito & Alert" : "Alert"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  tab === id ? "bg-mirtillo text-white" : "text-grigio hover:bg-sabbia/30 hover:text-inchiostro"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ---------- Contenuto ---------- */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {tab === "quadro" && (
              <>
                {peerAvg && (
                  <div>
                    <div className="flex gap-1 rounded-full border border-[#E8DEC8] bg-carta p-1">
                      {(
                        [
                          ["simili", "Comuni simili"],
                          ["nazionale", "Media nazionale"],
                        ] as ["simili" | "nazionale", string][]
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setBase(v)}
                          className={`min-h-10 flex-1 rounded-full px-3 text-sm font-medium transition-colors ${
                            base === v
                              ? "bg-mirtillo text-white"
                              : "text-grigio hover:text-inchiostro"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {usaSimili && (
                      <p className="mt-1.5 text-xs leading-snug text-grigio">
                        Confronto con i <strong className="text-inchiostro">{num(peerAvg.n)}</strong>{" "}
                        comuni della fascia <strong className="text-inchiostro">{peerAvg.fascia}</strong>,
                        sulla mediana.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <KpiCard
                    label="Entrate pro capite"
                    value={eur(current.revenue_pc)}
                    diff={pctDiff(current.revenue_pc, confronto?.revenue_pc)}
                    baseline={etichettaBase}
                  />
                  <KpiCard
                    label="Spesa pro capite"
                    value={eur(current.expenditure_pc)}
                    diff={pctDiff(current.expenditure_pc, confronto?.expenditure_pc)}
                    baseline={etichettaBase}
                    invert
                  />
                  {/* Senza debito la card sarebbe un "—" muto: al suo posto
                      l'autonomia finanziaria, che è metà del rango e che
                      altrimenti non si vedrebbe da nessuna parte. */}
                  {haDebito ? (
                    <KpiCard
                      label="Debito pro capite"
                      value={eur(current.debt_pc)}
                      diff={pctDiff(current.debt_pc, confronto?.debt_pc)}
                      baseline={etichettaBase}
                      invert
                    />
                  ) : (
                    <KpiCard
                      label="Autonomia finanziaria"
                      value={current.autonomia == null ? "—" : `${current.autonomia}%`}
                      diff={null}
                    />
                  )}
                  <KpiCard
                    label="Avanzo / Disavanzo"
                    value={eur(current.surplus_deficit, true)}
                    diff={null}
                  />
                </div>

                {/* Posizione dentro la fascia: dice più della differenza in %,
                    perché tiene conto di quanto è dispersa la fascia stessa. */}
                {usaSimili && peerAvg && (
                  <div className="space-y-2 rounded-3xl border border-[#E8DEC8] bg-carta p-3">
                    <h3 className="text-xs uppercase tracking-wider text-grigio">
                      Posizione nella fascia
                    </h3>
                    {(
                      // Il rango non è in elenco: è già il badge in testata,
                      // che ORA è esattamente questo percentile.
                      [
                        ["Entrate pro capite", peerAvg.pct_revenue],
                        ["Spesa pro capite", peerAvg.pct_expenditure],
                      ] as [string, number | null][]
                    ).map(([label, pct]) =>
                      pct == null ? null : (
                        <div key={label}>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-inchiostro">{label}</span>
                            <span className="text-grigio">
                              più alto del {pct}% dei simili
                            </span>
                          </div>
                          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sabbia/50">
                            <div
                              className="h-full rounded-full bg-mirtillo"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
                {current.revenue_total == null && (
                  <p className="rounded-3xl border border-limone bg-limone/30 p-3 text-sm leading-relaxed text-inchiostro">
                    Per il {current.year} SIOPE riporta i pagamenti di questo comune ma nessun
                    incasso (di solito il tesoriere non ha trasmesso le riscossioni). Entrate, saldo e
                    rango non sono calcolabili: non sono zero, sono dati mancanti.
                  </p>
                )}
                <RedditoResidenti
                  reddito={reddito ?? null}
                  anno={current.year}
                  spesaPc={current.expenditure_pc}
                />
                <div className="rounded-3xl border border-[#E8DEC8] bg-carta p-3 text-sm leading-relaxed text-inchiostro">
                  Totali {current.year}: entrate {eur(current.revenue_total, true)} · spese{" "}
                  {eur(current.expenditure_total, true)}
                  {haDebito ? ` · debito ${eur(current.debt_total, true)}` : ""}.
                </div>
              </>
            )}

            {tab === "spese" && (
              <SpesaPerCategoria categorie={categorie ?? null} year={current.year} />
            )}

            {tab === "opere" && <InvestimentiComune inv={investimenti ?? null} />}

            {tab === "appalti" && <AppaltiComune appalti={appalti ?? null} concorrenza={concorrenza ?? null} anno={current.year} />}
            {tab === "notizie" && <NotizieComune notizie={notizie ?? null} />}

            {tab === "grafici" && (
              <>
                <section>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
                    Trend pluriennale
                  </h3>
                  <div className="h-48 rounded-3xl border border-[#E8DEC8] bg-carta p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trendData}>
                        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => eur(v, true)}
                          width={58}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v) => eur(v as number, true)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="Entrate" stroke="#2DBE8B" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="Spese" stroke="#3B3BD6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Debito" stroke="#F0502D" strokeWidth={3} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
                    Composizione delle entrate
                  </h3>
                  <div className="h-48 rounded-3xl border border-[#E8DEC8] bg-carta p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stackedData}>
                        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => eur(v, true)}
                          width={58}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          cursor={{ fill: "rgba(27,26,46,.05)" }}
                          formatter={(v) => eur(v as number, true)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Entrate correnti" stackId="a" fill="#2DBE8B" />
                        <Bar dataKey="Conto capitale" stackId="a" fill="#3B3BD6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </>
            )}

            {tab === "debito" && (
              <>
                {/* Con i dati di cassa SIOPE debt_total è NULL ovunque: il
                    grafico verrebbe fuori con soli assi e nessuna curva. */}
                {haDebito && (
                <section>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-grigio">
                    Evoluzione del debito
                  </h3>
                  <div className="h-40 rounded-3xl border border-[#E8DEC8] bg-carta p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trendData}>
                        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => eur(v, true)}
                          width={58}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v) => eur(v as number, true)}
                        />
                        <Line type="monotone" dataKey="Debito" stroke="#F0502D" strokeWidth={3} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                )}

                {!haDebito && (
                  <p className="rounded-3xl border border-[#E8DEC8] bg-carta p-3 text-sm leading-relaxed text-grigio">
                    Il debito non è disponibile per questa sorgente: SIOPE registra
                    incassi e pagamenti, non lo stock di indebitamento.
                  </p>
                )}

                <section className="space-y-2">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-grigio">
                    Cosa osservare
                  </h3>
                  {alerts.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-3xl border p-3 text-sm leading-relaxed ${
                        a.level === "crit"
                          ? "border-pomodoro bg-pomodoro/15 text-inchiostro"
                          : a.level === "warn"
                            ? "border-limone bg-limone/30 text-inchiostro"
                            : "border-menta bg-menta/25 text-inchiostro"
                      }`}
                    >
                      {a.level === "ok" ? (
                        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      )}
                      <span>{a.text}</span>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
    {open && creaCard && datiCard && <CreaCard key={datiCard.voce.istat} dati={datiCard} onClose={() => setCreaCard(false)} />}
    </>
  );
}
