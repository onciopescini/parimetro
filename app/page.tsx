"use client";

// ============================================================
// app/page.tsx
// Collega Map3D (Modulo 2) e BudgetDrawer (Modulo 3).
// I dati arrivano tutti da /api/geo-budget, che interroga il nostro
// Postgres: niente piu' Supabase e niente piu' sorgente demo.
//
// Lo stato della vista vive nella query string, così ogni schermata
// è un link condivisibile.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Unico punto di accesso ai dati: le RPC sono funzioni del nostro Postgres. */
const API = "/api/geo-budget";

/** Chiama la route e non lascia passare gli errori come risposte vuote. */
async function api<T>(query: string): Promise<T> {
  const r = await fetch(`${API}?${query}`);
  if (!r.ok) throw new Error(`${query}: HTTP ${r.status}`);
  return r.json();
}

// "debt" resta fuori: i dati SIOPE sono di cassa e non conoscono lo stock di
// indebitamento, quindi la metrica darebbe una mappa piatta. Torna qui il
// giorno in cui entrano i rendiconti di competenza.
const METRICS: MetricKey[] = ["expenditure", "revenue", "surplus", "fhi"];

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
    comuneDaAprire.current = p.get("comune");
    setPronto(true);
  }, []);

  // ---- Esercizi disponibili, dichiarati dalla sorgente ------------------ //
  // L'elenco è legato alla sorgente da cui proviene: appena si cambia sorgente
  // torna vuoto, così non si usa mai la lista dell'altra per validare un anno.
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    if (!pronto) return;
    let annullato = false;
    (async () => {
      const anni = await api<number[]>("lod=years");
      if (annullato || !anni.length) return;
      setYears(anni);
      // Se l'anno scelto non esiste in questa sorgente, scivola sull'ultimo utile
      setYear((y) => (anni.includes(y) ? y : anni[anni.length - 1]));
    })();
    return () => {
      annullato = true;
    };
  }, [pronto]);

  // Anno passato alla mappa: avanza solo quando è confermato dalla sorgente
  // corrente. Resta null finché non lo sappiamo, così la mappa non parte con
  // un anno provvisorio e non spreca una richiesta da 5 MB.
  const [annoMappa, setAnnoMappa] = useState<number | null>(null);
  useEffect(() => {
    if (years.includes(year)) setAnnoMappa(year);
  }, [year, years]);

  // ---- Selezione di un comune (dalla mappa o dalla ricerca) ------------- //
  const handleSelect = useCallback(
    async (p: MunicipalityProps) => {
      const anno = annoMappa ?? year;
      const [history, nat, pari] = await Promise.all([
        api<MunicipalityDetail["history"]>(`lod=history&istat=${p.istat}`),
        api<NationalAverages>(`lod=national&year=${anno}`),
        api<PeerComparison>(`lod=peers&istat=${p.istat}&year=${anno}`),
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
    [year, annoMappa],
  );

  // ---- Ricerca --------------------------------------------------------- //
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<Risultato[]>([]);

  // api() solleva sugli errori invece di restituire lista vuota: confondere
  // "fallito" con "nessun risultato" ci era gia' costato un ripristino da
  // deep link che spariva in silenzio.
  const cerca = useCallback(
    (q: string) => api<Risultato[]>(`lod=search&q=${encodeURIComponent(q)}`),
    [],
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
  const [classifiche, setClassifiche] = useState(false);

  const caricaFiltri = useCallback(
    () => api<RankingFilters>(`lod=ranking-filters&year=${annoMappa ?? year}`),
    [annoMappa, year],
  );

  const caricaClassifica = useCallback(
    (q: RankingQuery) =>
      api<RankingRow[]>(
        `lod=ranking&year=${annoMappa ?? year}&metric=${q.metric}` +
          `&fascia=${encodeURIComponent(q.fascia ?? "")}` +
          `&region=${encodeURIComponent(q.region ?? "")}` +
          `&desc=${q.desc}&limit=15`,
      ),
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
          dataUrl={API}
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
          Confini e popolazione ISTAT · importi SIOPE.
        </p>

        {/* I dati SIOPE sono di cassa, non di competenza: dirlo è doveroso,
            perché "avanzo" qui significa saldo di cassa e non risultato
            di amministrazione. */}
        <p className="mt-1 text-[11px] leading-snug text-amber-300/80">
          Contabilità di cassa: incassi e pagamenti, non accertamenti e impegni.
        </p>

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
          {METRICS.map((m) => (
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
          {METRICS.map((m) => (
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
          {/* Niente conteggio cablato: cambia a ogni import dell'ETL
              (fusioni e soppressioni di comuni) e diventerebbe falso. */}
          {comuniOvunque ? "Tutti i comuni" : "107 province"}
        </button>

        <button
          onClick={() => setClassifiche(true)}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-slate-300 transition-colors hover:bg-white/10"
        >
          <Trophy size={12} /> Classifiche
        </button>

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
