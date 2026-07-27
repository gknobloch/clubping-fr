-- #275 (3c): drop clubs_pre_0020_backup.
--
-- The table was kept on purpose by 0020, not as a backup anyone reads but as
-- that migration's re-run guard: its existence made 0020's first rebuild
-- statement (`ALTER TABLE clubs RENAME TO clubs_pre_0020_backup`) fail on a
-- redeploy, aborting the file before it could rebuild `clubs` a second time.
-- Dropping it without replacing that guard would make 0020 destructive again
-- on the next deploy, so 0020 now starts by inserting an explicit marker into
-- schema_guards and this migration only removes the leftover table.
--
-- INSERT OR IGNORE, not a plain INSERT: on a database where 0020 already ran
-- before it grew the marker (i.e. production), the row does not exist yet and
-- must be created here; on a fresh database 0020 has just inserted it in the
-- same deploy and this is a no-op. 0020's own INSERT stays a plain, failing
-- one — that is the whole point of the guard.
--
-- Re-run safety: both statements are idempotent.

CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_guards (name) VALUES ('0020_club_fftt_ids_and_column_order');

DROP TABLE IF EXISTS clubs_pre_0020_backup;
