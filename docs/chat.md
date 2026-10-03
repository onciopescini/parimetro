# The AI chat

Design goal: **the model never produces a number.** Language models are good at understanding
a question and at phrasing an answer, and bad at arithmetic and at not making things up.
So they do only the first and the last step, and both are checked by code.

```
question ──► [model] intent (JSON) ──► validate against a closed list
                                              │
                      code computes the result from the static JSON files
                                              │
              [model] narration with [[placeholders]] ──► validate ──► fill in values
                                              │
                     answer = text + table (the source of truth) + CSV export
```

1. **Intent** (`web/lib/chat/intento.ts`). The model must answer with one JSON object choosing
   one of seven questions: municipality card, comparison (2–4 towns), ranking, spending in an
   area, history of a metric, investments (PNRR and public works), procurement — or "out of scope". Anything else is rejected, so a prompt
   injection cannot make the code do something else.
2. **Engine** (`web/lib/chat/motore.ts`). Reads the same JSON files the site uses and builds the
   table. Every number, and its formatting, is produced here. Ambiguous town names (two
   *Castro*) are never guessed: the user is asked to choose.
3. **Narration** (`web/lib/chat/narrazione.ts`). The model sees the computed facts and may only
   cite them as `[[key]]` placeholders. A digit written by the model, or an invented key,
   discards the text and the answer falls back to a summary written by the code.
4. **Export** (`web/lib/chat/csv.ts`). `;` separator, decimal comma and a BOM, ready for Excel
   in Italian locales; raw (unformatted) values.

## Running it

`web/functions/api/chat.ts` is a Cloudflare Pages Function. It reads the data files through
the `ASSETS` binding, so it needs no database. Configure with Pages secrets:

```bash
cd web
npx wrangler pages secret put OPENROUTER_API_KEY --project-name <your-project>   # required
npx wrangler pages secret put CHAT_MODELLI --project-name <your-project>         # optional, comma list
```

Without the key, `GET /api/chat` answers `{"attiva":false}` and the site hides the chat button.
The default models are cheap paid ones; free `:free` models were tried and are mostly rate
limited, sometimes return empty answers and may retain prompts. A zero-data-retention setting
on your OpenRouter account excludes them anyway.

Abuse guard: 15 questions per hour per address (cache-based, approximate) and a same-origin
check. For serious traffic add a Cloudflare rate-limiting rule.

## Privacy

The question text is sent to a third-party model provider via OpenRouter. The site stores
nothing. The UI tells users not to type personal data.

## Testing

`web/tests/chat.test.ts` covers: name resolution, intent validation, each engine intent
against realistic fixtures, the narration validator (it must reject digits and invented keys),
provider failures (rate limits, retries), and the whole flow with a fake model.
