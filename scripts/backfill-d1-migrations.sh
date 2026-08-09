#!/usr/bin/env bash
# One-time back-fill of d1_migrations for #312.
#
# Until #312 both workflows applied every migration on every run and swallowed
# the failures with `|| true`. Nothing recorded what had run, so switching to
# `wrangler d1 migrations apply` on a database that already has the whole
# history would make wrangler replay all of it — and, this time, fail loudly
# partway through.
#
# This marks every migration currently in migrations/ as already applied,
# without executing any of them, so the first real run has nothing to do.
#
# RUN THIS ONCE PER EXISTING DATABASE, BEFORE MERGING #312:
#
#   ./scripts/backfill-d1-migrations.sh clubping-fr-prod
#   ./scripts/backfill-d1-migrations.sh clubping-fr-dev --env preview
#
# It writes nothing but the tracking table, and is safe to re-run: every insert
# is OR IGNORE.
#
# BEFORE YOU RUN IT, be sure the schema really is up to date — see
# scripts/verify-schema.sh. The `|| true` loop could have swallowed a migration
# that never applied, and marking that one "applied" would skip it forever.
set -euo pipefail

DB="${1:-}"
shift || true
if [ -z "$DB" ]; then
  echo "usage: $0 <database-name> [extra wrangler args...]" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Wrangler's own schema, copied exactly — it creates this table itself when it
# is absent, and a mismatched definition would be worse than none.
SQL="CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);"

COUNT=0
for f in migrations/*.sql; do
  SQL="${SQL}
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('$(basename "$f")');"
  COUNT=$((COUNT + 1))
done

echo "→ marking ${COUNT} migration(s) as applied on ${DB}"
echo "  (no migration is executed; only the tracking table is written)"
npx wrangler d1 execute "$DB" --remote "$@" --command "$SQL"

echo "→ what wrangler thinks is left to do:"
npx wrangler d1 migrations list "$DB" --remote "$@" || true

echo "✓ ${DB} back-filled — 'No migrations to apply' above means it worked"
