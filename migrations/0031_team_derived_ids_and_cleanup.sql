-- #282, step 2 of 4: teams get a derived local id, an FFTT id of their own,
-- and lose two columns that had rotted.
--
-- After this:
--   teams.id       team-<club>-<phase>-<number>, e.g. team-06680011-27-1-3
--   teams.team_id  the FFTT team id, NULL unless the team came from FFTT
--   division_id    gone — derivable via group_id -> groups.division_id
--   game_location_id  cleared where it pointed at nothing
--
-- The id is derived AT CREATION and never recomputed. `number` and `phase_id`
-- are editable, so an id can stop matching its own columns; that is the
-- deliberate trade. Recomputing would mean renaming a primary key referenced
-- by games, game_selections and the groups.team_ids JSON array — the operation
-- that broke production twice (0016-0020). What determinism buys is idempotent
-- imports: the FFTT path and the PDF path derive the same id for the same
-- team, so a re-import matches instead of duplicating. That is exactly the bug
-- 0030 had to clean up.
--
-- The prefix stripping below is substr-based, not replace-based, so it removes
-- only a LEADING prefix and matches teamIdFor() in src/lib/entityIds.ts
-- character for character. Keep the two in step.
--
-- Requires 0030: (club_id, phase_id, number) must already be unique, or two
-- teams would derive the same id and collapse into one.
--
-- === division_id ===
-- Dropped, not fixed. It duplicates what the group already knows and had
-- drifted on 24 of 148 rows in production: 16 pointed at div-4/div-5, deleted
-- back in 0023, and 8 claimed GE 6 while their group sat in GE 7.
--
-- === game_location_id ===
-- Cleared where it references an address that no longer exists — which in
-- production was every single non-empty value (80 of them). The club addresses
-- were recreated with fresh ids at some point, orphaning every reference.
-- getVenue() already falls back to the club's default address, so nothing
-- changes on screen; the column simply stops lying. Values that DO resolve are
-- left alone, so a per-team venue set later survives a re-run.
--
-- Re-run safety: the ALTER on the first line fails once the column exists,
-- rolling the whole file back — same contract as 0007/0016/0017/0020/0023/0029.

ALTER TABLE teams ADD COLUMN team_id TEXT;

DROP TABLE IF EXISTS team_id_remap;

CREATE TABLE team_id_remap AS
SELECT
  id AS old_id,
  'team-'
    || (CASE WHEN club_id LIKE 'club-fftt-%' THEN substr(club_id, 11) ELSE club_id END)
    || '-'
    || (CASE WHEN phase_id LIKE 'phase-%' THEN substr(phase_id, 7) ELSE phase_id END)
    || '-' || number AS new_id,
  -- An all-digits id is an FFTT team id; doc-*, opp-*, p2-* and team-N are local.
  CASE WHEN id GLOB '[0-9]*' AND id NOT GLOB '*[^0-9]*' THEN id END AS fftt_team_id
FROM teams;

UPDATE games
SET home_team_id = (SELECT new_id FROM team_id_remap WHERE old_id = games.home_team_id)
WHERE home_team_id IN (SELECT old_id FROM team_id_remap);

UPDATE games
SET away_team_id = (SELECT new_id FROM team_id_remap WHERE old_id = games.away_team_id)
WHERE away_team_id IN (SELECT old_id FROM team_id_remap);

UPDATE game_selections
SET team_id = (SELECT new_id FROM team_id_remap WHERE old_id = game_selections.team_id)
WHERE team_id IN (SELECT old_id FROM team_id_remap);

UPDATE "groups"
SET team_ids = (
  SELECT json_group_array(v) FROM (
    SELECT coalesce((SELECT new_id FROM team_id_remap WHERE old_id = j.value), j.value) AS v
    FROM json_each("groups".team_ids) j
  )
)
WHERE EXISTS (
  SELECT 1 FROM json_each("groups".team_ids) j
  JOIN team_id_remap r ON r.old_id = j.value
);

INSERT INTO teams (
  id, club_id, phase_id, number, division_id, group_id, game_location_id,
  default_day, default_time, captain_id, player_ids, roster_initial_points,
  color, whatsapp_link, is_archived, team_id
)
SELECT
  r.new_id, t.club_id, t.phase_id, t.number, t.division_id, t.group_id,
  -- Keep a location only when it still resolves to a real address.
  CASE WHEN EXISTS (SELECT 1 FROM club_addresses a WHERE a.id = t.game_location_id)
       THEN t.game_location_id ELSE '' END,
  t.default_day, t.default_time, t.captain_id, t.player_ids, t.roster_initial_points,
  t.color, t.whatsapp_link, t.is_archived, r.fftt_team_id
FROM teams t
JOIN team_id_remap r ON r.old_id = t.id;

DELETE FROM teams WHERE id IN (SELECT old_id FROM team_id_remap);

DROP TABLE team_id_remap;

ALTER TABLE teams DROP COLUMN division_id;
