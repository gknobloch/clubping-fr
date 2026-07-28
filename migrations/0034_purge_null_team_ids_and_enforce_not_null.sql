-- #284: remove the teams inserted with a NULL id, and make it impossible again.
--
-- What happened: in the games import, a local helper was named teamIdFor and
-- shadowed the imported teamIdFor(clubId, phaseId, number) added by #282. The
-- call meant for the import recursed into the local one with the wrong
-- arguments, hit its `if (!clubId || side.teamNumber === null) return null`
-- guard and returned null — so every opponent team the import created was
-- inserted with a NULL id. No game could then reference it, which is why the
-- import reported "42 adversaires créés" and no matches.
--
-- Two things let it reach production:
--   1. functions/ is not typechecked — the root tsconfig only includes "src" —
--      so calling a one-argument function with three arguments compiled fine.
--      #284 adds @typescript-eslint/no-shadow, which catches the shadowing
--      itself; typechecking functions/ properly is tracked separately.
--   2. `id TEXT PRIMARY KEY` does NOT imply NOT NULL in SQLite. Only INTEGER
--      PRIMARY KEY does; for every other type a NULL primary key is accepted,
--      and since NULL is never equal to NULL, INSERT OR IGNORE deduplicated
--      nothing — each retry of the import added another full set of rows.
--
-- This migration deletes the junk (84 rows in production, all empty: no
-- players, no captain, no venue, and nothing referencing them), strips the
-- NULL that leaked into a group's team_ids JSON array, and rebuilds teams and
-- games with NOT NULL on the primary key so the next such bug fails loudly at
-- the first insert instead of quietly filling a table.
--
-- Re-run safety: guarded by the schema_guards marker — a table rebuild is not
-- naturally idempotent, and the plain INSERT below fails on a second run,
-- rolling the whole file back before anything is touched.

CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_guards (name) VALUES ('0034_purge_null_team_ids_and_enforce_not_null');

-- Nothing can reference a NULL id, but be explicit rather than assume.
DELETE FROM game_selections WHERE team_id IS NULL;
DELETE FROM games WHERE home_team_id IS NULL OR away_team_id IS NULL;
DELETE FROM teams WHERE id IS NULL;

-- json_group_array keeps SQL NULLs as JSON nulls, so filter them out.
UPDATE "groups"
SET team_ids = (
  SELECT json_group_array(j.value) FROM json_each("groups".team_ids) j WHERE j.value IS NOT NULL
)
WHERE EXISTS (SELECT 1 FROM json_each("groups".team_ids) j WHERE j.value IS NULL);

-- === teams: PRIMARY KEY NOT NULL ===

CREATE TABLE teams_new (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  group_id TEXT NOT NULL,
  game_location_id TEXT NOT NULL DEFAULT '',
  default_day TEXT NOT NULL DEFAULT '',
  default_time TEXT NOT NULL DEFAULT '',
  captain_id TEXT NOT NULL DEFAULT '',
  player_ids TEXT NOT NULL DEFAULT '[]',
  roster_initial_points TEXT,
  color TEXT,
  whatsapp_link TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  team_id TEXT
);

INSERT INTO teams_new
SELECT id, club_id, phase_id, number, group_id, game_location_id, default_day,
       default_time, captain_id, player_ids, roster_initial_points, color,
       whatsapp_link, is_archived, team_id
FROM teams;

DROP TABLE teams;
ALTER TABLE teams_new RENAME TO teams;

-- === games: PRIMARY KEY NOT NULL, and the team references too ===

CREATE TABLE games_new (
  id TEXT PRIMARY KEY NOT NULL,
  match_day_id TEXT NOT NULL,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  time TEXT,
  date TEXT,
  game_id TEXT
);

INSERT INTO games_new
SELECT id, match_day_id, home_team_id, away_team_id, time, date, game_id FROM games;

DROP TABLE games;
ALTER TABLE games_new RENAME TO games;
