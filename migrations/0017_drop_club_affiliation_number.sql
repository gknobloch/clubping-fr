-- Collapses clubs.affiliation_number into clubs.id entirely: after #247's
-- migration 0016, every club with a known FFTT number already has id =
-- affiliation_number, so the column is pure duplication for them. The only
-- remaining reason to keep it was clubs with NO known number — this
-- migration gives those a synthetic placeholder id instead (99 followed by
-- 6 digits: a shape no real FFTT affiliation number can have, so it reads
-- consistently alongside real ones and is visibly distinguishable as "not
-- FFTT-sourced"), then drops the column.
--
-- Re-run safety: this can only ever run its course ONCE per environment.
-- The very first statement references `affiliation_number` — once it's
-- dropped by the last statement below, every future deploy's attempt to
-- re-run this file fails immediately on that first statement and aborts
-- before reaching anything already done (same pattern as #105's
-- users/players merge in 0007). Numbering restarting from 99000001 on a
-- hypothetical second successful run is therefore not a real concern: there
-- is no such second run once the column is gone.
--
-- Child tables are repointed to the new synthetic id BEFORE clubs.id itself
-- changes (the rename would otherwise erase the old id these lookups join
-- on) — same ordering as 0016.

-- #275: re-run guard. This file's original guard was incidental and has since
-- been invalidated — see 0027 for the full story. The marker below is now the
-- only thing standing between a redeploy and this migration renaming every
-- club id again. Plain INSERT on purpose: it fails once the marker exists, and
-- wrangler runs each migration file in a single transaction, so the whole file
-- rolls back without touching anything.
CREATE TABLE IF NOT EXISTS schema_guards (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_guards (name) VALUES ('0017_drop_club_affiliation_number');

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE club_addresses
SET club_id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = club_addresses.club_id)
WHERE club_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE club_channels
SET club_id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = club_channels.club_id)
WHERE club_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE club_logos
SET club_id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = club_logos.club_id)
WHERE club_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE teams
SET club_id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = teams.club_id)
WHERE club_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE users
SET club_id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = users.club_id)
WHERE club_id IN (SELECT id FROM orphans);

WITH orphans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM clubs
  WHERE affiliation_number IS NULL OR affiliation_number = ''
)
UPDATE clubs
SET id = (SELECT printf('99%06d', rn) FROM orphans WHERE orphans.id = clubs.id)
WHERE id IN (SELECT id FROM orphans);

ALTER TABLE clubs DROP COLUMN affiliation_number;
