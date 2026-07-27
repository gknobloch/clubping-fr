-- #275: permanently disarm 0016 and 0017 on databases where they already ran.
--
-- THIS IS THE MIGRATION THAT MAKES 0024 SAFE. Without it, the very cleanup
-- 0024 performs re-enables two migrations that rewrite every club id.
--
-- What was found, by replaying a real production export twice:
--
--   0017 gives every club with no affiliation_number a synthetic id, numbered
--   sequentially with ROW_NUMBER() OVER (ORDER BY id): 99000001, 99000002, …
--   Its documented re-run guard is "the first statement references
--   affiliation_number, and the last statement drops that column, so a second
--   run fails immediately". That guard died when 0019 re-added the column.
--   Since then the only thing stopping 0017 is that it happens to fail on a
--   UNIQUE constraint — caused by exactly the duplicate club ids that 0024
--   cleans up. Clean those, and the next deploy renumbers EVERY
--   NULL-affiliation club from scratch: ids shift under rows that never moved,
--   and 0018's hardcoded synthetic-id merge list then acts on whatever now
--   sits at those ids. Replaying production this way silently deleted a club
--   (Saint-Dié, whose row had shifted onto an id 0018 believed to be a
--   different club's duplicate).
--
--   0016 renames clubs.id to affiliation_number. It is currently held back
--   only by a FOREIGN KEY failure from club_logos — production happens to
--   have exactly one logo. Delete that logo and 0016 starts succeeding,
--   renaming every `club-fftt-…` id back to a bare number and undoing 0020
--   and 0024 in one pass.
--
-- Neither file is idempotent in the way its comments claim, and neither should
-- ever run again on a database that has already been through it. Both now
-- start by inserting a marker into schema_guards (a plain INSERT, so it fails
-- on any re-run and — wrangler running each file as one transaction — rolls
-- the whole file back before it touches a single row).
--
-- On a fresh database those markers are written by 0016/0017 themselves. On a
-- database where they ran long ago the markers are missing, and worse, each
-- file currently fails partway, so its own marker INSERT is rolled back with
-- everything else and never persists. This migration writes them directly.
--
-- OR IGNORE: on a fresh database 0016/0017 have already inserted their markers
-- earlier in this same deploy, and this is a no-op.
--
-- Re-run safety: every statement is idempotent.

CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_guards (name) VALUES
  ('0016_club_id_is_affiliation_number'),
  ('0017_drop_club_affiliation_number');

-- 0018 is deliberately NOT guarded. Its statements are hardcoded id lists and
-- genuinely idempotent; it only became destructive above because 0017 fed it
-- rows that had been renumbered onto ids belonging to other clubs. With 0017
-- disarmed no new synthetic ids are ever minted, and 0024 leaves no bare
-- 99xxxxxx id for 0018's lists to match.
