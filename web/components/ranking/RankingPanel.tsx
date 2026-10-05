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
import { eConcentrata, righeVisibili } from "@/lib/classifica";

export interface RankingRow extends MunicipalityProps {
  posizione: number;
  valore: number | null;
  fhi: number | null;
  autonomia: number | null;
  fascia: string;
  /** % della spesa dell'anno in una sola voce (null se manca il dettaglio) */
  concentrata?: number | string | null;
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
  ["reddito_medio", "Reddito imponibile medio"],
  ["pnrr_pc", "PNRR per abitante"],
  ["opere_pc", "Opere di coesione per abitante"],
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
  anno,
  onSelect,
  onClose,
  caricaFiltri,
  caricaClassifica,
}: {
  onSelect: (r: RankingRow) => void;
  onClose: () => void;
  caricaFiltri: () => Promise<RankingFilters>;
  caricaClassifica: (q: RankingQuery) => Promise<RankingRow[]>;
  /** Serve a riconoscere una risposta vecchia quando cambia l'esercizio */
  anno: number;
}) {
  const [filtri, setFiltri] = useState<RankingFilters | null>(null);
  const [erroreFiltri, setErroreFiltri] = useState<string | null>(null);
  const [q, setQ] = useState<RankingQuery>({
    metric: "fhi",
    fascia: null,
    region: null,
    desc: true,
  });
  // L'esito porta con se' la richiesta a cui risponde: "sta caricando" e'
  // semplicemente "l'ultima risposta non e' per la richiesta attuale". Cosi' non
  // si impostano stati all'inizio dell'effetto, e una risposta in ritardo di
  // un filtro precedente non puo' comparire sotto quello nuovo.
  const chiave = `${anno}|${JSON.stringify(q)}`;
  const [esito, setEsito] = useState<{
    chiave: string;
    righe: RankingRow[];
    errore: string | null;
  } | null>(null);
  // Chi vuole il confronto fra gestioni ordinarie toglie gli anni a spesa concentrata
  const [nascondiConcentrate, setNascondi] = useState(false);
  const caricando = esito?.chiave !== chiave;
  const righe = righeVisibili(esito?.chiave === chiave ? esito.righe : [], nascondiConcentrate);
  const errore = esito?.chiave === chiave ? esito.errore : null;

  useEffect(() => {
    caricaFiltri()
      .then(setFiltri)
      .catch((e) => setErroreFiltri(String(e)));
  }, [caricaFiltri]);

  useEffect(() => {
    let annullato = false;
    caricaClassifica(q)
      .then((r) => {
        if (!annullato) setEsito({ chiave, righe: r, errore: null });
      })
      .catch((e) => {
        if (!annullato) setEsito({ chiave, righe: [], errore: String(e) });
      });
    return () => {
      annullato = true;
    };
  }, [q, caricaClassifica, chiave]);

  const sel =
    "mt-1 w-full rounded-xl border border-[#E8DEC8] bg-crema px-2 py-1 text-xs text-inchiostro";
  const etichetta = "mt-2 block text-xs uppercase tracking-wider text-grigio";

  return (
    <div className="pointer-events-auto absolute left-4 top-4 flex max-h-[calc(100dvh-2rem)] w-72 flex-col rounded-3xl border border-[#E8DEC8] bg-crema p-3 text-inchiostro">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label="Torna ai controlli"
          className="rounded-xl p-1 text-grigio hover:bg-sabbia/30 hover:text-inchiostro"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 className="font-display text-xl font-semibold">Classifiche</h2>
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
            className={`flex-1 rounded-xl px-2 py-1 text-xs transition-colors ${
              q.desc === v
                ? "bg-mirtillo text-white"
                : "text-grigio hover:bg-sabbia/30 hover:text-inchiostro"
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

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-snug text-inchiostro">
        <input
          type="checkbox"
          checked={nascondiConcentrate}
          onChange={(e) => setNascondi(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Nascondi i comuni con spesa concentrata
          <span className="block text-xs text-grigio">
            quelli in cui una sola voce supera il 40% dell&apos;anno (un immobile, una ricostruzione)
          </span>
        </span>
      </label>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {(errore ?? erroreFiltri) && (
          <p className="text-xs text-inchiostro">
            Classifica non disponibile: {errore ?? erroreFiltri}
          </p>
        )}

        {caricando && !errore && (
          <div className="flex items-center gap-2 py-3 text-xs text-grigio">
            <Loader2 size={12} className="animate-spin" /> Calcolo…
          </div>
        )}

        {!caricando && !errore && !righe.length && (
          <p className="py-3 text-xs text-grigio">Nessun comune con questi filtri.</p>
        )}

        {!caricando &&
          righe.map((r) => (
            <button
              key={r.istat}
              onClick={() => onSelect(r)}
              className="flex w-full items-baseline gap-2 rounded-xl px-1.5 py-1.5 text-left hover:bg-sabbia/30"
            >
              <span className="w-4 shrink-0 text-xs tabular-nums text-grigio">
                {r.posizione}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-inchiostro">
                  {r.name}
                  {eConcentrata(r.concentrata) && (
                    <span
                      title={`Il ${Math.round(Number(r.concentrata ?? 0))}% della spesa dell'anno è una sola voce: il pro capite non è confrontabile con i vicini.`}
                      className="ml-1.5 rounded bg-limone/30 px-1 py-px text-xs font-medium text-inchiostro"
                    >
                      spesa concentrata
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-grigio">
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
              <span className="shrink-0 text-xs font-medium tabular-nums text-inchiostro">
                {formatta(q.metric, r.valore)}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
