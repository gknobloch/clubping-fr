-- #282, step 3 of 4: games get a derived local id and an FFTT id of their own.
--
--   games.id       game-<journée>-<home>-<away>
--   games.game_id  the FFTT match id, NULL unless the game came from FFTT
--
-- games.game_id is not cosmetic. The games import dedups by checking the FFTT
-- match id against games.id (`gameIds.has(m.id)` in the import handler), which
-- stops working the moment id is derived — every re-import would create a
-- second copy of every match. Moving the FFTT id into its own column keeps
-- that check working, exactly as 0029 did for group pool ids.
--
-- Runs after 0031, so home_team_id / away_team_id already hold derived team
-- ids and the game id is built from those.
--
-- (match_day_id, home_team_id, away_team_id) is unique — two teams meet at
-- most once per journée — and was verified so on a production export both
-- before and after 0030 removed the duplicated fixtures.
--
-- Prefix stripping is substr-based to match gameIdFor() in
-- src/lib/entityIds.ts character for character. Keep the two in step.
--
-- Re-run safety: the ALTER on the first line fails once the column exists,
-- rolling the whole file back.

ALTER TABLE games ADD COLUMN game_id TEXT;

DROP TABLE IF EXISTS game_id_remap;

CREATE TABLE game_id_remap AS
SELECT
  id AS old_id,
  'game-'
    || (CASE WHEN match_day_id LIKE 'md-%' THEN substr(match_day_id, 4) ELSE match_day_id END)
    || '-'
    || (CASE WHEN home_team_id LIKE 'team-%' THEN substr(home_team_id, 6) ELSE home_team_id END)
    || '-'
    || (CASE WHEN away_team_id LIKE 'team-%' THEN substr(away_team_id, 6) ELSE away_team_id END) AS new_id,
  CASE WHEN id GLOB '[0-9]*' AND id NOT GLOB '*[^0-9]*' THEN id END AS fftt_match_id
FROM games;

UPDATE game_availabilities
SET game_id = (SELECT new_id FROM game_id_remap WHERE old_id = game_availabilities.game_id)
WHERE game_id IN (SELECT old_id FROM game_id_remap);

UPDATE game_selections
SET game_id = (SELECT new_id FROM game_id_remap WHERE old_id = game_selections.game_id)
WHERE game_id IN (SELECT old_id FROM game_id_remap);

INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time, date, game_id)
SELECT r.new_id, g.match_day_id, g.home_team_id, g.away_team_id, g.time, g.date, r.fftt_match_id
FROM games g
JOIN game_id_remap r ON r.old_id = g.id;

DELETE FROM games WHERE id IN (SELECT old_id FROM game_id_remap);

DROP TABLE game_id_remap;
