// GET /robots.txt : sta in una funzione perche' deve indicare la sitemap con l'indirizzo assoluto del sito,
// che cambia quando si collega il dominio vero.
import { serviRobots } from "../lib/pagina/serve";

export const onRequestGet = ({ request }: { request: Request }) => serviRobots(request);
