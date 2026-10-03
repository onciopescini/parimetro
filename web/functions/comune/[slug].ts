// GET /comune/campobasso-070006 : la scheda di un comune come pagina HTML leggibile da motori di ricerca e da assistenti AI.
// Nessun file in piu' nel sito (Cloudflare Pages ne accetta 20.000): l'HTML si compone qui dai JSON gia' pubblicati.
import { serviComune, type Assets } from "../../lib/pagina/serve";

interface Ctx {
  request: Request;
  env: { ASSETS: Assets };
  params: { slug?: string | string[] };
}

export const onRequestGet = ({ request, env, params }: Ctx) =>
  serviComune(request, env.ASSETS, String(Array.isArray(params.slug) ? params.slug[0] : params.slug ?? ""));
