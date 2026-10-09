// Il lato "server" delle pagine dei comuni: legge gli stessi JSON della mappa (binding ASSETS di Cloudflare Pages)
// e risponde con HTML, sitemap, robots e llms.txt. Separato dalle funzioni di Cloudflare per poterlo provare in
// locale con un finto ASSETS.
import { comuniSimili, esc, istatDaSlug, llmsTxt, paginaComune, paginaElenco, robots, sitemap, slugComune, type DatiComune, type VoceComune } from "./comune";

export interface Assets {
  fetch(req: Request): Promise<Response>;
}

const HTML = "text/html; charset=utf-8";
// Un giorno nella cache di Cloudflare: i dati cambiano solo quando si ripubblica il sito
const CACHE = "public, max-age=3600, s-maxage=86400";

let indiceInMemoria: Promise<VoceComune[]> | null = null;

async function indice(assets: Assets, origine: string): Promise<VoceComune[]> {
  indiceInMemoria ??= assets
    .fetch(new Request(`${origine}/dati/indice.json`))
    .then((r) => {
      if (!r.ok) throw new Error(`indice.json: HTTP ${r.status}`);
      return r.json() as Promise<VoceComune[]>;
    })
    .catch((e) => {
      indiceInMemoria = null; // un errore non deve restare in memoria per sempre
      throw e;
    });
  return indiceInMemoria;
}

export const _azzeraIndice = () => {
  indiceInMemoria = null;
};

const risposta = (corpo: string, tipo: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(corpo, { status, headers: { "Content-Type": tipo, "Cache-Control": CACHE, ...extra } });

const nonTrovata = (origine: string) =>
  new Response(
    `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Comune non trovato | Parimetro</title>` +
      `<body style="font:16px system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem"><h1>Comune non trovato</h1>` +
      `<p>Non conosco questo indirizzo. <a href="${esc(origine)}/comuni">Elenco di tutti i comuni</a> · <a href="${esc(origine)}/">Mappa</a></p></body></html>`,
    { status: 404, headers: { "Content-Type": HTML, "Cache-Control": "public, max-age=300" } },
  );

/**
 * Pages Function risponde solo al metodo indicato: senza questo, un HEAD (che molti crawler usano per controllare
 * una pagina) cadrebbe sui file statici e riceverebbe 404. HEAD ha le stesse intestazioni e nessun corpo.
 */
export async function soloLettura(request: Request, risposta: () => Promise<Response>): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Metodo non consentito", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const r = await risposta();
  return request.method === "HEAD" ? new Response(null, { status: r.status, headers: r.headers }) : r;
}

export async function serviComune(request: Request, assets: Assets, slug: string): Promise<Response> {
  const origine = new URL(request.url).origin;
  const istat = istatDaSlug(slug);
  if (!istat) return nonTrovata(origine);
  const voce = (await indice(assets, origine)).find((v) => v.istat === istat);
  if (!voce) return nonTrovata(origine);

  // Un solo indirizzo per comune: se il nome nell'indirizzo e' sbagliato o manca, si rimanda a quello vero
  const canonico = slugComune(voce.name, voce.istat);
  if (slug !== canonico) return Response.redirect(`${origine}/comune/${canonico}`, 301);

  const r = await assets.fetch(new Request(`${origine}/dati/comune/${istat}.json`));
  if (!r.ok) return nonTrovata(origine);
  const dati = (await r.json()) as DatiComune;
  return risposta(paginaComune(voce, dati, origine, comuniSimili(await indice(assets, origine), voce)).html, HTML);
}

export async function serviElenco(request: Request, assets: Assets): Promise<Response> {
  const origine = new URL(request.url).origin;
  return risposta(paginaElenco(await indice(assets, origine), origine), HTML);
}

export async function serviSitemap(request: Request, assets: Assets): Promise<Response> {
  const origine = new URL(request.url).origin;
  return risposta(sitemap(await indice(assets, origine), origine), "application/xml; charset=utf-8");
}

export async function serviRobots(request: Request): Promise<Response> {
  return risposta(robots(new URL(request.url).origin), "text/plain; charset=utf-8");
}

export async function serviLlms(request: Request, assets: Assets): Promise<Response> {
  const origine = new URL(request.url).origin;
  return risposta(llmsTxt(origine, (await indice(assets, origine)).length), "text/plain; charset=utf-8");
}
