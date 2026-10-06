// /api/me e /api/me/*: lo spazio personale di chi e' entrato.
import { route, type Ambiente } from "../../../lib/account/api";

export const onRequest = ({ request, env }: { request: Request; env: Ambiente }) => route(request, env);
