#!/usr/bin/env bash
# Ricostruisce lo schema applicando le migrazioni in ordine di nome.
#
# Non c'e' piu' la CLI Supabase: le migrazioni sono normali file .sql e
# bastano psql e un ciclo. Sono tutte idempotenti (create ... if not exists,
# create or replace), quindi rilanciare lo script non rompe nulla.
set -euo pipefail
cd "$(dirname "$0")"

MIGRAZIONI="../db/migrations"
[ -d "$MIGRAZIONI" ] || { echo "Non trovo $MIGRAZIONI"; exit 1; }

for f in "$MIGRAZIONI"/*.sql; do
  echo "→ $(basename "$f")"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d mappabilanci < "$f"
done

echo
echo "✔ schema applicato. Tabelle presenti:"
docker compose exec -T db psql -U postgres -d mappabilanci -c "\dt"
