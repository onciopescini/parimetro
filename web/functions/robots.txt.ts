// GET /robots.txt : sta in una funzione perche' deve indicare la sitemap con l'indirizzo assoluto del sito,
// che cambia quando si collega il dominio vero.
import { serviRobots, soloLettura } from "../lib/pagina/serve";

export const onRequest = ({ request }: { request: Request }) => soloLettura(request, () => serviRobots(request));
