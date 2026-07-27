-- #275 (4): groups_tbl -> groups.
--
-- The `_tbl` suffix dates from 0001 and the assumption that `GROUPS` — a
-- SQLite keyword since window functions introduced the GROUPS frame type —
-- could not be used as a table name. It can: SQLite parses it as an
-- identifier in CREATE/SELECT/INSERT/UPDATE/DELETE without quoting, verified
-- against the same SQLite that backs D1. The workaround was never needed.
--
-- Not a plain `ALTER TABLE groups_tbl RENAME TO groups`, even though that is
-- all a first run needs. Deploys re-run every migration, and 0001's
-- `CREATE TABLE IF NOT EXISTS groups_tbl` faithfully recreates an empty
-- groups_tbl on every redeploy once this one has renamed the real table away
-- — so the rename would fail from the second deploy onward ("there is
-- already another table or index with this name: groups"), leaving a stray
-- empty groups_tbl behind for good.
--
-- 0001 cannot simply be changed to create `groups` instead: it runs first, so
-- on a database that still holds its data in groups_tbl it would create an
-- empty `groups` before this file ever runs, and the app would read the empty
-- one. Hence create-copy-drop, which is correct in every state:
--   - first run:  `groups` is created, every row is copied over, groups_tbl
--                 is dropped;
--   - redeploy:   `groups` already exists and keeps its rows, the groups_tbl
--                 0001 just recreated is empty so nothing is copied, and the
--                 stray table is dropped again — silently, no error output.
--
-- Nothing has a foreign key to this table (only club_logos and player_avatars
-- carry REFERENCES clauses anywhere in this schema), so nothing cascades.

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  team_ids TEXT NOT NULL DEFAULT '[]',
  is_archived INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO groups (id, division_id, number, team_ids, is_archived)
SELECT id, division_id, number, team_ids, is_archived FROM groups_tbl;

DROP TABLE IF EXISTS groups_tbl;
