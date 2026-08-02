#!/usr/bin/env bash
# Re-seed clubping-fr-dev from production (#296).
#
# Deliberate on purpose: previews run against clubping-fr-dev, so refreshing it
# destroys whatever a PR was being tested with. Nothing does this automatically.
#
# Reads production, writes only the dev database. The export lands outside the
# repo — it holds real member names, emails and phone numbers.
set -euo pipefail

PROD_DB="clubping-fr-prod"
DEV_DB="clubping-fr-dev"
DEST="${HOME}/d1-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="${DEST}/prod-export-${STAMP}.sql"

mkdir -p "$DEST"

echo "→ exporting ${PROD_DB}"
npx wrangler d1 export "$PROD_DB" --remote --output="$DUMP"

echo "→ this REPLACES everything currently in ${DEV_DB}"
read -r -p "  type 'refresh' to continue: " reply
[ "$reply" = "refresh" ] || { echo "aborted"; exit 1; }

# The export recreates every table, so drop what is there first — otherwise
# CREATE TABLE fails and the load stops half-applied.
echo "→ dropping existing tables in ${DEV_DB}"
TABLES=$(npx wrangler d1 execute "$DEV_DB" --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" \
  | python3 -c 'import sys,json; print(" ".join(r["name"] for r in json.load(sys.stdin)[0]["results"]))')
for t in $TABLES; do
  npx wrangler d1 execute "$DEV_DB" --remote --command "DROP TABLE IF EXISTS \"$t\"" >/dev/null
done

echo "→ loading into ${DEV_DB}"
npx wrangler d1 execute "$DEV_DB" --remote --file="$DUMP"

echo "→ applying migrations"
for f in migrations/*.sql; do
  npx wrangler d1 execute "$DEV_DB" --remote --file="$f" >/dev/null 2>&1 || true
done

echo "✓ ${DEV_DB} refreshed from ${PROD_DB} (export kept at ${DUMP})"
