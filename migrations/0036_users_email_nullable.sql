-- users.email becomes nullable (#315).
--
-- The column was `TEXT NOT NULL UNIQUE`, so a member without an address could
-- not be stored as such. Migration 0007 worked around that by inventing one
-- per person:
--
--   noemail-<id>@ppclub.invalid
--
-- Two costs. The data model asserts an address that does not exist, and those
-- strings leak into the UI — the Joueurs table was showing
-- `noemail-p2-p…27@ppclub.invalid` to users, which is worse than an empty
-- cell. This converts them to NULL and lets the column say "no address".
--
-- UNIQUE stays: SQLite treats NULLs as distinct, so any number of members can
-- have none. Nobody loses access — a `.invalid` address could never receive a
-- sign-in code either.
--
-- SQLite cannot relax NOT NULL in place, hence the rebuild (as in 0007, 0010,
-- 0012, 0020 and 0025).
--
-- ORDER MATTERS. player_avatars references users(id) ON DELETE CASCADE, and
-- `DROP TABLE users` performs an implicit delete of every row for foreign-key
-- purposes — which would cascade and destroy every avatar. So the child table
-- is parked and dropped *first*, leaving nothing pointing at users when it
-- goes, and is rebuilt against the new table afterwards.

-- 1. Park the avatars somewhere no foreign key reaches.
--
--    Written to survive re-application, because deploy.yml re-runs every
--    migration behind `|| true` (#312). A plain `CREATE TABLE … AS SELECT`
--    fails on the second run, and if the runner carried on past that error it
--    would drop the live table and restore a stale snapshot — losing any
--    avatar uploaded since. So the backup is created once and refreshed from
--    the live table every time.
--
--    The order also matters if a previous run half-applied: with
--    player_avatars already gone, both statements fail harmlessly and the
--    existing backup is left untouched for step 4 to restore.
CREATE TABLE IF NOT EXISTS player_avatars_pre_0036 (
  user_id      TEXT PRIMARY KEY,
  data         TEXT,
  content_type TEXT,
  updated_at   TEXT
);

INSERT OR REPLACE INTO player_avatars_pre_0036 (user_id, data, content_type, updated_at)
SELECT user_id, data, content_type, updated_at FROM player_avatars;

-- 2. Remove the only reference to users, so nothing can cascade in step 4.
DROP TABLE IF EXISTS player_avatars;

-- 3. Rebuild users, identical but for the nullable email, turning the
--    placeholder addresses into the absence they always represented.
CREATE TABLE users_new (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE,
  role           TEXT NOT NULL DEFAULT 'player',   -- general_admin | club_admin | player
  is_player      INTEGER NOT NULL DEFAULT 1,
  first_name     TEXT,
  last_name      TEXT,
  license_number TEXT,
  phone          TEXT NOT NULL DEFAULT '',
  birth_date     TEXT,
  birth_place    TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  club_id        TEXT
);

INSERT INTO users_new (
  id, email, role, is_player, first_name, last_name,
  license_number, phone, birth_date, birth_place, status, club_id
)
SELECT
  id,
  CASE WHEN email LIKE '%@ppclub.invalid' THEN NULL ELSE email END,
  role, is_player, first_name, last_name,
  license_number, phone, birth_date, birth_place, status, club_id
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 4. Rebuild the child against the new users and restore its rows.
CREATE TABLE player_avatars (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data         TEXT NOT NULL,        -- base64-encoded image bytes (no data: prefix)
  content_type TEXT NOT NULL,        -- e.g. image/jpeg
  updated_at   TEXT NOT NULL         -- ISO timestamp, used as the cache-busting version
);

INSERT INTO player_avatars (user_id, data, content_type, updated_at)
SELECT user_id, data, content_type, updated_at FROM player_avatars_pre_0036;

-- player_avatars_pre_0036 is deliberately left behind. `wrangler d1 execute
-- --file` does not apply a file atomically, so a half-applied run must still
-- have the avatars recoverable. A later migration drops it, as 0025 did for
-- 0020's backup.
