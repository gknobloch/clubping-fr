#!/usr/bin/env bash
# Compare a live database's schema against what migrations/ produces (#312).
#
# The reason this exists: the old `|| true` loop could swallow a migration that
# never applied, and nothing would ever say so. Before back-filling
# d1_migrations — which declares the whole history "already applied" — it is
# worth proving the schema really is what the history says it should be.
#
#   ./scripts/verify-schema.sh clubping-fr-prod
#   ./scripts/verify-schema.sh clubping-fr-dev --env preview
#
# Read-only on the live database: it only reads sqlite_master.
set -euo pipefail

DB="${1:-}"
shift || true
if [ -z "$DB" ]; then
  echo "usage: $0 <database-name> [extra wrangler args...]" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The reference: every migration applied in order to an empty database.
echo "→ building a reference schema from migrations/"
for f in migrations/*.sql; do
  sqlite3 -bail "$WORK/ref.db" < "$f"
done

# Normalise: names only, sorted. Comparing full CREATE statements would drown
# the signal in whitespace and column-order noise from ALTER TABLE rebuilds.
sqlite3 "$WORK/ref.db" \
  "SELECT type || ' ' || name FROM sqlite_master
   WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
   ORDER BY 1" > "$WORK/ref.txt"

echo "→ reading ${DB}"
npx wrangler d1 execute "$DB" --remote "$@" --json --command \
  "SELECT type || ' ' || name AS o FROM sqlite_master
   WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
   ORDER BY 1" \
  | python3 -c 'import sys,json; [print(r["o"]) for r in json.load(sys.stdin)[0]["results"]]' > "$WORK/live.txt"

echo
if diff -u "$WORK/ref.txt" "$WORK/live.txt"; then
  echo "✓ ${DB} matches migrations/ — safe to back-fill d1_migrations"
else
  echo
  echo "✘ ${DB} differs from what migrations/ produces."
  echo "  '-' lines are in migrations but MISSING from the database — most"
  echo "  likely a migration the old loop swallowed. Do NOT back-fill until"
  echo "  this is understood: back-filling would skip it permanently."
  exit 1
fi
