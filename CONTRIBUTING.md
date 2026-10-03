# Contributing to Parimetro

Thanks for helping. This project is small and the rules are few. 🇮🇹 Si può scrivere issue e
pull request anche in italiano.

## Licensing of contributions

The code is MIT. By submitting a pull request you agree that your contribution is released under
the same MIT license (no separate CLA). We ask you to sign off your commits
([DCO](https://developercertificate.org/)): `git commit -s`. That line only certifies that you
wrote the change or have the right to submit it.

## What is most welcome

- **Fixes to the spending classification** (`etl/categorie_spesa.py`). Each rule is one line of
  a hand-written table: say which code, which area, and why. Add a test case.
- **Data quality**: municipalities with wrong or missing figures (open an issue with the code
  and year; please attach the source row).
- **Porting to another country** (see `docs/adapting-to-your-country.md`).
- Accessibility, mobile layout, translations.
- New *open* data sources with a clear license.

## Principles that are not up for negotiation

1. **The AI never produces numbers.** Anything shown to the user as a figure is computed by code
   from the published data files. Changes to `web/lib/chat` must keep the narration validator
   strict (see `docs/chat.md`).
2. **Say what you don't know.** Missing data is `NULL` and is shown as missing, never as zero.
   Generic spending stays "not attributable".
3. **Data is cash, and says so.** Do not label cash figures as budget commitments.
4. **No scoring of people or parties.** The rank describes municipalities relative to peers; it
   is not a judgement of any administration.

## Setup

```bash
# website
cd web && npm install && npm run fixture && npm run dev

# pipeline and SQL tests (needs Postgres + PostGIS)
cd etl && pip install -r requirements.txt -r requirements-dev.txt
export TEST_DATABASE_URL=postgres://user:pass@localhost:5432/parimetro_test
python applica_migrazioni.py && python -m pytest
```

Run `npm run lint`, `npx tsc --noEmit` and `npm test` in `web/`, and `python -m pytest` in `etl/`
before opening a pull request. CI does the same.

## Pull requests

Keep them focused. Explain the *why*. If you change numbers the site shows, say what changed and
why in the description. Tests for behaviour changes, please.
