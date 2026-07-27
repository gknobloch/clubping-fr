-- Two purely cosmetic follow-ups to #256, no behavior change (clubs.id stays
-- fully opaque to the app; only its text and the clubs table's column order
-- change):
--
-- 1. Every club's id becomes club-fftt-<its current digit id>, matching the
--    format already used for auto-created opponent clubs (games/import's
--    clubIdFor) and now mock/data.ts + seed.sql. This includes both the 28
--    clubs collapsed onto their real FFTT number by #253/#254 and the 5 on a
--    synthetic 99xxxxxx id (#252) — every current club.id is a bare digit
--    string, so the same rename applies uniformly to all of them.
--
--    Same FK-safe order as 0018: insert the renamed row first, repoint every
--    dependent table, then delete the old row — never a bare
--    `UPDATE clubs SET id = ...`.
--
-- 2. clubs.affiliation_number moves back to being the second column (id,
--    affiliation_number, display_name, is_archived), matching 0001's
--    original layout, before 0019's `ALTER TABLE ADD COLUMN` re-added it at
--    the end (SQLite can only append new columns, never insert them
--    positionally). SQLite has no ALTER-based column reorder, so this
--    rebuilds the table.
--
--    IMPORTANT, hard-won the expensive way (locally, before this ever touched
--    production — see the local D1 testing that caught it): `DROP TABLE
--    clubs` — even after every dependent row has been repointed away from
--    it — cascades and deletes club_logos anyway, because club_logos.club_id
--    REFERENCES clubs(id) ON DELETE CASCADE and SQLite treats dropping the
--    parent as deleting all of its rows for cascade purposes. A plain
--    create-copy-drop-rename rebuild of `clubs` would have silently wiped
--    every club logo in production. The sequence below avoids this by never
--    dropping the CURRENT `clubs` table while anything still holds a live FK
--    to it: rename clubs out of the way first (a rename, not a delete, so
--    nothing cascades, and SQLite automatically rewrites club_logos'
--    REFERENCES clause to follow the rename), build the new `clubs`, rebuild
--    club_logos to point its FK at the new `clubs`, and only then drop the
--    renamed-away old table (by then nothing references it, so nothing
--    cascades).
--
-- Re-run safety: the id-rename statements naturally no-op on a re-run (zero
-- rows still match the bare-digit GLOB once renamed). The rebuild is guarded
-- by the schema_guards marker inserted below: the plain INSERT fails on any
-- redeploy after the first successful run, aborting the whole file cleanly
-- before touching anything — the same fail-fast contract as 0007/0016/0017/
-- 0019, just via a marker row instead of a dropped column.
--
-- #275: that guard used to be implicit — this migration deliberately never
-- dropped its own backup copy (clubs_pre_0020_backup), and the very first
-- rebuild statement failed on a re-run because the rename target already
-- existed. The explicit marker replaces it so 0025 can drop the leftover
-- table without making this file re-runnable and destructive.

-- Re-run guard (see above): must be the first statement, so a redeploy stops
-- here instead of reaching the destructive rebuild further down.
CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_guards (name) VALUES ('0020_club_fftt_ids_and_column_order');

INSERT INTO clubs (id, display_name, is_archived, affiliation_number)
SELECT 'club-fftt-' || id, display_name, is_archived, affiliation_number
FROM clubs
WHERE id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE teams SET club_id = 'club-fftt-' || club_id
WHERE club_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE users SET club_id = 'club-fftt-' || club_id
WHERE club_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE club_addresses SET club_id = 'club-fftt-' || club_id
WHERE club_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE club_channels SET club_id = 'club-fftt-' || club_id
WHERE club_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

UPDATE club_logos SET club_id = 'club-fftt-' || club_id
WHERE club_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

DELETE FROM clubs WHERE id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

-- fftt_club_teams_cache.club_id is a plain cache key with no foreign key and
-- no join back to clubs — a stale entry under the old id is simply dead
-- weight that self-heals on the next fetch, same reasoning as #251/#252's
-- club_logos discussion. Left untouched.

-- Rename clubs out of the way (not a delete, so club_logos' 33 rows survive;
-- this is also the permanent guard: fails on any future re-run, aborting the
-- whole file before it touches anything).
ALTER TABLE clubs RENAME TO clubs_pre_0020_backup;

CREATE TABLE clubs (
  id TEXT PRIMARY KEY,
  affiliation_number TEXT,
  display_name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0
);

INSERT INTO clubs (id, affiliation_number, display_name, is_archived)
SELECT id, affiliation_number, display_name, is_archived FROM clubs_pre_0020_backup;

-- club_logos' FK was auto-rewritten by SQLite to reference
-- clubs_pre_0020_backup when clubs got renamed above, so it must be rebuilt
-- to point at the new `clubs` table before that backup can ever be removed.
CREATE TABLE club_logos_new (
  club_id      TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  data         TEXT NOT NULL,
  content_type TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
INSERT INTO club_logos_new SELECT * FROM club_logos;
DROP TABLE club_logos;
ALTER TABLE club_logos_new RENAME TO club_logos;

-- clubs_pre_0020_backup is dropped by 0025 (#275); the re-run guard is now the
-- schema_guards marker at the top of this file, not this table's existence.
