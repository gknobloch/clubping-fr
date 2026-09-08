-- 0051 — which licences the FFTT listed for a season (#488)
--
--   player_season_licences  PRIMARY KEY (season_id, player_id)
--
-- The club import already computes this and already shows it: "Absents de la
-- liste FFTT (3)". Then the dialog closes and the fact is gone, so a captain
-- picking a line-up three weeks later has no way to know that one of the names
-- offered has no validated licence this season — and a player without one may
-- not be fielded.
--
-- A row means the federation listed that licence for that season. The absence
-- of one is not, on its own, "no licence": it is also every club that has never
-- run the import. So the screens only draw the conclusion for a club that has
-- at least one row for the season, which is what proves a club-wide import ran
-- — see src/lib/seasonLicences.ts.
--
-- Only the club-wide import writes here. Looking a single licence up says
-- nothing about the rest of the club, and must not empty the set.
--
-- Season, not phase: a licence is validated for a season, exactly like the
-- category it carries (0050). Points stay per phase — they are the one thing
-- FFTT restates in January.

CREATE TABLE IF NOT EXISTS player_season_licences (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, player_id)
);

-- Everyone the seed gives a category to was read off a validated licence.
INSERT OR IGNORE INTO player_season_licences (season_id, player_id)
SELECT season_id, player_id FROM player_season_categories;
