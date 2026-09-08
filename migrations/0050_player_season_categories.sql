-- 0050 — a licensee's category belongs to a season, not to the licensee (#482)
--
--   player_season_categories  PRIMARY KEY (season_id, player_id)
--
-- 0045 put the FFTT category on `users`, as one value per person. That reads
-- fine for a week and is wrong by August: a cadet becomes a junior, a V45
-- becomes a V50, and the next players import would overwrite the value that
-- decided last season's eligibility — silently rewriting who had been allowed
-- to play in a championship that is already over.
--
-- The parallel is exact with points (0038): points are stated per phase, so
-- they hang off (phase, player); a category is stated per season — the FFTT
-- licence record is issued for a season — so it hangs off (season, player).
-- A season is the right grain, not the phase: nobody changes category at the
-- January phase boundary.
--
-- The backfill files whatever `users.category` holds under the ACTIVE season,
-- which is the season it was imported for — there has never been another. With
-- no active season there is nothing to attach it to, and the SELECT yields no
-- rows rather than guessing.
--
-- `users.category` then goes: two places to read a category is how they come to
-- disagree. Nothing indexed it, so the column drops without a table rebuild.

CREATE TABLE IF NOT EXISTS player_season_categories (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The FFTT code verbatim ("S", "V45", "B2"), normalised on read.
  category  TEXT NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

INSERT OR IGNORE INTO player_season_categories (season_id, player_id, category)
SELECT s.id, u.id, u.category
FROM users u
JOIN seasons s ON s.status = 'active'
WHERE u.category IS NOT NULL AND TRIM(u.category) <> '';

ALTER TABLE users DROP COLUMN category;
