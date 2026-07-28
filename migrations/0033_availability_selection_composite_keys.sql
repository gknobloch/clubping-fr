-- #282, step 4 of 4: game_availabilities and game_selections drop their
-- surrogate id for the natural key they were always addressed by.
--
--   game_availabilities  PRIMARY KEY (game_id, player_id)
--   game_selections      PRIMARY KEY (game_id, team_id)
--
-- The `id` column was never the way these rows are reached: every write goes
-- through /game-availabilities/set, /game-availabilities/clear and
-- /game-selections/set, which all take the pair and upsert on it, and every
-- delete is `WHERE game_id = ?`. The surrogate was only ever carried around.
--
-- Making the pair the primary key also makes a duplicate impossible at the
-- schema level — the same guarantee the code was already assuming.
--
-- Both pairs were verified unique on a production export: 122 availabilities
-- for 122 distinct (game, player), 102 selections for 102 distinct
-- (game, team). Runs after 0032, so game_id already holds derived game ids.
--
-- Re-run safety: guarded by the schema_guards marker. A rebuild like this is
-- not naturally idempotent — on a second run the `id` column is already gone,
-- so the INSERT ... SELECT would fail halfway — and the plain INSERT below
-- fails first, rolling the whole file back before anything is touched.

CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_guards (name) VALUES ('0033_availability_selection_composite_keys');

CREATE TABLE game_availabilities_new (
  game_id       TEXT NOT NULL,
  player_id     TEXT NOT NULL,
  status        TEXT NOT NULL,
  overridden_by TEXT,
  PRIMARY KEY (game_id, player_id)
);

-- GROUP BY, not a plain SELECT: belt and braces if a duplicate pair ever
-- appeared between the check above and this running.
INSERT INTO game_availabilities_new (game_id, player_id, status, overridden_by)
SELECT game_id, player_id, max(status), max(overridden_by)
FROM game_availabilities
GROUP BY game_id, player_id;

DROP TABLE game_availabilities;
ALTER TABLE game_availabilities_new RENAME TO game_availabilities;

CREATE TABLE game_selections_new (
  game_id    TEXT NOT NULL,
  team_id    TEXT NOT NULL,
  player_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, team_id)
);

INSERT INTO game_selections_new (game_id, team_id, player_ids)
SELECT game_id, team_id, max(player_ids)
FROM game_selections
GROUP BY game_id, team_id;

DROP TABLE game_selections;
ALTER TABLE game_selections_new RENAME TO game_selections;
