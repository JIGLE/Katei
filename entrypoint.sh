#!/bin/sh
set -e

PGDATA=/var/lib/postgresql/data
PGUSER=katei
PGDB=katei
PGPASSWORD="${POSTGRES_PASSWORD:-katei}"

# First boot: initialise the cluster, create user/db, and load schema.
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[katei] First boot — initialising PostgreSQL..."
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"

  su postgres -c "initdb -D $PGDATA --auth=trust --username=postgres"
  su postgres -c "pg_ctl -D $PGDATA start -w -o '-c listen_addresses=localhost'"

  su postgres -c "psql -c \"CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';\""
  su postgres -c "psql -c \"CREATE DATABASE $PGDB OWNER $PGUSER;\""
  su postgres -c "psql -U $PGUSER -d $PGDB -f /app/schema.sql"
  echo "[katei] Schema loaded."

  su postgres -c "pg_ctl -D $PGDATA stop -w"
fi

# Start postgres in the background.
echo "[katei] Starting PostgreSQL..."
su postgres -c "postgres -D $PGDATA -c listen_addresses=localhost" &

# Wait until postgres is ready to accept connections.
until pg_isready -h localhost -U "$PGUSER" -d "$PGDB" > /dev/null 2>&1; do
  sleep 1
done
echo "[katei] PostgreSQL ready."

# Build the DATABASE_URL from env so the Node app can connect.
export DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@localhost:5432/$PGDB"

echo "[katei] Starting application..."
exec node /app/dist/index.js
