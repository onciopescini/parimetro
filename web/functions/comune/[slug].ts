// GET /comune/campobasso-070006 : la scheda di un comune come pagina HTML leggibile da motori di ricerca e da assistenti AI.
// Nessun file in piu' nel sito (Cloudflare Pages ne accetta 20.000): l'HTML si compone qui dai JSON gia' pubblicati.
import { serviComune, soloLettura, type Assets } from "../../lib/pagina/serve";

interface Ctx {
  request: Request;
  env: { ASSETS: Assets };
  params: { slug?: string | string[] };
}

export const onRequest = ({ request, env, params }: Ctx) =>
  soloLettura(request, () =>
    serviComune(request, env.ASSETS, String(Array.isArray(params.slug) ? params.slug[0] : params.slug ?? "")),
  );
