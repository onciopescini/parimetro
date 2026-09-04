// ============================================================
// /api/geo-budget · unico punto di accesso ai dati
//
// Prende il posto sia della Edge Function Supabase sia della vecchia
// sorgente demo su file: adesso il database sta in casa e le RPC sono
// funzioni Postgres, quindi questa route si limita a chiamarle.
//
// Il contratto (?lod=...) resta quello di prima, cosi' Map3D e il drawer
// non cambiano.
// ============================================================
import { NextResponse } from "next/server";
import { chiamaScalare, chiamaTabella } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La risposta dei comuni pesa ~4,7 MB e cambia solo quando gira l'ETL:
// tenerla in memoria evita di rigenerarla a ogni visitatore. Il gzip lo fa
// il tunnel Cloudflare, qui basta non ricalcolare il JSON.
const TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, { corpo: string; ts: number }>();

function inCache(chiave: string, produci: () => Promise<unknown>) {
  const hit = cache.get(chiave);
  if (hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.corpo);
  return produci().then((dati) => {
    const corpo = JSON.stringify(dati ?? null);
    cache.set(chiave, { corpo, ts: Date.now() });
    return corpo;
  });
}

const json = (corpo: string, secondi: number) =>
  new NextResponse(corpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${secondi}, stale-while-revalidate=86400`,
    },
  });

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lod = p.get("lod") ?? "municipalities";
  const anno = Number(p.get("year"));
  const istat = p.get("istat") ?? "";

  try {
    switch (lod) {
      // ---- payload pesanti della mappa, in cache ----
      case "municipalities":
        return json(
          await inCache(`m:${anno}`, () => chiamaScalare("get_geo_budget", [anno])),
          3600,
        );
      case "provinces":
        return json(
          await inCache(`p:${anno}`, () =>
            chiamaScalare("get_province_aggregates", [anno]),
          ),
          3600,
        );

      // ---- interrogazioni piccole, sempre fresche ----
      case "years":
        return NextResponse.json(await chiamaScalare("get_available_years", []));
      case "history":
        return NextResponse.json(await chiamaScalare("get_municipality_history", [istat]));
      case "national":
        return NextResponse.json(await chiamaScalare("get_national_averages", [anno]));
      case "peers":
        return NextResponse.json(
          await chiamaScalare("get_peer_comparison", [istat, anno]),
        );
      case "search": {
        const q = (p.get("q") ?? "").trim();
        if (q.length < 2) return NextResponse.json([]);
        return NextResponse.json(await chiamaTabella("search_municipalities", [q, 8]));
      }
      case "ranking-filters":
        return NextResponse.json(await chiamaScalare("get_ranking_filters", [anno]));
      case "ranking":
        return NextResponse.json(
          await chiamaTabella("get_ranking", [
            anno,
            p.get("metric") ?? "fhi",
            p.get("fascia") || null,
            p.get("region") || null,
            p.get("desc") !== "false",
            Math.min(Number(p.get("limit")) || 15, 100),
          ]),
        );
      default:
        return NextResponse.json({ error: `lod sconosciuto: ${lod}` }, { status: 400 });
    }
  } catch (e) {
    // L'errore va detto, non trasformato in una risposta vuota: confonderli
    // ci era gia' costato un ripristino da deep link che falliva in silenzio.
    console.error(`/api/geo-budget lod=${lod}:`, e);
    return NextResponse.json({ error: "interrogazione fallita" }, { status: 500 });
  }
}
