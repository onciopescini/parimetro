// ============================================================
// BudgetDrawerDemo.jsx · Anteprima del Modulo 3 con dati finti
// Versione autonoma per l'anteprima di Claude: niente framer-motion
// (animazione CSS) e dati demo cablati. Il file "vero" del progetto
// resta components/drawer/BudgetDrawer.tsx.
// ============================================================

import { useEffect, useMemo, useState } from "react";
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

// ---------------- Dati demo ----------------
const POP = 48200;
const YEAR = 2025;

const RAW = [
  { year: 2020, rev: 46200000, exp: 45100000, debt: 44000000, fhi: 71 },
  { year: 2021, rev: 47500000, exp: 47900000, debt: 42500000, fhi: 72 },
  { year: 2022, rev: 49100000, exp: 48200000, debt: 41200000, fhi: 70 },
  { year: 2023, rev: 50600000, exp: 49000000, debt: 40800000, fhi: 69 },
  { year: 2024, rev: 55900000, exp: 62700000, debt: 43900000, fhi: 52 },
  { year: 2025, rev: 53800000, exp: 54600000, debt: 40100000, fhi: 58 },
];

const HISTORY = RAW.map((r) => ({
  year: r.year,
  revenue_total: r.rev,
  expenditure_total: r.exp,
  revenue_current: Math.round(r.rev * 0.78),
  revenue_capital: Math.round(r.rev * 0.22),
  debt_total: r.debt,
  surplus_deficit: r.rev - r.exp,
  revenue_pc: Math.round(r.rev / POP),
  expenditure_pc: Math.round(r.exp / POP),
  debt_pc: Math.round(r.debt / POP),
  fhi: r.fhi,
}));

const DATA = {
  istat: "015999",
  name: "Pieve Naviglio",
  region: "Lombardia",
  province: "Milano",
  population: POP,
  history: HISTORY,
};

const NAT = { revenue_pc: 1180, expenditure_pc: 1150, debt_pc: 640, fhi: 61 };

// ---------------- Utilità ----------------
const eur = (v, compact = false) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: 0,
      }).format(v);

const num = (v) => (v == null ? "—" : new Intl.NumberFormat("it-IT").format(v));

const fhiColor = (v) =>
  v == null
    ? "text-slate-400"
    : v >= 70
      ? "text-emerald-400"
      : v >= 40
        ? "text-amber-400"
        : "text-red-400";

const HAIR = "rgba(255,255,255,.10)";
const GLASS = {
  backgroundColor: "rgba(15,23,42,.85)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};
const CARD = {
  backgroundColor: "rgba(255,255,255,.05)",
  border: `1px solid ${HAIR}`,
  borderRadius: 14,
};

const GRID = "#1E293B";
const TICK = { fill: "#94A3B8", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(15,23,42,.92)",
  border: `1px solid ${HAIR}`,
  borderRadius: 12,
  color: "#E2E8F0",
  fontSize: 12,
};

function KpiCard({ label, value, diff, invert = false }) {
  const good = diff != null && (invert ? diff < 0 : diff > 0);
  return (
    <div className="p-3" style={CARD}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
      {diff != null && (
        <div
          className={`mt-1 flex items-center gap-1 text-xs ${
            good ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(diff).toFixed(1)}% vs media naz.
        </div>
      )}
    </div>
  );
}

export default function BudgetDrawerDemo() {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState("quadro");

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 120);
    return () => clearTimeout(t);
  }, []);

  const current =
    DATA.history.find((h) => h.year === YEAR) ?? DATA.history[DATA.history.length - 1];

  const pctDiff = (v, avg) => (v == null || !avg ? null : ((v - avg) / avg) * 100);

  const alerts = useMemo(() => {
    const list = [];
    const h = DATA.history;
    if (current.debt_pc > 1200) {
      list.push({
        level: "crit",
        text: `Debito pro capite elevato: ${eur(current.debt_pc)}/ab (media nazionale ${eur(NAT.debt_pc)}/ab).`,
      });
    } else if (current.debt_pc > 700) {
      list.push({
        level: "warn",
        text: `Debito pro capite sopra la soglia di attenzione (${eur(current.debt_pc)}/ab).`,
      });
    }
    const lastTwo = h.slice(-2);
    if (lastTwo.length === 2 && lastTwo.every((x) => (x.surplus_deficit ?? 0) < 0)) {
      list.push({
        level: "warn",
        text: "Disavanzo di amministrazione per due esercizi consecutivi.",
      });
    }
    const idx = h.findIndex((x) => x.year === current.year);
    const prev = idx > 0 ? h[idx - 1] : null;
    if (prev?.expenditure_total && current.expenditure_total) {
      const yoy =
        (current.expenditure_total - prev.expenditure_total) / prev.expenditure_total;
      if (yoy > 0.25) {
        list.push({
          level: "warn",
          text: `Picco di spesa anomalo: +${(yoy * 100).toFixed(0)}% rispetto al ${prev.year}.`,
        });
      }
    }
    if ((current.fhi ?? 0) >= 75) {
      list.push({ level: "ok", text: `Gestione virtuosa: FHI ${current.fhi}/100.` });
    }
    if (!list.length) {
      list.push({ level: "ok", text: "Nessuna anomalia rilevante sugli indicatori monitorati." });
    }
    return list;
  }, [current]);

  const trendData = DATA.history.map((h) => ({
    year: h.year,
    Entrate: h.revenue_total,
    Spese: h.expenditure_total,
    Debito: h.debt_total,
  }));
  const stackedData = DATA.history.map((h) => ({
    year: h.year,
    "Entrate correnti": h.revenue_current,
    "Conto capitale": h.revenue_capital,
  }));

  const tabs = [
    ["quadro", "Quadro generale"],
    ["grafici", "Grafici"],
    ["debito", "Debito & Alert"],
  ];

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(1100px 600px at 30% 20%, #0F172A 0%, #020617 70%)",
      }}
    >
      {/* Suggestione della mappa 3D sullo sfondo */}
      <div className="absolute bottom-0 left-8 flex items-end gap-3 opacity-30">
        {[
          [110, "#10B981"],
          [70, "#34D399"],
          [180, "#F59E0B"],
          [240, "#EF4444"],
          [90, "#F59E0B"],
          [150, "#10B981"],
        ].map(([h, c], i) => (
          <div
            key={i}
            style={{
              width: 34,
              height: h,
              background: `linear-gradient(180deg, ${c}, transparent)`,
              transform: "skewX(-12deg)",
              borderRadius: 4,
            }}
          />
        ))}
      </div>

      <div className="absolute left-6 top-6 max-w-sm">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Anteprima · dati demo
        </div>
        <div className="mt-1 text-sm leading-relaxed text-slate-400">
          Nel progetto reale questo pannello si apre cliccando un comune sulla
          mappa 3D. Qui è montato da solo, con un bilancio finto 2020–2025.
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="mt-4 rounded-lg px-4 py-2 text-sm text-slate-100"
            style={{ ...CARD, borderRadius: 10 }}
          >
            Riapri il drawer
          </button>
        )}
      </div>

      {/* ---------------- Drawer ---------------- */}
      <aside
        className="absolute inset-y-0 right-0 z-40 flex w-96 max-w-full flex-col text-slate-100 shadow-2xl"
        style={{
          ...GLASS,
          borderLeft: `1px solid ${HAIR}`,
          transform: open && shown ? "translateX(0)" : "translateX(105%)",
          transition: "transform .45s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* Header */}
        <header
          className="flex items-start justify-between gap-3 p-4"
          style={{ borderBottom: `1px solid ${HAIR}` }}
        >
          <div>
            <h2 className="text-lg font-semibold leading-tight">{DATA.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {DATA.province} · {DATA.region}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={12} /> {num(DATA.population)} ab.
              </span>
              <span className="inline-flex items-center gap-1">
                <Landmark size={12} /> Esercizio {current.year}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 text-center ${fhiColor(current.fhi)}`} style={CARD}>
              <div className="text-sm font-bold leading-none">{current.fhi}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">FHI</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Chiudi pannello"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Tab bar */}
        <nav className="flex gap-1 p-2" style={{ borderBottom: `1px solid ${HAIR}` }}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                tab === id ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
              style={tab === id ? { backgroundColor: "rgba(255,255,255,.10)" } : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Contenuto */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {tab === "quadro" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Entrate pro capite"
                  value={eur(current.revenue_pc)}
                  diff={pctDiff(current.revenue_pc, NAT.revenue_pc)}
                />
                <KpiCard
                  label="Spesa pro capite"
                  value={eur(current.expenditure_pc)}
                  diff={pctDiff(current.expenditure_pc, NAT.expenditure_pc)}
                  invert
                />
                <KpiCard
                  label="Debito pro capite"
                  value={eur(current.debt_pc)}
                  diff={pctDiff(current.debt_pc, NAT.debt_pc)}
                  invert
                />
                <KpiCard
                  label="Avanzo / Disavanzo"
                  value={eur(current.surplus_deficit, true)}
                  diff={null}
                />
              </div>
              <div className="p-3 text-xs leading-relaxed text-slate-300" style={CARD}>
                Totali {current.year}: entrate {eur(current.revenue_total, true)} · spese{" "}
                {eur(current.expenditure_total, true)} · debito {eur(current.debt_total, true)}.
              </div>
            </>
          )}

          {tab === "grafici" && (
            <>
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Trend pluriennale
                </h3>
                <div className="p-2" style={{ ...CARD, height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => eur(v, true)}
                        width={56}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => eur(v, true)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Entrate" stroke="#10B981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Spese" stroke="#38BDF8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Debito" stroke="#EF4444" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Composizione delle entrate
                </h3>
                <div className="p-2" style={{ ...CARD, height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stackedData}>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => eur(v, true)}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: "rgba(255,255,255,.04)" }}
                        formatter={(v) => eur(v, true)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Entrate correnti" stackId="a" fill="#10B981" />
                      <Bar dataKey="Conto capitale" stackId="a" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}

          {tab === "debito" && (
            <>
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Evoluzione del debito
                </h3>
                <div className="p-2" style={{ ...CARD, height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendData}>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => eur(v, true)}
                        width={56}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => eur(v, true)} />
                      <Line type="monotone" dataKey="Debito" stroke="#EF4444" strokeWidth={2} dot />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Civic Intelligence
                </h3>
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-3 text-xs leading-relaxed ${
                      a.level === "crit"
                        ? "text-red-200"
                        : a.level === "warn"
                          ? "text-amber-100"
                          : "text-emerald-100"
                    }`}
                    style={{
                      borderRadius: 14,
                      border: `1px solid ${
                        a.level === "crit"
                          ? "rgba(239,68,68,.35)"
                          : a.level === "warn"
                            ? "rgba(245,158,11,.35)"
                            : "rgba(16,185,129,.35)"
                      }`,
                      backgroundColor:
                        a.level === "crit"
                          ? "rgba(239,68,68,.10)"
                          : a.level === "warn"
                            ? "rgba(245,158,11,.10)"
                            : "rgba(16,185,129,.10)",
                    }}
                  >
                    {a.level === "ok" ? (
                      <ShieldCheck size={14} className="mt-1 shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="mt-1 shrink-0" />
                    )}
                    <span>{a.text}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
