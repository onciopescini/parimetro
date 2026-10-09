# MCP server (`/mcp`)

Parimetro exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io) server at
`POST /mcp` (JSON-RPC 2.0, stateless, no SSE). An assistant that supports remote MCP connectors
(Claude, ChatGPT, others) can add it as a connector and answer questions about Italian municipal
budgets with **its own account and model**: this server never calls any model, so it costs us no AI usage.

## Tools

Each tool maps to one intent of the chat engine (`lib/chat/motore.ts`), so numbers, notes and
caveats come from the same code path as the site:

| Tool | Arguments |
|---|---|
| `scheda_comune` | `comune` (name or 6-digit ISTAT code), `provincia?`, `anno?` |
| `confronta_comuni` | `comuni` (2 to 4 items of the same shape), `anno?` |
| `classifica` | `metrica`, `ordine` (`alto`/`basso`), `fascia?`, `regione?`, `senza_concentrate?`, `anno?` |
| `spesa_area` | `comune`, `provincia?`, `area` |
| `storico_comune` | `comune`, `provincia?`, `metrica` |
| `investimenti_comune` | `comune`, `provincia?` |
| `appalti_comune` | `comune`, `provincia?`, `anno?` |

News are **not** exposed: article titles are third-party text that could contain instructions aimed at
the assistant. Free text is limited to length-capped name fields; anything else is rejected with an
Italian message before the engine runs.

## Output

Plain text built by code (`lib/mcp/risposta.ts`): title, deterministic summary, a table, the caveats
(`note`), a link to the comune on the map and the source line. Results are capped at 30 rows.

## Limits and safety

- Public, anonymous, no accounts. Rate limit: 300 requests per hour per IP (`functions/mcp.ts`),
  separate counter from the chat (`lib/limite.ts`).
- Reads the same static JSON files as the site through the `ASSETS` binding: no database, no secrets.
- Errors never expose internal details; failed data reads return a generic message.
- Known gap: the sentence about "senza di loro" in the concentrated-spending warning is written for the
  chat; an assistant should call `classifica` with `senza_concentrate: true` instead.
- Cloudflare free plan: 10 ms CPU per request is the constraint to watch after deployment. Local
  `wrangler pages dev` does not measure it.

## Try it locally

```bash
npm run build
npx wrangler pages dev out --port 8788
curl -X POST http://localhost:8788/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scheda_comune","arguments":{"comune":"Roma"}}}'
```
