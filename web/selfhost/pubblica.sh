#!/usr/bin/env bash
# Esporta i dati dal database, costruisce il sito statico e lo pubblica.
#
#   ./pubblica.sh            esporta + build + deploy
#   ./pubblica.sh --solo-build   salta l'export (i JSON ci sono gia')
#
# Prerequisiti (una volta sola):
#   npm install -g wrangler && wrangler login
#   wrangler pages project create mappa-bilanci
set -euo pipefail
cd "$(dirname "$0")/.."
ETL="../mappa-3d-bilanci/etl"

if [ "${1:-}" != "--solo-build" ]; then
  echo "=== export dei dati ==="
  ( cd "$ETL" && python 05_esporta_statico.py --dest "$OLDPWD/public/dati" )
fi

echo "=== build statica ==="
npm run build

echo "=== deploy su Cloudflare Pages ==="
npx wrangler pages deploy out --project-name mappa-bilanci
