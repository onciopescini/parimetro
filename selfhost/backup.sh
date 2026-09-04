#!/usr/bin/env bash
# Backup notturno del database.
#
# I dati sono riproducibili rilanciando l'ETL, ma costano ore di download e
# dipendono da fonti che cambiano senza avvisare: ricostruirli non e' un
# piano di ripristino, e' una speranza. Un dump compresso sta in poche
# centinaia di MB.
#
# Cron, come utente che puo' usare docker:
#   30 3 * * * /opt/mappabilanci/selfhost/backup.sh >> /var/log/mappabilanci-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

DEST="${BACKUP_DIR:-/var/backups/mappabilanci}"
GIORNI="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"

FILE="$DEST/mappabilanci-$(date +%Y%m%d-%H%M).dump"

# Formato custom (-Fc): compresso, e permette il ripristino selettivo di
# singole tabelle senza rigiocare tutto il dump.
docker compose exec -T db pg_dump -U postgres -d mappabilanci -Fc > "$FILE.parziale"

# Rinomino solo a dump completato: un file troncato che si chiama come un
# backup valido e' peggio di un backup mancante, perche' ci credi.
mv "$FILE.parziale" "$FILE"
echo "$(date '+%F %T')  creato $FILE ($(du -h "$FILE" | cut -f1))"

# Verifica che il dump sia leggibile, non solo che esista
if ! docker compose exec -T db pg_restore --list < "$FILE" > /dev/null 2>&1; then
  echo "!!! $FILE non e' rileggibile: NON cancello i backup vecchi"
  exit 1
fi

find "$DEST" -name 'mappabilanci-*.dump' -mtime "+$GIORNI" -print -delete
echo "ripristino:  docker compose exec -T db pg_restore -U postgres -d mappabilanci --clean < FILE"
