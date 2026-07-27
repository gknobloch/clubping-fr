-- #275 (3a): every club id follows `club-fftt-{affiliationNumber}` — the
-- format 0020 established and that games/import's clubIdFor already produces
-- for auto-created opponent clubs.
--
-- 0020 renamed every club that existed at the time, so on a healthy database
-- this migration is expected to match zero rows. It exists because nothing
-- enforced the convention between 0020 and now, and because a silent
-- non-conformant id is exactly the kind of drift this issue is about. Unlike
-- 0022/0023 the target cannot be invented: a club whose affiliation_number is
-- NULL or not an 8-digit FFTT number is left on its current id and simply
-- stays reachable — that is what the /clubs/:clubId routing change in the
-- same PR is for.
--
-- club_logos.club_id REFERENCES clubs(id) ON DELETE CASCADE with no
-- ON UPDATE CASCADE, so — exactly as 0018 and 0020 spell out — the rename
-- must insert the new row, repoint every dependent (logos included), then
-- delete the old row. A bare `UPDATE clubs SET id = ...` is rejected by D1's
-- FK enforcement in production (and, misleadingly, accepted locally).
--
-- Re-run safety: naturally idempotent — the remap table comes out empty once
-- every id conforms.

DROP TABLE IF EXISTS club_id_remap;

CREATE TABLE club_id_remap (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

INSERT INTO club_id_remap (old_id, new_id)
SELECT id, 'club-fftt-' || affiliation_number
FROM clubs
WHERE id NOT GLOB 'club-fftt-*'
  AND affiliation_number GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
  AND NOT EXISTS (
    SELECT 1 FROM clubs t WHERE t.id = 'club-fftt-' || clubs.affiliation_number
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
