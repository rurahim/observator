#!/bin/bash
# Restore a PostgreSQL custom dump to the observator database.
# Usage: docker exec postgres bash /tmp/restore_backup.sh /tmp/clean_dump.backup
set -euo pipefail

BACKUP_FILE="${1:-/tmp/clean_dump.backup}"

echo "=== Terminating active connections ==="
psql -U observator -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='observator' AND pid <> pg_backend_pid();" || true

echo "=== Dropping database ==="
dropdb -U observator --if-exists observator

echo "=== Creating fresh database ==="
createdb -U observator observator

echo "=== Restoring from backup ==="
pg_restore -U observator -d observator --no-owner --no-privileges "$BACKUP_FILE" 2>&1 | tail -5 || true

echo "=== Verifying ==="
psql -U observator -d observator -c "SELECT relname as table_name, n_live_tup as rows FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;"

echo "=== Materialized views ==="
psql -U observator -d observator -c "SELECT matviewname, ispopulated FROM pg_matviews WHERE schemaname='public' ORDER BY matviewname;"

echo "=== Restore complete ==="
