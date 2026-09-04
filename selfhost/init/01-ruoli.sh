#!/bin/bash
# Ruolo di sola lettura per l'applicazione.
# Gira una volta sola, alla prima creazione del volume del database.
#
# E' uno script e non un .sql perche' la password arriva dall'ambiente:
# in un file .sql servirebbe una variabile psql che l'entrypoint non imposta.
#
# L'app non deve poter scrivere: i dati entrano solo dall'ETL, che si collega
# come postgres da localhost. Se un domani l'app avesse una falla, il massimo
# che si potrebbe fare e' leggere dati gia' pubblici.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v pwd="'${READONLY_PASSWORD}'" <<'SQL'
create role mappa_ro with login password :pwd;
grant connect on database mappabilanci to mappa_ro;
grant usage on schema public to mappa_ro;
-- Vale anche per le tabelle e funzioni che l'ETL creera' in futuro
alter default privileges in schema public grant select on tables to mappa_ro;
alter default privileges in schema public grant execute on functions to mappa_ro;
SQL
