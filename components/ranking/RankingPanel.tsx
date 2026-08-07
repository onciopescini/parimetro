"use client";

// ============================================================
// RankingPanel.tsx
// Classifiche navigabili: serve a SCOPRIRE, mentre la ricerca serve a chi
// ha già un comune in mente.
//
// Prende il posto del pannello dei controlli invece di affiancarsi: così
// non c'è nulla da riposizionare e su mobile funziona senza casi speciali.
// ============================================================

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { MunicipalityProps } from "@/components/map/Map3D";

export interface RankingRow extends MunicipalityProps {
  posizione: number;
  valore: number | null;
  fhi: number | null;
  autonomia: number | null;
  fascia: string;
  lon: number;
  lat: number;
}

export interface RankingFilters {
  fasce: { fascia: string; n: number }[];
  regioni: string[];
}

export interface RankingQuery {
  metric: string;
  fascia: string | null;
  region: string | null;
  desc: boolean;
}

const METRICHE: [string, string][] = [
  ["fhi", "Rango nella fascia"],
  ["autonomia", "Autonomia finanziaria"],
  ["expenditure_pc", "Spesa pro capite"],
  ["revenue_pc", "Entrate pro capite"],
];

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const num = (v: number) => new Intl.NumberFormat("it-IT").format(v);

function formatta(metric: string, v: number | null) {
  if (v == null) return "—";
  if (metric === "fhi") return String(v);
  if (metric === "autonomia") return `${v}%`;
  return eur(v);
}

export default function RankingPanel({
  onSelect,
  onClose,
  caricaFiltri,
  caricaClassifica,
}: {
  onSelect: (r: RankingRow) => void;
  onClose: () => void;
  caricaFiltri: () => Promise<RankingFilters>;
  caricaClassifica: (q: RankingQuery) => Promise<RankingRow[]>;
}) {
  const [filtri, setFiltri] = useState<RankingFilters | null>(null);
  const [q, setQ] = useState<RankingQuery>({
    metric: "fhi",
    fascia: null,
    region: null,
    desc: true,
  });
  const [righe, setRighe] = useState<RankingRow[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    caricaFiltri()
      .then(setFiltri)
      .catch((e) => setErrore(String(e)));
  }, [caricaFiltri]);

  useEffect(() => {
    let annullato = false;
    setCaricando(true);
    setErrore(null);
    caricaClassifica(q)
      .then((r) => {
        if (!annullato) setRighe(r);
      })
      .catch((e) => {
        if (!annullato) setErrore(String(e));
      })
      .finally(() => {
        if (!annullato) setCaricando(false);
      });
    return () => {
      annullato = true;
    };
  }, [q, caricaClassifica]);

  const sel =
    "mt-1 w-full rounded-md border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200";
  const etichetta = "mt-2 block text-[10px] uppercase tracking-wider text-slate-400";

  return (
    <div className="pointer-events-auto absolute left-4 top-4 flex max-h-[calc(100dvh-2rem)] w-72 flex-col rounded-xl border border-white/10 bg-slate-900/80 p-3 text-slate-200 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label="Torna ai controlli"
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 className="text-sm font-semibold">Classifiche</h2>
      </div>

      <div className="flex gap-1 pt-1">
        {(
          [
            [true, "Migliori"],
            [false, "Peggiori"],
          ] as [boolean, string][]
        ).map(([v, label]) => (
          <button
            key={label}
            onClick={() => setQ((x) => ({ ...x, desc: v }))}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
              q.desc === v
                ? "bg-white/15 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className={etichetta} htmlFor="rank-metric">
        Ordina per
      </label>
      <select
        id="rank-metric"
        className={sel}
        value={q.metric}
        onChange={(e) => setQ((x) => ({ ...x, metric: e.target.value }))}
      >
        {METRICHE.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>

      <label className={etichetta} htmlFor="rank-fascia">
        Fascia demografica
      </label>
      <select
        id="rank-fascia"
        className={sel}
        value={q.fascia ?? ""}
        onChange={(e) => setQ((x) => ({ ...x, fascia: e.target.value || null }))}
      >
        <option value="">Tutte</option>
        {filtri?.fasce.map((f) => (
          <option key={f.fascia} value={f.fascia}>
            {f.fascia} ({num(f.n)})
          </option>
        ))}
      </select>

      <label className={etichetta} htmlFor="rank-regione">
        Regione
      </label>
      <select
        id="rank-regione"
        className={sel}
        value={q.region ?? ""}
        onChange={(e) => setQ((x) => ({ ...x, region: e.target.value || null }))}
      >
        <option value="">Tutta Italia</option>
        {filtri?.regioni.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {errore && <p className="text-[11px] text-red-300">Classifica non disponibile: {errore}</p>}

        {caricando && !errore && (
          <div className="flex items-center gap-2 py-3 text-[11px] text-slate-400">
            <Loader2 size={12} className="animate-spin" /> Calcolo…
          </div>
        )}

        {!caricando && !errore && !righe.length && (
          <p className="py-3 text-[11px] text-slate-400">Nessun comune con questi filtri.</p>
        )}

        {!caricando &&
          righe.map((r) => (
            <button
              key={r.istat}
              onClick={() => onSelect(r)}
              className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-white/10"
            >
              <span className="w-4 shrink-0 text-[11px] tabular-nums text-slate-500">
                {r.posizione}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-slate-100">{r.name}</span>
                <span className="block truncate text-[10px] text-slate-400">
                  {r.province} · {num(r.population)} ab
                  {/* Con il rango il valore è uguale per decine di comuni:
                      l'autonomia è ciò che decide l'ordine, quindi va mostrata. */}
                  {q.metric === "fhi" && r.autonomia != null
                    ? ` · autonomia ${r.autonomia}%`
                    : r.fhi != null
                      ? ` · rango ${r.fhi}`
                      : ""}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-200">
                {formatta(q.metric, r.valore)}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
