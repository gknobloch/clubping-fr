-- #275 (2): bring every division onto its real FFTT identity — the FFTT
-- numeric id, the FFTT identifier ("GE3P1"), the FFTT parent chain, and a
-- display name without the redundant phase suffix.
--
-- The divisions import (functions/api/[[path]].ts, importDivisions) has done
-- all of this for new rows since #219/#236, but divisions created before it
-- — everything in season 2025/2026, plus anything created by hand on
-- /divisions — kept local ids, have parent_id NULL (0014 skipped the
-- backfill on purpose) and never stored an identifier at all.
--
-- The id/identifier/parent mapping below is hardcoded from the FFTT
-- `divisions` GraphQL query, captured per phase:
--   contest 15954, organization 14, phase 1  -> 2025/2026 Phase 1
--   contest 15954, organization 14, phase 2  -> 2025/2026 Phase 2
--   contest 18368, organization 14, phase 1  -> 2026/2027 Phase 1
-- Deliberately hardcoded rather than re-fetched: a migration must be
-- deterministic and must not depend on a third-party API being reachable.
--
-- Runs after 0022, so phase ids are already `phase-{season}-{phase}`.
--
-- Existing rows are matched by (phase_id, normalized display name) — see
-- division_norm below — because their ids carry no usable information.
--
-- Re-run safety: the ALTER on the first line fails once the column exists,
-- aborting the whole file before anything else runs — the same fail-fast
-- contract as 0007/0016/0017/0020. Everything after it is idempotent anyway
-- (the remap tables come out empty once every id already matches).

ALTER TABLE divisions ADD COLUMN identifier TEXT;

DROP TABLE IF EXISTS division_remap;
DROP TABLE IF EXISTS division_norm;
DROP TABLE IF EXISTS division_id_remap;

CREATE TABLE division_remap (
  phase_id   TEXT NOT NULL,
  norm_key   TEXT NOT NULL,
  new_id     TEXT NOT NULL,
  identifier TEXT NOT NULL,
  new_name   TEXT NOT NULL,
  parent_id  TEXT,
  PRIMARY KEY (phase_id, norm_key)
);

INSERT INTO division_remap (phase_id, norm_key, new_id, identifier, new_name, parent_id) VALUES
  -- 2025/2026 Phase 1 (contest 15954)
  ('phase-26-1', 'GEELITE', '198428', 'GEEP1', 'GE Elite', NULL),
  ('phase-26-1', 'GE1',     '198609', 'GE1P1', 'GE 1',     '198428'),
  ('phase-26-1', 'GE2',     '198755', 'GE2P1', 'GE 2',     '198609'),
  ('phase-26-1', 'GE3',     '198305', 'GE3P1', 'GE 3',     '198755'),
  ('phase-26-1', 'GE4',     '198821', 'GE4P1', 'GE 4',     '198305'),
  ('phase-26-1', 'GE5',     '198895', 'GE5P1', 'GE 5',     '198821'),
  ('phase-26-1', 'GE6',     '198435', 'GE6P1', 'GE 6',     '198895'),
  -- GE 7 is a genuine orphan in FFTT's data for this phase: no parent.
  ('phase-26-1', 'GE7',     '198907', 'GE7P1', 'GE 7',     NULL),

  -- 2025/2026 Phase 2 (contest 15954)
  ('phase-26-2', 'GEELITE', '198826', 'GEEP2', 'GE Elite', NULL),
  ('phase-26-2', 'GE1',     '198360', 'GE1P2', 'GE 1',     '198826'),
  ('phase-26-2', 'GE2',     '198361', 'GE2P2', 'GE 2',     '198360'),
  ('phase-26-2', 'GE3',     '198756', 'GE3P2', 'GE 3',     '198361'),
  ('phase-26-2', 'GE4',     '198757', 'GE4P2', 'GE 4',     '198756'),
  ('phase-26-2', 'GE5',     '198823', 'GE5P2', 'GE 5',     '198757'),
  ('phase-26-2', 'GE6',     '198825', 'GE6P2', 'GE 6',     '198823'),
  ('phase-26-2', 'GE7',     '198896', 'GE7P2', 'GE 7',     '198825'),

  -- 2026/2027 Phase 1 (contest 18368) — already imported on these ids, so
  -- the id remap is a no-op here; the identifier and display name are not.
  ('phase-27-1', 'GEELITE', '234142', 'GEEP1', 'GE Elite', NULL),
  ('phase-27-1', 'GE1',     '234322', 'GE1P1', 'GE 1',     '234142'),
  ('phase-27-1', 'GE2',     '234461', 'GE2P1', 'GE 2',     '234322'),
  ('phase-27-1', 'GE3',     '234020', 'GE3P1', 'GE 3',     '234461'),
  ('phase-27-1', 'GE4',     '234527', 'GE4P1', 'GE 4',     '234020'),
  ('phase-27-1', 'GE5',     '234600', 'GE5P1', 'GE 5',     '234527'),
  ('phase-27-1', 'GE6',     '234149', 'GE6P1', 'GE 6',     '234600'),
  ('phase-27-1', 'GE7',     '234612', 'GE7P1', 'GE 7',     NULL);

-- Normalized display name, so the same division matches whatever spelling it
-- was created with: FFTT's own "GE 3 Phase 1", the short "GE1" used by the
-- seed and by hand-created rows, or "GE Elite P1". Spaces and hyphens are
-- dropped, the result upper-cased, and a trailing phase marker ("PHASE1" or
-- "P1") removed — the phase is already the row's phase_id.
CREATE TABLE division_norm AS
SELECT
  id,
  phase_id,
  CASE
    WHEN upper(replace(replace(display_name, ' ', ''), '-', '')) GLOB '*PHASE[1-9]'
      THEN substr(
             upper(replace(replace(display_name, ' ', ''), '-', '')), 1,
             length(upper(replace(replace(display_name, ' ', ''), '-', ''))) - 6)
    WHEN upper(replace(replace(display_name, ' ', ''), '-', '')) GLOB '*P[1-9]'
      THEN substr(
             upper(replace(replace(display_name, ' ', ''), '-', '')), 1,
             length(upper(replace(replace(display_name, ' ', ''), '-', ''))) - 2)
    ELSE upper(replace(replace(display_name, ' ', ''), '-', ''))
  END AS norm_key
FROM divisions;

-- Flat old id -> new id list, snapshotted before any row is touched.
CREATE TABLE division_id_remap AS
SELECT n.id AS old_id, m.new_id AS new_id
FROM division_norm n
JOIN division_remap m ON m.phase_id = n.phase_id AND m.norm_key = n.norm_key
WHERE n.id <> m.new_id;

-- Insert the renamed row first, repoint every dependent, then delete the old
-- row — same order as 0018/0020/0022. parent_id is set at the end, once every
-- row is on its final id.
INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier)
SELECT r.new_id, d.phase_id, m.new_name, d.rank, d.players_per_game, d.is_archived, NULL, m.identifier
FROM divisions d
JOIN division_id_remap r ON r.old_id = d.id
JOIN division_remap m ON m.new_id = r.new_id
WHERE NOT EXISTS (SELECT 1 FROM divisions t WHERE t.id = r.new_id);

UPDATE teams
SET division_id = (SELECT new_id FROM division_id_remap WHERE old_id = teams.division_id)
WHERE division_id IN (SELECT old_id FROM division_id_remap);

UPDATE groups_tbl
SET division_id = (SELECT new_id FROM division_id_remap WHERE old_id = groups_tbl.division_id)
WHERE division_id IN (SELECT old_id FROM division_id_remap);

-- Divisions outside the mapping that pointed at a remapped parent.
UPDATE divisions
SET parent_id = (SELECT new_id FROM division_id_remap WHERE old_id = divisions.parent_id)
WHERE parent_id IN (SELECT old_id FROM division_id_remap);

DELETE FROM divisions WHERE id IN (SELECT old_id FROM division_id_remap);

-- Display name and identifier for every mapped division, including the
-- 2026/2027 rows that were already on the right id and so were never
-- re-inserted above.
UPDATE divisions
SET display_name = (SELECT new_name FROM division_remap WHERE new_id = divisions.id),
    identifier   = (SELECT identifier FROM division_remap WHERE new_id = divisions.id)
WHERE id IN (SELECT new_id FROM division_remap);

-- Parent chain, straight from FFTT (0014 left this NULL for every existing
-- row). A parent that is not present locally — e.g. only part of a phase was
-- ever created — leaves the division parentless rather than dangling.
UPDATE divisions
SET parent_id = (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM divisions p WHERE p.id = m.parent_id) THEN m.parent_id END
  FROM division_remap m WHERE m.new_id = divisions.id
)
WHERE id IN (SELECT new_id FROM division_remap);

DROP TABLE division_id_remap;
DROP TABLE division_norm;
DROP TABLE division_remap;
