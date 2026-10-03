"use client";

// ============================================================
// app/page.tsx
// Collega Map3D (Modulo 2) e BudgetDrawer (Modulo 3).
// Online non c'e' nessun database: i dati sono file JSON in /dati,
// generati dall'ETL (05_esporta_statico.py). Vedi lib/dati.ts.
//
// Lo stato della vista vive nella query string, così ogni schermata
// è un link condivisibile.
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Trophy, X } from "lucide-react";
import Map3D, {
  METRIC_LABELS,
  type MetricKey,
  type MunicipalityProps,
} from "@/components/map/Map3D";
import type { CategorieComune } from "@/lib/categorie";
import type { RedditoAnno } from "@/lib/reddito";
import type { Investimenti } from "@/lib/investimenti";
import type { Appalti, Concorrenza } from "@/lib/appalti";
import type { NotizieComune } from "@/lib/notizie";
import ChatPanel from "@/components/chat/ChatPanel";
import Fonti from "@/components/Fonti";
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
import { URL_DATI, cerca as cercaIndice, leggi, percorsoClassifica } from "@/lib/dati";


// "debt" resta fuori: i dati SIOPE sono di cassa e non conoscono lo stock di
// indebitamento, quindi la metrica darebbe una mappa piatta. Torna qui il
// giorno in cui entrano i rendiconti di competenza.
const METRICS: MetricKey[] = ["expenditure", "revenue", "surplus", "fhi", "income"];

/** Cio' che serve per aprire il drawer: anagrafica, non i bilanci. */
type Anagrafica = Pick<MunicipalityProps, "istat" | "name" | "region" | "province" | "population">;

/** Riga della ricerca: anagrafica piu' il punto su cui volare. */
type Risultato = Anagrafica & { lon: number; lat: number };

/** Una metrica letta dalla URL vale solo se esiste: un link vecchio o storpiato non deve rompere la mappa. */
function metricaDa(v: string | null, predefinita: MetricKey): MetricKey {
  return v && (METRICS as string[]).includes(v) ? (v as MetricKey) : predefinita;
}

// useSearchParams richiede un confine Suspense con l'export statico: il
// server prerenderizza il guscio, il browser monta la mappa con la query
// string vera. Cosi' lo stato iniziale si legge in render, senza effetti e
// senza rischio di idratazione sfasata.
export default function Home() {
  return (
    <Suspense fallback={<main className="h-dvh w-full bg-slate-950" />}>
      <Mappa />
    </Suspense>
  );
}

function Mappa() {
  const params = useSearchParams();
  const [year, setYear] = useState(() => Number(params.get("anno")) || 2024);
  const [heightMetric, setHeightMetric] = useState<MetricKey>(() =>
    metricaDa(params.get("alt"), "expenditure"),
  );
  const [colorMetric, setColorMetric] = useState<MetricKey>(() =>
    metricaDa(params.get("col"), "expenditure"),
  );
  const [perCapita, setPerCapita] = useState(() => params.get("pc") === "1");
  // true = i ~7.900 comuni estrusi già dalla vista nazionale
  const [comuniOvunque, setComuniOvunque] = useState(() => params.get("lod") !== "province");

  const [detail, setDetail] = useState<MunicipalityDetail | null>(null);
  const [avg, setAvg] = useState<NationalAverages | null>(null);
  const [peers, setPeers] = useState<PeerComparison | null>(null);
  const [categorie, setCategorie] = useState<CategorieComune | null>(null);
  const [reddito, setReddito] = useState<RedditoAnno | null>(null);
  const [investimenti, setInvestimenti] = useState<Investimenti | null>(null);
  const [appalti, setAppalti] = useState<Appalti | null>(null);
  const [concorrenza, setConcorrenza] = useState<Concorrenza | null>(null);
  const [notizie, setNotizie] = useState<NotizieComune | null>(null);
  const [open, setOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; nonce: number } | null>(null);

  // Comune indicato nella URL: lo apre l'effetto piu' sotto, a dati pronti
  const comuneDaAprire = useRef<string | null>(params.get("comune"));

  // ---- Esercizi disponibili, dichiarati dalla sorgente ------------------ //
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const anni = await leggi<number[]>(`${URL_DATI}/anni.json`);
      if (annullato || !anni.length) return;
      setYears(anni);
      // Se l'anno scelto non esiste in questa sorgente, scivola sull'ultimo utile
      setYear((y) => (anni.includes(y) ? y : anni[anni.length - 1]));
    })().catch((e) => {
      // Senza anni.json il sito e' vuoto per costruzione: dirlo chiaramente
      // vale piu' di una promise rifiutata anonima nella console.
      console.error(
        "Dati statici assenti in public/dati: genera i file con l'ETL (05_esporta_statico.py).",
        e,
      );
    });
    return () => {
      annullato = true;
    };
  }, []);

  // Anno passato alla mappa: avanza solo quando è confermato dalla sorgente
  // corrente. Resta null finché non lo sappiamo, così la mappa non parte con
  // un anno provvisorio e non spreca una richiesta da 5 MB.
  const [annoMappa, setAnnoMappa] = useState<number | null>(null);
  // Si aggiorna durante il render (non in un effetto): e' lo schema che React
  // indica per derivare stato da altro stato, e evita un render con l'anno vecchio.
  if (years.includes(year) && annoMappa !== year) setAnnoMappa(year);

  // ---- Selezione di un comune (dalla mappa o dalla ricerca) ------------- //
  const handleSelect = useCallback(
    async (p: Anagrafica) => {
      const anno = annoMappa ?? year;
      // Un file per comune (storico + confronto per ogni anno) e uno per le
      // medie nazionali di tutti gli anni: due richieste invece di tre.
      const [scheda, nazionale] = await Promise.all([
        leggi<{
          history: MunicipalityDetail["history"];
          peers: Record<string, PeerComparison | null>;
          categorie?: Record<string, CategorieComune | null>;
          reddito?: Record<string, RedditoAnno> | null;
          investimenti?: Investimenti | null;
          appalti?: Appalti | null;
          notizie?: NotizieComune | null;
          concorrenza?: Concorrenza | null;
        }>(`${URL_DATI}/comune/${p.istat}.json`),
        leggi<Record<string, NationalAverages>>(`${URL_DATI}/nazionale.json`),
      ]);
      const history = scheda.history;
      const nat = nazionale[String(anno)] ?? null;
      const pari = scheda.peers[String(anno)] ?? null;

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
      setCategorie(scheda.categorie?.[String(anno)] ?? null);
      setReddito(scheda.reddito?.[String(anno)] ?? null);
      setInvestimenti(scheda.investimenti ?? null);
      setAppalti(scheda.appalti ?? null);
      setNotizie(scheda.notizie ?? null);
      setConcorrenza(scheda.concorrenza ?? null);
      setOpen(true);
    },
    [year, annoMappa],
  );

  // ---- Ricerca --------------------------------------------------------- //
  const [query, setQuery] = useState("");
  const [trovati, setRisultati] = useState<Risultato[]>([]);
  // Sotto i 2 caratteri non si mostra nulla, anche se restano risultati vecchi
  const risultati = query.trim().length < 2 ? [] : trovati;

  // La ricerca gira in browser su un indice di ~7.900 righe scaricato una
  // volta sola: niente server. leggi() solleva sugli errori invece di
  // restituire lista vuota, cosi' un download fallito non sembra un comune
  // che non esiste.
  const cerca = useCallback((q: string): Promise<Risultato[]> => cercaIndice(q), []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
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

  // Ogni combinazione di filtri e' un file pre-generato dall'ETL
  const caricaFiltri = useCallback(
    () => leggi<RankingFilters>(`${URL_DATI}/classifiche/filtri-${annoMappa ?? year}.json`),
    [annoMappa, year],
  );

  const caricaClassifica = useCallback(
    (q: RankingQuery) =>
      leggi<RankingRow[]>(
        percorsoClassifica(annoMappa ?? year, q.metric, q.desc, q.fascia, q.region),
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

  // Dalla chat: apre un comune dato il codice ISTAT, come se fosse stato cercato
  const apriDaChat = useCallback(
    async (istat: string) => {
      const [voce] = await cercaIndice(istat);
      if (voce) vaiA(voce);
    },
    [vaiA],
  );

  // Comune indicato nella URL: lo apro appena la sorgente è pronta.
  // Un tentativo solo non basta: la prima chiamata dopo il caricamento parte a
  // cache fredda ed è la più esposta al timeout, quindi si riprova una volta.
  useEffect(() => {
    const istat = comuneDaAprire.current;
    if (!istat || annoMappa === null) return;
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
  }, [annoMappa, cerca, vaiA]);

  // ---- Stato → query string -------------------------------------------- //
  useEffect(() => {
    if (annoMappa === null) return;
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
          dataUrl={URL_DATI}
          lodThreshold={comuniOvunque ? 0 : undefined}
          scale={perCapita ? "robust" : "log"}
          palette={colorMetric === "fhi" ? "health" : colorMetric === "income" ? "income" : "cost"}
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
            anno={annoMappa ?? year}
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
          <h1 className="text-sm font-semibold">Parimetro</h1>
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
        {(heightMetric === "income" || colorMetric === "income") && (
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
            Il reddito è l&apos;imponibile IRPEF medio per contribuente, non cambia con pro capite/assoluti. Grigio:
            dato non disponibile.
          </p>
        )}

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

      <ChatPanel
        contesto={detail ? { istat: detail.istat, nome: detail.name, anno: annoMappa ?? year } : null}
        spostaDaDestra={open}
        onApri={apriDaChat}
      />

      <Fonti />

      <BudgetDrawer
        data={detail}
        year={annoMappa ?? year}
        nationalAvg={avg}
        peerAvg={peers}
        categorie={categorie}
        reddito={reddito}
        investimenti={investimenti}
        appalti={appalti}
        notizie={notizie}
        concorrenza={concorrenza}
        open={open}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
