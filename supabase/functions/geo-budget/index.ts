// ============================================================
// Edge Function · geo-budget
// Serve i payload dei bilanci (GeoJSON comuni o aggregati
// provinciali) compressi in gzip, con cache in-memory per
// istanza e header di caching per la CDN.
//
// Deploy:    supabase functions deploy geo-budget --no-verify-jwt
// Chiamata:  GET {PROJECT_URL}/functions/v1/geo-budget?lod=municipalities&year=2024
//            lod = municipalities | provinces
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL e SERVICE_ROLE_KEY sono iniettate automaticamente
// nel runtime Edge di Supabase: nessun segreto da configurare a mano.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TTL_MS = 6 * 60 * 60 * 1000; // 6 ore
const cache = new Map<string, { gz: Uint8Array; ts: number }>();

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear() - 1);
  const lod = url.searchParams.get("lod") === "provinces" ? "provinces" : "municipalities";
  const key = `${lod}:${year}`;

  try {
    // 1 · Cache in-memory: la query pesante gira al massimo una volta
    //     ogni 6 ore per combinazione LOD × anno, per istanza.
    let entry = cache.get(key);
    if (!entry || Date.now() - entry.ts > TTL_MS) {
      const { data, error } = lod === "provinces"
        ? await supabase.rpc("get_province_aggregates", { p_year: year })
        : await supabase.rpc("get_geo_budget", { p_year: year });
      if (error) throw error;

      entry = { gz: await gzip(JSON.stringify(data ?? null)), ts: Date.now() };
      cache.set(key, entry);
    }

    const headers: Record<string, string> = {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      // 1h nel browser, 24h su CDN, con stale-while-revalidate
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      "X-Cache-Key": key,
    };

    // 2 · Se il client accetta gzip, serviamo direttamente i byte
    //     compressi (payload dei comuni: da decine di MB a pochi MB).
    if ((req.headers.get("accept-encoding") ?? "").includes("gzip")) {
      return new Response(entry.gz, {
        headers: { ...headers, "Content-Encoding": "gzip" },
      });
    }
    return new Response(await gunzip(entry.gz), { headers });
  } catch (err) {
    console.error("[geo-budget]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Errore interno" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
