// GET /comuni : un link per ognuno dei comuni, raggruppati per regione (serve a chi non legge la sitemap).
import { serviElenco, soloLettura, type Assets } from "../lib/pagina/serve";

export const onRequest = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  soloLettura(request, () => serviElenco(request, env.ASSETS));
