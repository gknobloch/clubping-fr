-- 0072 — A division's phase is its competition's federation's (#645).
--
-- A division is in one phase and one competition, and both belong to one
-- federation. Nothing held that until now: an AGR championship's divisions
-- could be created in the FFTT's phase (the form offered every competition),
-- where no AGR page lists them. The form and the API refuse it from now on;
-- this moves the ones already filed there to their federation's phase of the
-- same season and name — the AGR's Phase 1 of 2026/2027 for an AGR division
-- left in the FFTT's.
--
-- Only a division nothing hangs from yet: a poule's teams carry their phase
-- in their ids (#282), so one with poules stays where it is and is set right
-- by hand. A division with no such phase to go to stays too.

UPDATE divisions SET phase_id = (
  SELECT target.id
    FROM phases here
    JOIN competitions c ON c.id = divisions.competition_id
    JOIN phases target ON target.season_id = here.season_id AND target.name = here.name
     AND COALESCE(target.federation_id, 'fftt') = COALESCE(c.federation_id, 'fftt')
   WHERE here.id = divisions.phase_id
)
 WHERE competition_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.division_id = divisions.id)
   AND EXISTS (
     SELECT 1
       FROM phases here
       JOIN competitions c ON c.id = divisions.competition_id
       JOIN phases target ON target.season_id = here.season_id AND target.name = here.name
        AND COALESCE(target.federation_id, 'fftt') = COALESCE(c.federation_id, 'fftt')
      WHERE here.id = divisions.phase_id
        AND COALESCE(here.federation_id, 'fftt') != COALESCE(c.federation_id, 'fftt')
   );
