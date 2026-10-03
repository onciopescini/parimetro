// GET /comuni : un link per ognuno dei comuni, raggruppati per regione (serve a chi non legge la sitemap).
import { serviElenco, type Assets } from "../lib/pagina/serve";

export const onRequestGet = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  serviElenco(request, env.ASSETS);
