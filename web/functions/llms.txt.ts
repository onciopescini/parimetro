// GET /llms.txt : una descrizione del sito pensata per gli assistenti AI (cosa c'e', come leggere i dati, dove stanno).
import { serviLlms, soloLettura, type Assets } from "../lib/pagina/serve";

export const onRequest = ({ request, env }: { request: Request; env: { ASSETS: Assets } }) =>
  soloLettura(request, () => serviLlms(request, env.ASSETS));
