// GET /llms.txt : una descrizione del sito pensata per gli assistenti AI (cosa c'e', come leggere i dati, dove stanno).
import { serviLlms, type Assets } from "../lib/pagina/serve";

export const onRequestGet = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  serviLlms(request, env.ASSETS);
