-- 0071 — A season is every federation's; a phase is one federation's (#645).
--
-- 0065 gave each season a federation: the AGR's 2026/2027 was a season of its
-- own ("agr-27"), beside the FFTT's ("27"). It is the same season — the same
-- September to June, the same categories and licences —, and what differs is
-- the phases each federation plays in it, and when: the AGR's phase 2 may
-- start on another date than the FFTT's. So the federation moves to the
-- phase, and a season is shared.
--
-- No AGR season existed when this was written (0065 had reached no database
-- with one), but the move is written out anyway: each phase takes its
-- season's federation, a federation's season ("agr-27") is merged into the
-- shared one ("27"), and the column goes.
--
-- Phase ids do not change: the AGR's Phase 1 was "phase-agr-27-1" under season
-- "agr-27" and stays so under season "27" (`phaseIdFor`), so neither do team
-- ids (#282).
--
-- Dropping seasons.federation_id in this very migration is safe (#410): the
-- worker it replaces in production never read it — 0065 and 0071 go out in
-- the same deploy.

ALTER TABLE phases ADD COLUMN federation_id TEXT NOT NULL DEFAULT 'fftt';

UPDATE phases SET federation_id = COALESCE(
  (SELECT s.federation_id FROM seasons s WHERE s.id = phases.season_id), 'fftt');

-- A federation's own season becomes the shared one of the same number.
INSERT OR IGNORE INTO seasons (id, display_name, status)
  SELECT substr(id, length(federation_id) + 2), display_name, 'upcoming'
    FROM seasons WHERE federation_id != 'fftt';
UPDATE phases SET season_id = substr(season_id, length(federation_id) + 2)
 WHERE federation_id != 'fftt' AND season_id LIKE federation_id || '-%';
DELETE FROM seasons WHERE federation_id != 'fftt';

ALTER TABLE seasons DROP COLUMN federation_id;
