// Conteggio per IP nella cache locale del datacenter: approssimativo ma senza servizi da pagare.
// Ogni ambito (chat, mcp...) ha il suo contatore, cosi' un uso intenso di uno non blocca l'altro.
export async function superaLimite(request: Request, ambito: string, massimo: number): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "ignoto";
  const ora = Math.floor(Date.now() / 3_600_000);
  const cache = (caches as unknown as { default: Cache }).default;
  const chiave = new Request(`https://limite.interno/${ambito}/${encodeURIComponent(ip)}/${ora}`);
  const attuale = Number((await (await cache.match(chiave))?.text()) ?? 0);
  if (attuale >= massimo) return true;
  await cache.put(
    chiave,
    new Response(String(attuale + 1), { headers: { "Cache-Control": "max-age=3700" } }),
  );
  return false;
}
