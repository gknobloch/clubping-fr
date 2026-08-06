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

# Everything below drops tables and overwrites data. A typo in DEV_DB that
# happened to name production would be unrecoverable, so refuse anything that
# is not a `-dev` database before touching a single row.
case "$DEV_DB" in
  *-dev) ;;
  *) echo "refusing: DEV_DB='${DEV_DB}' does not end in -dev"; exit 1 ;;
esac
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

# Not optional, and not tolerant of failure (#313): previews enable dev login,
# so whatever survives here is reachable by anyone who guesses the preview URL.
# If this step fails the database still holds production data — say so loudly
# rather than leaving it exposed.
echo "→ anonymising ${DEV_DB}"
npx wrangler d1 execute "$DEV_DB" --remote --file=scripts/anonymise-dev-db.sql >/dev/null

echo "→ verifying no production data survived"
REMAINING=$(npx wrangler d1 execute "$DEV_DB" --remote --json \
  --command "SELECT (SELECT count(*) FROM users WHERE email NOT LIKE '%@example.invalid') \
    + (SELECT count(*) FROM sessions) + (SELECT count(*) FROM auth_otp) \
    + (SELECT count(*) FROM auth_identities) AS n" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["results"][0]["n"])')
if [ "$REMAINING" != "0" ]; then
  echo "✘ ${REMAINING} row(s) still hold real data in ${DEV_DB} — do NOT deploy a preview against it"
  exit 1
fi

echo "✓ ${DEV_DB} refreshed from ${PROD_DB} and anonymised (export kept at ${DUMP})"
