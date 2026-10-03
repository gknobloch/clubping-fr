-- 0059 — step 2 of #604: drop what the group rule replaced.
--
--   club_competition_eligibility        (the per-licensee amendments of #482)
--   competitions.is_category_locked     (the lock, which only existed to stop
--                                        a club widening a competition)
--
-- 0056 stopped every read and write of both, and stayed additive so the
-- previous worker — still serving requests between the migration and the swap
-- — never lost them (#410). That release is deployed (ccb1701, 27/09/2026), so
-- nothing running names either any more.
--
-- The amendments are not carried over. Production held 20 rows, all
-- `excluded`, all from one club (Rixheim PPA) on one competition, and none
-- `included` — the one case a group could not express. That club has since
-- reserved the championship to a group, which now says what the rows said.
--
-- The compatibility rows `GET /api/data` sends app ≤ 1.5 do not come from this
-- table: they are derived from the groups (`legacyCompetitionExclusions`), and
-- go in step 3.
--
-- ATTENTION — `DROP COLUMN`, never the rebuild of 0038/0054.
-- `club_competition_groups.competition_id` REFERENCES competitions(id)
-- ON DELETE CASCADE, and D1 enforces foreign keys: dropping `competitions` to
-- rename a copy into its place would delete every club's group link — the
-- restriction this whole change exists to hold — without a word. The column
-- carries no index and no constraint beyond its default, so SQLite can drop it
-- in place, as 0017, 0031 and 0050 did.
--
-- Its index (`club_competition_eligibility_by_competition`) goes with the
-- table.

DROP TABLE IF EXISTS club_competition_eligibility;

ALTER TABLE competitions DROP COLUMN is_category_locked;
