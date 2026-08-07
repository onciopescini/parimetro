// ============================================================================
// EDGE FUNCTION · geo-budgets
// Unico endpoint per i dati della mappa, con compressione gzip e cache CDN.
//
//   ?mode=polygons&year=2024&zoom=8&bbox=minLon,minLat,maxLon,maxLat
//   ?mode=centroids&year=2024
//   ?mode=detail&istat=015146
//
// Deploy:  supabase functions deploy geo-budgets --no-verify-jwt
// (in alternativa lascia la verifica JWT: il client invia già l'anon key)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Risponde in JSON, comprimendo con gzip se il client lo supporta. */
function jsonResponse(
  payload: unknown,
  req: Request,
  status = 200,
  cache = "public, max-age=3600, s-maxage=86400",
): Response {
  const body = JSON.stringify(payload);
  const headers = new Headers({
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cache,
  });

  const acceptsGzip = (req.headers.get("accept-encoding") ?? "").includes("gzip");
  if (acceptsGzip && body.length > 1024) {
    headers.set("Content-Encoding", "gzip");
    const stream = new Blob([body]).stream().pipeThrough(
      new CompressionStream("gzip"),
    );
    return new Response(stream, { status, headers });
  }
  return new Response(body, { status, headers });
}

function badRequest(req: Request, message: string): Response {
  return jsonResponse({ error: message }, req, 400, "no-store");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "polygons";

  try {
    // ---------- LOD 0–6: colonne provinciali aggregate ----------------------
    if (mode === "centroids") {
      const year = Number(url.searchParams.get("year"));
      if (!Number.isInteger(year)) return badRequest(req, "Parametro `year` mancante o non valido");

      const { data, error } = await supabase.rpc("get_geo_centroids", { p_year: year });
      if (error) throw error;
      return jsonResponse(data ?? [], req);
    }

    // ---------- Dettaglio comune per il Drawer ------------------------------
    if (mode === "detail") {
      const istat = url.searchParams.get("istat");
      if (!istat) return badRequest(req, "Parametro `istat` mancante");

      const { data, error } = await supabase.rpc("get_municipality_detail", { p_istat: istat });
      if (error) throw error;
      return jsonResponse(data ?? {}, req, 200, "public, max-age=600, s-maxage=3600");
    }

    // ---------- LOD 7+: poligoni comunali semplificati ----------------------
    if (mode === "polygons") {
      const year = Number(url.searchParams.get("year"));
      const zoom = Number(url.searchParams.get("zoom") ?? 8);
      if (!Number.isInteger(year)) return badRequest(req, "Parametro `year` mancante o non valido");

      const params: Record<string, number | null> = {
        p_year: year,
        p_zoom: Math.round(zoom),
        p_min_lon: null,
        p_min_lat: null,
        p_max_lon: null,
        p_max_lat: null,
      };

      const bbox = url.searchParams.get("bbox");
      if (bbox) {
        const parts = bbox.split(",").map(Number);
        if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
          return badRequest(req, "Parametro `bbox` non valido: atteso minLon,minLat,maxLon,maxLat");
        }
        [params.p_min_lon, params.p_min_lat, params.p_max_lon, params.p_max_lat] = parts;
      }

      const { data, error } = await supabase.rpc("get_geo_budgets", params);
      if (error) throw error;
      return jsonResponse(data ?? { type: "FeatureCollection", features: [] }, req);
    }

    return badRequest(req, `Modalità sconosciuta: ${mode}`);
  } catch (err) {
    console.error("[geo-budgets]", err);
    return jsonResponse(
      { error: "Errore interno nel recupero dei dati", detail: String(err) },
      req,
      500,
      "no-store",
    );
  }
});
