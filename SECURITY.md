# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's private
"Report a vulnerability" form on this repository (Security → Advisories). Include what you
found, how to reproduce it and, if you can, a suggested fix. You will get a reply within a few
days.

## Scope

The deployed site is static files plus one Cloudflare Pages Function (`web/functions/api/chat.ts`).
Things we especially care about:

- the AI chat: prompt injection that makes the code do anything other than the five predefined
  questions, or that makes a model-written number reach the user;
- leakage of the OpenRouter API key (it must only live in the Pages secrets);
- abuse of the chat endpoint (rate limit bypass, cross-origin use);
- secrets or personal data committed to the repository.

The project handles no user accounts and stores no user data. The data it publishes is public
open data.

## If you deploy your own copy

- Never commit `.env`, `.dev.vars` or keys. The `.gitignore` already excludes them; check before
  every push.
- Keep the chat rate limit, or add a Cloudflare rate-limiting rule for real traffic.
- Set a spending cap on your OpenRouter key.
