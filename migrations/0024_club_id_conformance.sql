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

-- === A collision is NOT a duplicate: never merge ===
--
-- An earlier draft of this migration merged a legacy-id club into its
-- club-fftt- twin whenever both existed. Running it against a real production
-- export showed that would have been data loss. The two colliding pairs are
-- not the same club twice — they are two DIFFERENT clubs sharing one
-- affiliation number:
--
--   06680123            "Ensisheim TTMC"  team p2-opp-staffelfelden-1, address Staffelfelden
--   club-fftt-06680123  "Ensisheim TTMC"  Ensisheim teams,             address Ensisheim
--   06680128            "Bergheim CSS"    team p2-opp-eloyes-1,        address Eloyes
--   club-fftt-06680128  "Bergheim CSS"    team p2-opp-bergheim-2,      address Bergheim
--
-- So one row in each pair carries someone else's club under the wrong name
-- and number — the p2-opp-* ids point at the phase-2 schedule-document
-- import, which reads affiliation numbers off a PDF via OCR (see
-- ffttScheduleDocument.spec.ts, which has a real 'O688O145' letter-O-for-zero
-- case). Merging would have folded Staffelfelden into Ensisheim and Eloyes
-- into Bergheim, silently and irreversibly.
--
-- The right id for those rows cannot be derived — nothing here knows
-- Staffelfelden's or Eloyes' real affiliation number — so both are left
-- exactly as they are. They stay fully reachable and editable thanks to the
-- /clubs/:clubId routing change in the same PR, which is where the club's
-- name and number get corrected by hand. A visibly wrong row beats a
-- silently merged one.
--
-- Hence the NOT EXISTS guard on both rules below: whenever the target id is
-- already taken, this migration does nothing rather than guess.

-- === Rename what is simply on the wrong id ===

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
