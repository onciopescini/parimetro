// GET /sitemap.xml : la home, l'elenco e la pagina di ogni comune.
import { serviSitemap, soloLettura, type Assets } from "../lib/pagina/serve";

export const onRequest = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  soloLettura(request, () => serviSitemap(request, env.ASSETS));
