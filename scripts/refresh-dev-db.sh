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

# The export interleaves each table's CREATE with its INSERTs in arbitrary
# order, so a child table's rows can arrive before its parent table exists.
# D1 enforces foreign keys and rejects that; local sqlite3 has them off by
# default and does not, which is why it only ever failed on the way back in.
# Rewrite the file parents-first before going anywhere near the dev database.
# Named `ordered-`, NOT `prod-export-…-ordered.sql`: the archive directory is
# globbed as prod-export-*.sql to find the latest export, and a derived file
# matching that pattern gets picked up as if it were one. It reads as an export
# and is not one — normalise it again and you normalise your own output.
NORM="${DEST}/ordered-${STAMP}.sql"
# Base64 images are dropped here rather than deleted after the fact (#359):
# nothing on a preview needs member photographs, and they are the bulk of the
# bytes. The tables still arrive, empty. anonymise-dev-db.sql deletes from them
# too, as a safety net for a load that skipped this step.
SKIP_ROWS="user_avatars,player_avatars_pre_0036,club_logos"
echo "→ ordering the export for load (skipping rows: ${SKIP_ROWS})"
python3 "$(dirname "$0")/normalise-d1-export.py" "$DUMP" "$NORM" "--skip-rows=${SKIP_ROWS}"

# Everything below is destructive, and the load is the step most likely to
# fail. Prove the file loads — with foreign keys ON, exactly as D1 will
# enforce them — against a throwaway local database FIRST. A refresh that was
# going to fail now fails here, with dev still intact.
#
# This is not hypothetical: a failed load once left clubping-fr-dev with its
# tables dropped and nothing put back, which takes every preview down with it.
echo "→ rehearsing the load locally"
REHEARSAL="$(mktemp -d)"
trap 'rm -rf "$REHEARSAL"' EXIT
if ! { echo "PRAGMA foreign_keys=ON;"; cat "$NORM"; } \
     | sqlite3 -bail "${REHEARSAL}/rehearsal.db" 2>"${REHEARSAL}/err"; then
  echo "✘ the export does not load cleanly — ${DEV_DB} has NOT been touched:"
  sed 's/^/    /' "${REHEARSAL}/err"
  exit 1
fi
echo "  ✓ loads cleanly ($(sqlite3 "${REHEARSAL}/rehearsal.db" \
  "SELECT count(*) FROM sqlite_master WHERE type='table'") tables)"

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
npx wrangler d1 execute "$DEV_DB" --remote --file="$NORM"

# The export carries production's d1_migrations table across with everything
# else, so the dev database arrives already knowing what it has run (#312).
# Normally that leaves nothing to apply; anything newer than the export lands
# here, and a failure stops the refresh instead of being hidden.
echo "→ applying migrations"
npx wrangler d1 migrations apply "$DEV_DB" --remote --env preview

# Not optional, and not tolerant of failure (#313): previews enable dev login,
# so whatever survives here is reachable by anyone who guesses the preview URL.
# If this step fails the database still holds production data — say so loudly
# rather than leaving it exposed.
echo "→ anonymising ${DEV_DB}"
npx wrangler d1 execute "$DEV_DB" --remote --file=scripts/anonymise-dev-db.sql >/dev/null

echo "→ verifying no production data survived"
# Each term must be 0. Beyond the person-level checks: the image tables have to
# be empty, every club must carry a synthetic 99-prefixed affiliation number
# (which is what proves the club rename ran rather than silently no-op'd), and
# no club channel may still point at a resolvable host (#359).
REMAINING=$(npx wrangler d1 execute "$DEV_DB" --remote --json \
  --command "SELECT (SELECT count(*) FROM users WHERE email NOT LIKE '%@example.invalid') \
    + (SELECT count(*) FROM sessions) + (SELECT count(*) FROM auth_otp) \
    + (SELECT count(*) FROM auth_identities) \
    + (SELECT count(*) FROM user_avatars) + (SELECT count(*) FROM player_avatars_pre_0036) \
    + (SELECT count(*) FROM club_logos) \
    + (SELECT count(*) FROM clubs WHERE affiliation_number NOT LIKE '99%') \
    + (SELECT count(*) FROM club_channels WHERE link NOT LIKE '%example.invalid%') \
    + (SELECT count(*) FROM fftt_club_teams_cache) + (SELECT count(*) FROM fftt_season_cache) AS n" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["results"][0]["n"])')
if [ "$REMAINING" != "0" ]; then
  echo "✘ ${REMAINING} row(s) still hold real data in ${DEV_DB} — do NOT deploy a preview against it"
  exit 1
fi

echo "✓ ${DEV_DB} refreshed from ${PROD_DB} and anonymised (export kept at ${DUMP})"
