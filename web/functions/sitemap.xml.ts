// GET /sitemap.xml : la home, l'elenco e la pagina di ogni comune.
import { serviSitemap, type Assets } from "../lib/pagina/serve";

export const onRequestGet = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  serviSitemap(request, env.ASSETS);
