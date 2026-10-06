// GET/DELETE /api/me (la radice: le sotto-rotte stanno in me/[[risorsa]].ts)
import { route, type Ambiente } from "../../lib/account/api";

export const onRequest = ({ request, env }: { request: Request; env: Ambiente }) => route(request, env);
