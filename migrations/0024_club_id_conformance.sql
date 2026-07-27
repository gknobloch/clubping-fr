-- #275 (3a): every club id follows `club-fftt-{affiliationNumber}` — the
-- format 0020 established and that games/import's clubIdFor already produces
-- for auto-created opponent clubs.
--
-- 0020 was supposed to have renamed every club that existed at the time, but a
-- production export taken for #275 shows it did not: 17 clubs are still on the
-- bare 8-digit id that 0018 gave them, and the three synthetic 99xxxxxx clubs
-- from #252 never moved either. Two rules therefore apply:
--
--   1. a non-conformant id with a usable affiliation number -> club-fftt-<number>
--   2. a non-conformant id that IS an 8-digit number, with no affiliation
--      number recorded -> club-fftt-<id>, which is exactly what 0020 intended
--      for the #252 synthetics (their number stays NULL: 99xxxxxx is a
--      placeholder this project made up, not an FFTT affiliation number).
--
-- The target still cannot always be invented: a club with neither a usable
-- number nor a numeric id is left on its current id and simply stays
-- reachable — that is what the /clubs/:clubId routing change in the same PR
-- is for.
--
-- The same export also shows ~10 clubs already on club-fftt-<number> but with
-- affiliation_number NULL — 0019 re-added that column without backfilling it
-- and 0020 copied the NULL forward. The number is sitting right there in the
-- id, so it is recovered at the end of this file; without it the FFTT sync on
-- the club page has nothing to query.
--
-- club_logos.club_id REFERENCES clubs(id) ON DELETE CASCADE with no
-- ON UPDATE CASCADE, so — exactly as 0018 and 0020 spell out — the rename
-- must insert the new row, repoint every dependent (logos included), then
-- delete the old row. A bare `UPDATE clubs SET id = ...` is rejected by D1's
-- FK enforcement in production (and, misleadingly, accepted locally).
--
-- Re-run safety: naturally idempotent — the remap table comes out empty once
-- every id conforms.

-- === Step 1: merge the clubs that exist twice ===
--
-- A club can be sitting under BOTH a legacy id and its club-fftt- twin, each
-- with its own real dependents — the production export for #275 has exactly
-- one such pair, "Bergheim CSS" as 06680128 (2 teams, 1 address) and
-- club-fftt-06680128 (1 team, 1 address). Renaming is impossible there (the
-- target id is taken), so the legacy row is merged into the club-fftt- one
-- first; the rename rules below then find nothing left to do for it.
--
-- Written generically rather than for that one pair, so a future duplicate is
-- absorbed the same way. It naturally matches nothing when there are none.
--
-- Deliberately non-destructive, unlike 0018's merge: every team is repointed,
-- none is deleted, and both sides' addresses are kept. Two rows that look like
-- the same team (same phase and number) or the same venue may therefore end up
-- under the merged club — visible in the UI and removable in two clicks,
-- whereas picking a winner here would silently drop a row this migration
-- cannot actually inspect. See the verification query in the PR.

DROP TABLE IF EXISTS club_merge;

CREATE TABLE club_merge (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

INSERT INTO club_merge (old_id, new_id)
SELECT id, 'club-fftt-' || affiliation_number
FROM clubs
WHERE id NOT GLOB 'club-fftt-*'
  AND affiliation_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND EXISTS (SELECT 1 FROM clubs t WHERE t.id = 'club-fftt-' || clubs.affiliation_number);

INSERT OR IGNORE INTO club_merge (old_id, new_id)
SELECT id, 'club-fftt-' || id
FROM clubs
WHERE id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND (affiliation_number IS NULL OR affiliation_number = '')
  AND EXISTS (SELECT 1 FROM clubs t WHERE t.id = 'club-fftt-' || clubs.id);

-- The surviving row is the one that kept the convention, but it is also the
-- one whose affiliation_number 0019/0020 left NULL — take it from the row
-- being merged away before that row disappears.
UPDATE clubs
SET affiliation_number = (
  SELECT o.affiliation_number FROM clubs o
  JOIN club_merge m ON m.old_id = o.id
  WHERE m.new_id = clubs.id AND o.affiliation_number IS NOT NULL AND o.affiliation_number != ''
)
WHERE (affiliation_number IS NULL OR affiliation_number = '')
  AND id IN (SELECT new_id FROM club_merge)
  AND EXISTS (
    SELECT 1 FROM clubs o JOIN club_merge m ON m.old_id = o.id
    WHERE m.new_id = clubs.id AND o.affiliation_number IS NOT NULL AND o.affiliation_number != ''
  );

UPDATE club_addresses
SET club_id = (SELECT new_id FROM club_merge WHERE old_id = club_addresses.club_id)
WHERE club_id IN (SELECT old_id FROM club_merge);

UPDATE club_channels
SET club_id = (SELECT new_id FROM club_merge WHERE old_id = club_channels.club_id)
WHERE club_id IN (SELECT old_id FROM club_merge);

UPDATE teams
SET club_id = (SELECT new_id FROM club_merge WHERE old_id = teams.club_id)
WHERE club_id IN (SELECT old_id FROM club_merge);

UPDATE users
SET club_id = (SELECT new_id FROM club_merge WHERE old_id = users.club_id)
WHERE club_id IN (SELECT old_id FROM club_merge);

-- club_logos.club_id is the primary key, so a logo can only move onto a
-- surviving club that has none. Any leftover goes away with its club row
-- below (REFERENCES clubs(id) ON DELETE CASCADE) — a duplicate logo of the
-- same club, nothing else.
UPDATE club_logos
SET club_id = (SELECT new_id FROM club_merge WHERE old_id = club_logos.club_id)
WHERE club_id IN (SELECT old_id FROM club_merge)
  AND NOT EXISTS (
    SELECT 1 FROM club_logos e
    WHERE e.club_id = (SELECT new_id FROM club_merge WHERE old_id = club_logos.club_id)
  );

DELETE FROM clubs WHERE id IN (SELECT old_id FROM club_merge);

DROP TABLE club_merge;

-- === Step 2: rename what is simply on the wrong id ===

DROP TABLE IF EXISTS club_id_remap;

CREATE TABLE club_id_remap (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

-- Rule 1: the affiliation number is the source of truth when it is usable.
INSERT INTO club_id_remap (old_id, new_id)
SELECT id, 'club-fftt-' || affiliation_number
FROM clubs
WHERE id NOT GLOB 'club-fftt-*'
  AND affiliation_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND NOT EXISTS (
    SELECT 1 FROM clubs t WHERE t.id = 'club-fftt-' || clubs.affiliation_number
  );

-- Rule 2: no number recorded, but the id is already the number (0018-era rows
-- and the #252 synthetics). OR IGNORE because rule 1 owns any row it matched.
INSERT OR IGNORE INTO club_id_remap (old_id, new_id)
SELECT id, 'club-fftt-' || id
FROM clubs
WHERE id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND (affiliation_number IS NULL OR affiliation_number = '')
  AND NOT EXISTS (
    SELECT 1 FROM clubs t WHERE t.id = 'club-fftt-' || clubs.id
  );

INSERT INTO clubs (id, affiliation_number, display_name, is_archived)
SELECT r.new_id, c.affiliation_number, c.display_name, c.is_archived
FROM clubs c
JOIN club_id_remap r ON r.old_id = c.id;

UPDATE club_addresses
SET club_id = (SELECT new_id FROM club_id_remap WHERE old_id = club_addresses.club_id)
WHERE club_id IN (SELECT old_id FROM club_id_remap);

UPDATE club_channels
SET club_id = (SELECT new_id FROM club_id_remap WHERE old_id = club_channels.club_id)
WHERE club_id IN (SELECT old_id FROM club_id_remap);

UPDATE club_logos
SET club_id = (SELECT new_id FROM club_id_remap WHERE old_id = club_logos.club_id)
WHERE club_id IN (SELECT old_id FROM club_id_remap);

UPDATE teams
SET club_id = (SELECT new_id FROM club_id_remap WHERE old_id = teams.club_id)
WHERE club_id IN (SELECT old_id FROM club_id_remap);

UPDATE users
SET club_id = (SELECT new_id FROM club_id_remap WHERE old_id = users.club_id)
WHERE club_id IN (SELECT old_id FROM club_id_remap);

-- fftt_club_teams_cache.club_id is a plain cache key with no join back to
-- clubs; a stale entry self-heals on the next fetch. Left untouched, same as
-- in 0020.

DELETE FROM clubs WHERE id IN (SELECT old_id FROM club_id_remap);

DROP TABLE club_id_remap;

-- Recover the affiliation number 0019/0020 left NULL, from the id itself
-- ('club-fftt-' is 10 characters, so the number starts at 11). The 99xxxxxx
-- synthetics are excluded on purpose: they are placeholders invented by #252,
-- and writing one into affiliation_number would make the club look like it has
-- a real FFTT number — the FFTT sync would then query a club that cannot exist.
UPDATE clubs
SET affiliation_number = substr(id, 11)
WHERE (affiliation_number IS NULL OR affiliation_number = '')
  AND id GLOB 'club-fftt-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND substr(id, 11) NOT GLOB '99[0-9][0-9][0-9][0-9][0-9][0-9]';
