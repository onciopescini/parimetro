"use client";

// ============================================================
// app/page.tsx
// Collega Map3D (Modulo 2) e BudgetDrawer (Modulo 3), come da
// README del progetto. In più: se .env.local non ha le chiavi
// Supabase, la pagina ripiega sulla route locale /api/geo-budget
// (geografia ISTAT reale + bilanci demo) così l'anteprima è
// navigabile subito. Appena le chiavi ci sono, passa da sola
// alla Edge Function e alle RPC vere.
//
// Lo stato della vista vive nella query string, così ogni schermata
// è un link condivisibile.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Search, Trophy, X } from "lucide-react";
import Map3D, {
  METRIC_LABELS,
  type MetricKey,
  type MunicipalityProps,
} from "@/components/map/Map3D";
import BudgetDrawer, {
  type MunicipalityDetail,
  type NationalAverages,
  type PeerComparison,
} from "@/components/drawer/BudgetDrawer";
import RankingPanel, {
  type RankingFilters,
  type RankingQuery,
  type RankingRow,
} from "@/components/ranking/RankingPanel";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Supabase è configurato? Se no, resta solo la sorgente demo locale. */
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

const supabase = HAS_SUPABASE ? createClient(SUPABASE_URL!, SUPABASE_KEY!) : null;
const DEMO_URL = "/api/geo-budget";

const METRICS: MetricKey[] = ["expenditure", "revenue", "debt", "surplus", "fhi"];

/** Riga della ricerca: i dati del comune più il punto su cui volare. */
interface Risultato extends MunicipalityProps {
  lon: number;
  lat: number;
}

export default function Home() {
  const [year, setYear] = useState(2024);
  const [heightMetric, setHeightMetric] = useState<MetricKey>("expenditure");
  const [colorMetric, setColorMetric] = useState<MetricKey>("expenditure");
  const [perCapita, setPerCapita] = useState(false);
  // true = i ~7.900 comuni estrusi già dalla vista nazionale
  const [comuniOvunque, setComuniOvunque] = useState(true);
  // Sorgente dati: Supabase (confini ISTAT + importi SIOPE di cassa) oppure la
  // route demo locale (stessi confini, importi sintetici). Resta commutabile per
  // poter confrontare i due mondi a colpo d'occhio.
  const [live, setLive] = useState(HAS_SUPABASE);

  const [detail, setDetail] = useState<MunicipalityDetail | null>(null);
  const [avg, setAvg] = useState<NationalAverages | null>(null);
  const [peers, setPeers] = useState<PeerComparison | null>(null);
  const [open, setOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; nonce: number } | null>(null);

  // ---- Stato iniziale dalla query string ------------------------------- //
  // Va letto dopo il mount e non durante il render: il server non ha la query
  // string, e leggerla in render romperebbe l'idratazione.
  const [pronto, setPronto] = useState(false);
  const comuneDaAprire = useRef<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const anno = Number(p.get("anno"));
    if (anno) setYear(anno);
    const alt = p.get("alt") as MetricKey | null;
    if (alt && METRICS.includes(alt)) setHeightMetric(alt);
    const col = p.get("col") as MetricKey | null;
    if (col && METRICS.includes(col)) setColorMetric(col);
    if (p.get("pc")) setPerCapita(p.get("pc") === "1");
    if (p.get("lod")) setComuniOvunque(p.get("lod") !== "province");
    if (HAS_SUPABASE && p.get("fonte")) setLive(p.get("fonte") !== "demo");
    comuneDaAprire.current = p.get("comune");
    setPronto(true);
  }, []);

  // ---- Esercizi disponibili, dichiarati dalla sorgente ------------------ //
  // L'elenco è legato alla sorgente da cui proviene: appena si cambia sorgente
  // torna vuoto, così non si usa mai la lista dell'altra per validare un anno.
  const [yearsInfo, setYearsInfo] = useState<{ live: boolean; anni: number[] }>({
    live,
    anni: [],
  });
  const years = yearsInfo.live === live ? yearsInfo.anni : [];

  useEffect(() => {
    if (!pronto) return;
    let annullato = false;
    (async () => {
      const anni: number[] = live
        ? ((await supabase!.rpc("get_available_years")).data ?? [])
        : await fetch(`${DEMO_URL}?lod=years`).then((r) => r.json());
      if (annullato || !anni.length) return;
      setYearsInfo({ live, anni });
      // Se l'anno scelto non esiste in questa sorgente, scivola sull'ultimo utile
      setYear((y) => (anni.includes(y) ? y : anni[anni.length - 1]));
    })();
    return () => {
      annullato = true;
    };
  }, [live, pronto]);

  // Anno passato alla mappa: avanza solo quando è confermato dalla sorgente
  // corrente. Resta null finché non lo sappiamo, così la mappa non parte con
  // un anno provvisorio e non spreca una richiesta da 5 MB.
  const [annoMappa, setAnnoMappa] = useState<number | null>(null);
  useEffect(() => {
    if (years.includes(year)) setAnnoMappa(year);
  }, [year, years]);

  // SIOPE è contabilità di cassa: debt_total è NULL su tutti i comuni, quindi
  // "Debito" darebbe una mappa piatta e un grafico vuoto. La demo locale un
  // debito sintetico invece ce l'ha, quindi lì la metrica resta.
  const metriche = useMemo(
    () => (live ? METRICS.filter((m) => m !== "debt") : METRICS),
    [live],
  );

  useEffect(() => {
    if (!metriche.includes(heightMetric)) setHeightMetric("expenditure");
    if (!metriche.includes(colorMetric)) setColorMetric("expenditure");
  }, [metriche, heightMetric, colorMetric]);

  // ---- Selezione di un comune (dalla mappa o dalla ricerca) ------------- //
  const handleSelect = useCallback(
    async (p: MunicipalityProps) => {
      const anno = annoMappa ?? year;
      const [history, nat, pari] = live
        ? await Promise.all([
            supabase!
              .rpc("get_municipality_history", { p_istat: p.istat })
              .then((r) => r.data),
            supabase!.rpc("get_national_averages", { p_year: anno }).then((r) => r.data),
            supabase!
              .rpc("get_peer_comparison", { p_istat: p.istat, p_year: anno })
              .then((r) => r.data),
          ])
        : await Promise.all([
            fetch(`${DEMO_URL}?lod=history&istat=${p.istat}`).then((r) => r.json()),
            fetch(`${DEMO_URL}?lod=national&year=${anno}`).then((r) => r.json()),
            fetch(`${DEMO_URL}?lod=peers&istat=${p.istat}&year=${anno}`).then((r) =>
              r.ok ? r.json() : null,
            ),
          ]);

      setDetail({
        istat: p.istat,
        name: p.name,
        region: p.region,
        province: p.province,
        population: p.population,
        history: history ?? [],
      });
      setAvg(nat);
      setPeers(pari ?? null);
      setOpen(true);
    },
    [year, annoMappa, live],
  );

  // ---- Ricerca --------------------------------------------------------- //
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<Risultato[]>([]);

  const cerca = useCallback(
    async (q: string): Promise<Risultato[]> => {
      if (!live) {
        const r = await fetch(`${DEMO_URL}?lod=search&q=${encodeURIComponent(q)}`);
        if (!r.ok) throw new Error(`ricerca demo: HTTP ${r.status}`);
        return r.json();
      }
      const { data, error } = await supabase!.rpc("search_municipalities", { p_query: q });
      // Un errore NON è "nessun risultato": confonderli nascondeva i timeout
      // (il ruolo anon ha statement_timeout=3s) facendo fallire in silenzio
      // il ripristino da deep link.
      if (error) throw new Error(`ricerca: ${error.message}`);
      return data ?? [];
    },
    [live],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRisultati([]);
      return;
    }
    // Debounce: senza, ogni tasto premuto è una query
    const t = setTimeout(() => {
      cerca(q)
        .then(setRisultati)
        .catch((e) => {
          // Qui svuotare la lista è giusto, ma l'errore va comunque detto:
          // altrimenti un timeout sembra un comune che non esiste.
          console.error("Ricerca fallita:", e);
          setRisultati([]);
        });
    }, 220);
    return () => clearTimeout(t);
  }, [query, cerca]);

  // ---- Classifiche ------------------------------------------------------ //
  // Solo su Supabase: la sorgente demo non ha le RPC, e comunque in produzione
  // sparisce. Meglio nascondere l'ingresso che offrire un pannello che rompe.
  const [classifiche, setClassifiche] = useState(false);

  const caricaFiltri = useCallback(async (): Promise<RankingFilters> => {
    const { data, error } = await supabase!.rpc("get_ranking_filters", {
      p_year: annoMappa ?? year,
    });
    if (error) throw new Error(error.message);
    return data;
  }, [annoMappa, year]);

  const caricaClassifica = useCallback(
    async (q: RankingQuery): Promise<RankingRow[]> => {
      const { data, error } = await supabase!.rpc("get_ranking", {
        p_year: annoMappa ?? year,
        p_metric: q.metric,
        p_fascia: q.fascia,
        p_region: q.region,
        p_desc: q.desc,
        p_limit: 15,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    [annoMappa, year],
  );

  const vaiA = useCallback(
    (r: Risultato) => {
      setFlyTo({ lon: r.lon, lat: r.lat, nonce: Date.now() });
      setQuery("");
      setRisultati([]);
      handleSelect(r);
    },
    [handleSelect],
  );

  // Comune indicato nella URL: lo apro appena la sorgente è pronta.
  // Un tentativo solo non basta: la prima chiamata dopo il caricamento parte a
  // cache fredda ed è la più esposta al timeout, quindi si riprova una volta.
  useEffect(() => {
    const istat = comuneDaAprire.current;
    if (!istat || !pronto || annoMappa === null) return;
    comuneDaAprire.current = null;

    let annullato = false;
    (async () => {
      for (let tentativo = 1; tentativo <= 2; tentativo++) {
        try {
          const res = await cerca(istat);
          const esatto = res.find((r) => r.istat === istat);
          if (annullato) return;
          if (esatto) {
            vaiA(esatto);
            return;
          }
          console.warn(`Comune ${istat} non trovato: la URL punta a un codice inesistente.`);
          return;
        } catch (e) {
          if (annullato) return;
          if (tentativo === 2) {
            console.error(`Ripristino di ${istat} fallito dopo 2 tentativi:`, e);
            return;
          }
          await new Promise((ok) => setTimeout(ok, 600));
        }
      }
    })();

    return () => {
      annullato = true;
    };
  }, [pronto, annoMappa, cerca, vaiA]);

  // ---- Stato → query string -------------------------------------------- //
  useEffect(() => {
    if (!pronto || annoMappa === null) return;
    const p = new URLSearchParams();
    p.set("anno", String(annoMappa));
    p.set("alt", heightMetric);
    p.set("col", colorMetric);
    p.set("pc", perCapita ? "1" : "0");
    p.set("lod", comuniOvunque ? "comuni" : "province");
    if (HAS_SUPABASE) p.set("fonte", live ? "supabase" : "demo");
    if (open && detail) p.set("comune", detail.istat);
    // replaceState e non push: la vista cambia in continuazione mentre si
    // regolano i controlli, e riempire la cronologia renderebbe il tasto
    // Indietro inservibile.
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [
    pronto,
    annoMappa,
    heightMetric,
    colorMetric,
    perCapita,
    comuniOvunque,
    live,
    open,
    detail,
  ]);

  return (
    <main className="relative h-dvh w-full bg-slate-950">
      {annoMappa !== null && (
        <Map3D
          year={annoMappa}
          heightMetric={heightMetric}
          colorMetric={colorMetric}
          perCapita={perCapita}
          onSelect={handleSelect}
          dataUrl={live ? undefined : DEMO_URL}
          lodThreshold={comuniOvunque ? 0 : undefined}
          scale={perCapita ? "robust" : "log"}
          palette={colorMetric === "fhi" ? "health" : "cost"}
          flyTo={flyTo}
        />
      )}

      {/* Controlli: ricerca, anno, metriche, pro capite.
          Su schermo stretto il drawer è un bottom-sheet che parte a ~170px e
          il pannello arriva a ~540: si coprirebbero. Mentre il drawer è aperto
          i controlli spariscono, e tornano appena lo si chiude. Da md in su
          c'è spazio per entrambi e non cambia nulla. */}
      {classifiche && (
        <div className={open ? "hidden md:block" : ""}>
          <RankingPanel
            onSelect={vaiA}
            onClose={() => setClassifiche(false)}
            caricaFiltri={caricaFiltri}
            caricaClassifica={caricaClassifica}
          />
        </div>
      )}

      <div
        className={`pointer-events-auto absolute left-4 top-4 w-60 rounded-xl border border-white/10 bg-slate-900/80 p-3 text-slate-200 backdrop-blur-md ${
          classifiche
            ? "hidden" // le classifiche occupano lo stesso posto
            : open
              ? "hidden md:block" // su mobile il drawer copre tutto
              : ""
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h1 className="text-sm font-semibold">Bilanci dei comuni</h1>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">3D</span>
        </div>

        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          {live
            ? "Confini e popolazione ISTAT · importi SIOPE."
            : "Confini e popolazione ISTAT reali · importi dimostrativi."}
        </p>

        {/* I dati SIOPE sono di cassa, non di competenza: dirlo è doveroso,
            perché "avanzo" qui significa saldo di cassa e non risultato
            di amministrazione. */}
        {live && (
          <p className="mt-1 text-[11px] leading-snug text-amber-300/80">
            Contabilità di cassa: incassi e pagamenti, non accertamenti e impegni.
          </p>
        )}

        <div className="relative mt-3">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un comune…"
            aria-label="Cerca un comune per nome o codice ISTAT"
            className="w-full rounded-md border border-white/10 bg-slate-800/80 py-1.5 pl-7 pr-7 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Cancella la ricerca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-200"
            >
              <X size={13} />
            </button>
          )}

          {risultati.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-white/10 bg-slate-900/95 py-1 shadow-xl backdrop-blur-md">
              {risultati.map((r) => (
                <li key={r.istat}>
                  <button
                    onClick={() => vaiA(r)}
                    className="w-full px-2 py-1.5 text-left hover:bg-white/10"
                  >
                    <div className="text-[11px] text-slate-100">{r.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {r.province} · {new Intl.NumberFormat("it-IT").format(r.population)} ab
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {HAS_SUPABASE && (
          <div className="mt-2 flex gap-1">
            {(
              [
                [true, "Supabase"],
                [false, "Demo locale"],
              ] as [boolean, string][]
            ).map(([v, label]) => (
              <button
                key={label}
                onClick={() => setLive(v)}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  live === v
                    ? "bg-white/15 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <label className="mt-3 block text-[10px] uppercase tracking-wider text-slate-400">
          Esercizio
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                y === year
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <label
          className="mt-3 block text-[10px] uppercase tracking-wider text-slate-400"
          htmlFor="height-metric"
        >
          Altezza
        </label>
        <select
          id="height-metric"
          value={heightMetric}
          onChange={(e) => setHeightMetric(e.target.value as MetricKey)}
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200"
        >
          {metriche.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>

        <label
          className="mt-2 block text-[10px] uppercase tracking-wider text-slate-400"
          htmlFor="color-metric"
        >
          Colore
        </label>
        <select
          id="color-metric"
          value={colorMetric}
          onChange={(e) => setColorMetric(e.target.value as MetricKey)}
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200"
        >
          {metriche.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>

        <button
          onClick={() => setPerCapita((v) => !v)}
          className={`mt-3 w-full rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
            perCapita
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {perCapita ? "Valori pro capite" : "Valori assoluti"}
        </button>

        <button
          onClick={() => setComuniOvunque((v) => !v)}
          className={`mt-1.5 w-full rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
            comuniOvunque
              ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {/* Niente conteggio cablato: cambia con la sorgente (SIOPE ne copre
              7.895, la demo locale 7.899) e diventerebbe subito falso. */}
          {comuniOvunque ? "Tutti i comuni" : "107 province"}
        </button>

        {live && (
          <button
            onClick={() => setClassifiche(true)}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-white/10"
          >
            <Trophy size={12} /> Classifiche
          </button>
        )}

        <p className="mt-3 text-[10px] leading-snug text-slate-500">
          Trascina per ruotare · rotella per lo zoom · clicca un comune per il
          dettaglio. In modalità province il passaggio ai comuni scatta a zoom 6.3.
        </p>
      </div>

      <BudgetDrawer
        data={detail}
        year={annoMappa ?? year}
        nationalAvg={avg}
        peerAvg={peers}
        open={open}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
