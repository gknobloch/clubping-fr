-- #275 (1): every phase id follows `phase-{seasonId}-{ffttPhaseId}`, the
-- format `localPhaseId()` (src/lib/ffttPhases.ts) already produces and the
-- divisions import already uses when it auto-creates a phase. Phases that
-- predate that convention kept ids like `phase-1` / `phase-2`, which say
-- nothing about their season — production had `phase-1` and `phase-2` (both
-- season 26) sitting next to a conformant `phase-27-1`.
--
-- The target id is derived from the row itself (season_id + the digit in
-- `name`), not hardcoded, so any other straggler is covered too.
--
-- Nothing has a real foreign key to phases (only club_logos and
-- player_avatars carry REFERENCES clauses anywhere in this schema), so the
-- cascade hazard documented in 0020 does not apply here. The rename still
-- follows the same safe order used by 0018/0020 — insert the renamed row,
-- repoint every dependent, delete the old row — rather than a bare
-- `UPDATE phases SET id = ...`, both for consistency and so an interrupted
-- run never leaves dependents pointing at a phase that no longer exists.
--
-- Re-run safety: naturally idempotent. On a second run the remap table comes
-- out empty (every id already equals its derived target), so every statement
-- below matches zero rows.

DROP TABLE IF EXISTS phase_id_remap;

CREATE TABLE phase_id_remap (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

-- `name` is written by the app as "Phase 1".."Phase 3" (FFTT_PHASES), so the
-- FFTT phase id is its trailing digit. Rows with any other name shape are
-- left alone — there is nothing to derive an id from.
INSERT INTO phase_id_remap (old_id, new_id)
SELECT id, 'phase-' || season_id || '-' || substr(name, 7)
FROM phases
WHERE name GLOB 'Phase [1-9]'
  AND id <> 'phase-' || season_id || '-' || substr(name, 7)
  -- Never collide with a phase that already holds the target id.
  AND NOT EXISTS (
    SELECT 1 FROM phases t WHERE t.id = 'phase-' || phases.season_id || '-' || substr(phases.name, 7)
  );

INSERT INTO phases (id, season_id, name, display_name, status)
SELECT r.new_id, p.season_id, p.name, p.display_name, p.status
FROM phases p
JOIN phase_id_remap r ON r.old_id = p.id;

UPDATE divisions
SET phase_id = (SELECT new_id FROM phase_id_remap WHERE old_id = divisions.phase_id)
WHERE phase_id IN (SELECT old_id FROM phase_id_remap);

UPDATE teams
SET phase_id = (SELECT new_id FROM phase_id_remap WHERE old_id = teams.phase_id)
WHERE phase_id IN (SELECT old_id FROM phase_id_remap);

DELETE FROM phases WHERE id IN (SELECT old_id FROM phase_id_remap);

DROP TABLE phase_id_remap;
