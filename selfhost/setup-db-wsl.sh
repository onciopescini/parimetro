#!/bin/bash
# Cluster Postgres 17 dedicato a mappa-bilanci, porta 5433.
#
# NON tocca il cluster 17/main (porta 5432, con pgvector): e' di un altro
# progetto. Questo crea un cluster separato, con la propria directory dati e la
# propria configurazione, riusando solo i binari e PostGIS gia' installati.
# (Sulla 5432 di Windows c'e' inoltre un altro PostgreSQL, senza PostGIS.)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ETL=/mnt/c/dev/mappabilanci/parimetro/etl
VER=17
NOME=mappabilanci

echo "== rimuovo i pacchetti 16/18 aggiunti per errore dal tentativo precedente =="
# Solo quelli installati dal mio comando delle 15:27: niente autoremove, per non
# portarsi via dipendenze dell'altro progetto.
apt-get purge -y -qq postgresql postgresql-16 postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
  postgresql-18 postgresql-18-jit postgresql-client-16 postgresql-client-18 2>&1 | tail -2 || true

echo "== servono i binari 17 e postgis 17 (gia' presenti) =="
dpkg -s postgresql-$VER postgresql-$VER-postgis-3 >/dev/null

if pg_lsclusters -h | awk '{print $2}' | grep -qx "$NOME"; then
  echo "cluster $NOME gia' presente"
else
  pg_createcluster $VER $NOME --port 5433 -- --auth-local=peer --auth-host=scram-sha-256
fi

CONF=/etc/postgresql/$VER/$NOME
# Raggiungibile da Windows attraverso l'inoltro di localhost della WSL; la VM
# sta dietro NAT, quindi non e' esposta alla rete di casa.
sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" $CONF/postgresql.conf
grep -q "mappabilanci-dev" $CONF/pg_hba.conf || cat >> $CONF/pg_hba.conf <<'HBA'
# mappabilanci-dev: solo loopback e la rete privata della WSL
host    mappabilanci    all    127.0.0.1/32     scram-sha-256
host    mappabilanci    all    172.16.0.0/12    scram-sha-256
HBA

pg_ctlcluster $VER $NOME restart 2>/dev/null || pg_ctlcluster $VER $NOME start
sleep 3

PW=$(openssl rand -hex 16)
su - postgres -c "psql -qAt -p 5433 -c \"alter user postgres password '$PW'\"" >/dev/null
if ! su - postgres -c "psql -qAt -p 5433 -lqt" | cut -d'|' -f1 | grep -qw mappabilanci; then
  su - postgres -c "createdb -p 5433 mappabilanci"
fi

# La password va nel .env dell'ETL (ignorato da git), non a video
URL="postgres://postgres:$PW@localhost:5433/mappabilanci"
cat > $ETL/.env <<ENV
# Postgres di sviluppo nella WSL (cluster 17/mappabilanci, porta 5433).
# Generato da setup-db-wsl.sh.
DATABASE_URL=$URL
TEST_DATABASE_URL=$URL
ENV

echo "== fatto =="
pg_lsclusters
su - postgres -c "psql -qAt -p 5433 -d mappabilanci -c \"select version()\"" | cut -c1-60
