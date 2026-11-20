#!/usr/bin/env bash
# Copia del database dell'officina: un dump compresso in locale e, se R2 e'
# attivo, una copia su Cloudflare R2 (10 GB gratis al mese, egress gratis).
#
#   ./backup.sh                        dump + carica su R2
#   ./backup.sh --solo-locale          dump senza caricarlo
#   ./backup.sh --carica FILE.dump     carica su R2 un dump gia' fatto
#
# Da lanciare dopo ogni ETL: rifare il database da zero vuol dire giorni di
# download (SIOPE, OpenCoesione, ANAC), ripristinare un dump qualche minuto.
#
# Variabili (tutte facoltative):
#   PG_DUMP_CMD  comando che scrive il dump su stdout. Predefinito:
#                pg_dump -Fc "$DATABASE_URL" (DATABASE_URL da etl/.env).
#                Con il container:  PG_DUMP_CMD="docker compose exec -T db pg_dump -Fc -U postgres mappabilanci"
#                Con il cluster WSL: PG_DUMP_CMD="wsl -d Ubuntu -u postgres -- pg_dump -Fc -p 5433 mappabilanci"
#   BACKUP_DIR   cartella dei dump locali (predefinita: ../backup accanto al repo)
#   TIENI        quanti dump locali tenere (predefinito: 3)
#   BUCKET       bucket R2 (predefinito: parimetro-backup)
#
# Ripristino in un database vuoto con PostGIS:
#   pg_restore --no-owner -d "$DATABASE_URL" parimetro-AAAAMMGG-HHMM.dump
# Da R2 (se il dump era diviso in parti, scaricale tutte e unisci con cat):
#   npx wrangler r2 object get parimetro-backup/NOME.dump --file NOME.dump --remote
set -euo pipefail
RADICE="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$RADICE/../backup}"
TIENI="${TIENI:-3}"
BUCKET="${BUCKET:-parimetro-backup}"
# wrangler carica al massimo ~300 MB per oggetto: sopra si divide in parti
PARTE=250m
LIMITE=$((300 * 1000 * 1000))

# Ogni errore va restituito a mano: chiamata con "carica ... || {...}", la
# funzione gira senza set -e e un upload fallito passerebbe per riuscito.
carica() {
  local f="$1" nome
  nome="$(basename "$f")"
  echo "=== caricamento su R2 ($BUCKET) ==="
  local wr=(npx --prefix "$RADICE/web" wrangler r2 object put)
  if [ "$(wc -c < "$f")" -le "$LIMITE" ]; then
    "${wr[@]}" "$BUCKET/$nome" --file "$f" --remote || return 1
  else
    local tmp
    tmp="$(mktemp -d)"
    split -b "$PARTE" -d -a 3 "$f" "$tmp/$nome.parte-"
    for p in "$tmp"/*; do
      "${wr[@]}" "$BUCKET/$(basename "$p")" --file "$p" --remote || { rm -rf "$tmp"; return 1; }
    done
    rm -rf "$tmp"
    echo "(diviso in parti: per ripristinare scaricale tutte e uniscile con cat, in ordine)"
  fi
  echo "✔ su R2: $BUCKET/$nome"
}

if [ "${1:-}" = "--carica" ]; then
  [ -f "${2:-}" ] || { echo "Uso: $0 --carica FILE.dump"; exit 1; }
  carica "$2"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/parimetro-$(date +%Y%m%d-%H%M).dump"

if [ -z "${PG_DUMP_CMD:-}" ]; then
  URL="$(grep -E '^DATABASE_URL=' "$RADICE/etl/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')"
  [ -n "$URL" ] || { echo "DATABASE_URL non trovata in etl/.env"; exit 1; }
  PG_DUMP_CMD="pg_dump -Fc $(printf %q "$URL")"
fi

echo "=== dump del database (qualche minuto) ==="
eval "$PG_DUMP_CMD" > "$FILE.parziale"
# Un dump -Fc comincia con "PGDMP": se manca, il comando ha scritto altro
if [ "$(head -c 5 "$FILE.parziale")" != "PGDMP" ]; then
  rm -f "$FILE.parziale"
  echo "✗ il dump non e' valido (manca l'intestazione PGDMP)"; exit 1
fi
mv "$FILE.parziale" "$FILE"
echo "✔ $FILE ($(du -h "$FILE" | cut -f1))"

# Restano solo gli ultimi $TIENI dump locali
ls -1t "$BACKUP_DIR"/parimetro-*.dump 2>/dev/null | tail -n +"$((TIENI + 1))" | while read -r vecchio; do
  rm -f "$vecchio" && echo "  tolto il vecchio $(basename "$vecchio")"
done

if [ "${1:-}" = "--solo-locale" ]; then
  exit 0
fi
carica "$FILE" || {
  echo "✗ caricamento su R2 non riuscito: il dump locale c'e' comunque."
  echo "  Se l'errore e' 10042, R2 va attivato una volta dal pannello Cloudflare."
  exit 1
}
