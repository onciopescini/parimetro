// /api/avvisi/*: disiscrizione dai messaggi e invio degli avvisi sui nuovi bilanci.
import { route, type Ambiente } from "../../../lib/account/api";

export const onRequest = ({ request, env }: { request: Request; env: Ambiente }) => route(request, env);
