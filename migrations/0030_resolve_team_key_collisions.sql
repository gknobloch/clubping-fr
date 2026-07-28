-- #282, step 1 of 4: make (club_id, phase_id, number) unique.
--
-- Prerequisite for everything that follows: 0031 derives teams.id from that
-- triple, so any collision would silently collapse two teams into one. A
-- production export had 148 teams for 143 distinct triples — five collisions,
-- of two quite different kinds.
--
-- === Kind 1: the same team imported twice (four cases) ===
--
--   5865  / doc-06680125-1   Rosenau phase-27-1 n=1
--   2017  / doc-06680125-2   Rosenau phase-27-1 n=2
--   4047  / doc-06680125-3   Rosenau phase-27-1 n=3
--   3358  / doc-06880002-2   Anould  phase-27-1 n=2
--
-- The FFTT teams import keys teams on the FFTT team id, the PDF schedule
-- import on doc-<affiliation>-<number>, and before #275 fixed the resolver
-- neither could see the other's rows. The FFTT-id row survives: it is the id
-- space the games import works in.
--
-- 2017 and doc-06680125-2 both carry the SAME seven fixtures (identical
-- journées and opponents, checked row by row), so repointing produces seven
-- duplicate games. Each pair is one FFTT-id game and one game-doc-* twin with
-- the same date, and none of them carries a single availability or selection,
-- so dropping the twin loses nothing. The rule below is general rather than a
-- list of seven ids: after repointing, any (journée, home, away) holding more
-- than one game keeps the one whose id is an FFTT match id.
--
-- === Kind 2: a genuine clash between two different clubs (one case) ===
--
--   p2-opp-staffelfelden-1 / p2-opp-ttmcensisheim-1   Ensisheim phase-26-2 n=1
--
-- NOT a duplicate. #277 consolidated club 06680123 onto club-fftt-06680123
-- knowing the legacy row actually held Staffelfelden's team and venue, so two
-- unrelated teams ended up as "team 1" of the same club. Neither may be
-- deleted. The Staffelfelden one is renumbered to 3 — the first free number
-- for that club and phase (1 and 2 are taken) — which is a placeholder, not a
-- claim about reality: the real fix is to give Staffelfelden its own club,
-- which needs an affiliation number nothing here knows.
--
-- Re-run safety: naturally idempotent. Every statement keys on a doc-* id or a
-- number that no longer exists after the first run.

DROP TABLE IF EXISTS team_dupe;

CREATE TABLE team_dupe (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);

INSERT INTO team_dupe (old_id, new_id)
SELECT s.old_id, s.new_id FROM (
  SELECT 'doc-06680125-1' AS old_id, '5865' AS new_id
  UNION ALL SELECT 'doc-06680125-2', '2017'
  UNION ALL SELECT 'doc-06680125-3', '4047'
  UNION ALL SELECT 'doc-06880002-2', '3358'
) s
JOIN teams o ON o.id = s.old_id
JOIN teams n ON n.id = s.new_id;

UPDATE games
SET home_team_id = (SELECT new_id FROM team_dupe WHERE old_id = games.home_team_id)
WHERE home_team_id IN (SELECT old_id FROM team_dupe);

UPDATE games
SET away_team_id = (SELECT new_id FROM team_dupe WHERE old_id = games.away_team_id)
WHERE away_team_id IN (SELECT old_id FROM team_dupe);

UPDATE game_selections
SET team_id = (SELECT new_id FROM team_dupe WHERE old_id = game_selections.team_id)
WHERE team_id IN (SELECT old_id FROM team_dupe);

-- groups.team_ids is a JSON array of team ids; swap the merged-away id for the
-- survivor, then drop the duplicate entry the swap may have produced.
UPDATE "groups"
SET team_ids = (
  SELECT json_group_array(v) FROM (
    SELECT DISTINCT coalesce((SELECT new_id FROM team_dupe WHERE old_id = j.value), j.value) AS v
    FROM json_each("groups".team_ids) j
  )
)
WHERE EXISTS (
  SELECT 1 FROM json_each("groups".team_ids) j
  JOIN team_dupe d ON d.old_id = j.value
);

-- Games that became duplicates of one another. The survivor is the one whose
-- id is an FFTT match id (all digits); the twin and anything hanging off it go.
DROP TABLE IF EXISTS game_dupe;

CREATE TABLE game_dupe AS
SELECT g.id
FROM games g
JOIN (
  SELECT match_day_id, home_team_id, away_team_id
  FROM games
  GROUP BY match_day_id, home_team_id, away_team_id
  HAVING count(*) > 1
) d ON d.match_day_id = g.match_day_id
   AND d.home_team_id = g.home_team_id
   AND d.away_team_id = g.away_team_id
WHERE NOT (g.id GLOB '[0-9]*' AND g.id NOT GLOB '*[^0-9]*');

DELETE FROM game_availabilities WHERE game_id IN (SELECT id FROM game_dupe);
DELETE FROM game_selections WHERE game_id IN (SELECT id FROM game_dupe);
DELETE FROM games WHERE id IN (SELECT id FROM game_dupe);

DROP TABLE game_dupe;

DELETE FROM teams WHERE id IN (SELECT old_id FROM team_dupe);

DROP TABLE team_dupe;

-- Kind 2: give the Staffelfelden team a free number so it stops clashing.
UPDATE teams
SET number = 3
WHERE id = 'p2-opp-staffelfelden-1'
  AND club_id = 'club-fftt-06680123'
  AND phase_id = 'phase-26-2'
  AND number = 1
  AND NOT EXISTS (
    SELECT 1 FROM teams t
    WHERE t.club_id = 'club-fftt-06680123' AND t.phase_id = 'phase-26-2' AND t.number = 3
  );
