#!/usr/bin/env bash
# Esporta i dati dal database, costruisce il sito statico e lo pubblica.
#
#   ./pubblica.sh                esporta + build + deploy
#   ./pubblica.sh --solo-build   salta l'export (i JSON ci sono gia')
#
# Prerequisiti (una volta sola):
#   npm install -g wrangler && wrangler login
#   wrangler pages project create <nome-progetto>
# Il nome del progetto si passa con PROGETTO=... (predefinito: parimetro).
set -euo pipefail
RADICE="$(cd "$(dirname "$0")/.." && pwd)"
PROGETTO="${PROGETTO:-parimetro}"

if [ "${1:-}" != "--solo-build" ]; then
  echo "=== export dei dati ==="
  ( cd "$RADICE/etl" && python 05_esporta_statico.py --dest "$RADICE/web/public/dati" )
fi

echo "=== build statica ==="
cd "$RADICE/web"
npm run build

echo "=== deploy su Cloudflare Pages ==="
npx wrangler pages deploy out --project-name "$PROGETTO" --branch main
