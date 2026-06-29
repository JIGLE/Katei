#!/bin/sh
set -e

PGDATA=/var/lib/postgresql/data
PGUSER=katei
PGDB=katei
PGPASSWORD="${POSTGRES_PASSWORD:-katei}"

# The Unix socket directory must exist on every boot (Alpine doesn't create it).
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

# Initialise the cluster only if it doesn't exist yet.
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[katei] Initialising PostgreSQL cluster..."
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  su postgres -c "initdb -D $PGDATA --auth=trust --username=postgres"
fi

# Start postgres in the background.
echo "[katei] Starting PostgreSQL..."
su postgres -c "postgres -D $PGDATA -c listen_addresses=localhost" &

# Wait until postgres accepts connections.
until su postgres -c "pg_isready -h localhost -U postgres" > /dev/null 2>&1; do
  sleep 1
done
echo "[katei] PostgreSQL ready."

# Idempotently ensure the application role exists (self-heals a partial init).
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$PGUSER'\"" | grep -q 1; then
  echo "[katei] Creating role $PGUSER..."
  su postgres -c "psql -c \"CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD';\""
else
  # Keep the password in sync with POSTGRES_PASSWORD.
  su postgres -c "psql -c \"ALTER USER $PGUSER WITH PASSWORD '$PGPASSWORD';\""
fi

# Idempotently ensure the application database exists, loading schema on creation.
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$PGDB'\"" | grep -q 1; then
  echo "[katei] Creating database $PGDB..."
  su postgres -c "psql -c \"CREATE DATABASE $PGDB OWNER $PGUSER;\""
  su postgres -c "psql -U $PGUSER -d $PGDB -f /app/schema.sql"
  echo "[katei] Schema loaded."
fi

# Build the DATABASE_URL from env so the Node app can connect.
export DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@localhost:5432/$PGDB"

echo "[katei] Starting application..."
exec node /app/dist/index.js
