// /api/auth/*: entrare e uscire. Tutta la logica sta in lib/account/api.ts.
import { route, type Ambiente } from "../../../lib/account/api";

export const onRequest = ({ request, env }: { request: Request; env: Ambiente }) => route(request, env);
