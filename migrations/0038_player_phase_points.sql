-- #384: a player's points move from the team to the phase.
--
--   player_phase_points  PRIMARY KEY (phase_id, player_id)
--
-- Points were stored in teams.roster_initial_points, a JSON map of
-- playerId -> points carried by the team. The reasoning held as far as it
-- went — points are valid for a phase, and a team belongs to a phase — but a
-- licensee with no team has nowhere to put them, and they are the same points
-- either way. The web app had already grown a workaround for it: the match
-- day page looked in the player's own team, then swept every other team of the
-- club in that phase to find the value.
--
-- After this, (phase, player) is the address, and the FFTT import is its only
-- writer — the team form no longer edits points, so two teams of one phase can
-- no longer disagree about the same player.
--
-- The backfill takes every JSON entry of every team and files it under that
-- team's phase. GROUP BY collapses a player who somehow appeared in two teams
-- of the same phase, which the composite primary key would otherwise reject
-- outright; max() then picks one deterministically. Blank strings are dropped:
-- the form wrote "" for a roster line left empty, which never meant zero.
--
-- Re-run safety: guarded by the schema_guards marker. Rebuilding teams is not
-- naturally idempotent — on a second run roster_initial_points is already gone
-- and the INSERT ... SELECT would fail halfway — so the plain INSERT below
-- fails first, rolling the whole file back before anything is touched.

CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_guards (name) VALUES ('0038_player_phase_points');

CREATE TABLE player_phase_points (
  phase_id  TEXT NOT NULL,
  player_id TEXT NOT NULL,
  points    TEXT NOT NULL,
  PRIMARY KEY (phase_id, player_id)
);

INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT t.phase_id, j.key, max(j.value)
FROM teams t, json_each(t.roster_initial_points) j
WHERE t.roster_initial_points IS NOT NULL
  AND j.value IS NOT NULL
  AND trim(j.value) != ''
GROUP BY t.phase_id, j.key;

-- === teams: drop roster_initial_points ===

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
  color TEXT,
  whatsapp_link TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  team_id TEXT
);

INSERT INTO teams_new
SELECT id, club_id, phase_id, number, group_id, game_location_id, default_day,
       default_time, captain_id, player_ids, color, whatsapp_link, is_archived,
       team_id
FROM teams;

DROP TABLE teams;
ALTER TABLE teams_new RENAME TO teams;
