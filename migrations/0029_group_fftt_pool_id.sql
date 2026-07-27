-- #278: separate a group's local id from its FFTT pool id.
--
-- groups.id currently means two different things depending on how the row was
-- created: an FFTT pool id for anything that came from the FFTT teams/groups
-- import (1502259, 1406488, 1404634…), a local id for everything else
-- (group-1…group-7, p2-grp-gee, p2-grp-ge6a…). Unifying on the FFTT id is
-- impossible — a group created by hand, or read off a PDF calendar, has no
-- pool id to unify on — so the two concepts are split instead.
--
-- After this migration:
--   groups.id        a generated local id, meaningless, like every other table
--   groups.group_id  the FFTT pool id, NULL unless the group really came from FFTT
--
-- Naming note: groups.group_id sits next to teams.group_id and
-- match_days.group_id, which are foreign keys pointing AT groups.id — same
-- name, different meaning. Chosen deliberately (fftt_pool_id was the
-- alternative; FFTT calls these "pools" and the code uses poolId).
--
-- Nothing has a real foreign key to groups (only club_logos and player_avatars
-- carry REFERENCES clauses in this schema), so the cascade hazard of 0020 does
-- not apply. The rename still follows the insert → repoint → delete order used
-- by 0018/0020/0022/0023.
--
-- New ids are 'group-' + 12 random hex chars, matching the shape the app's own
-- nextId('group') produces. randomblob is fine here: this file runs exactly
-- once (the ALTER below is its guard), and the mapping is materialized before
-- anything reads it.
--
-- Re-run safety: the ALTER on the first line fails once the column exists,
-- rolling the whole file back — same fail-fast contract as 0007/0016/0017/
-- 0020/0023.

ALTER TABLE groups ADD COLUMN group_id TEXT;

DROP TABLE IF EXISTS group_id_remap;

-- One row per group, with its new local id and the FFTT pool id it carried.
-- An all-digits id is an FFTT pool id (the FFTT import is the only thing that
-- ever produced one); anything else is already a local id and keeps NULL.
CREATE TABLE group_id_remap AS
SELECT
  id AS old_id,
  'group-' || lower(hex(randomblob(6))) AS new_id,
  CASE WHEN id GLOB '[0-9]*' AND id NOT GLOB '*[^0-9]*' THEN id END AS fftt_pool_id
FROM groups;

UPDATE teams
SET group_id = (SELECT new_id FROM group_id_remap WHERE old_id = teams.group_id)
WHERE group_id IN (SELECT old_id FROM group_id_remap);

UPDATE match_days
SET group_id = (SELECT new_id FROM group_id_remap WHERE old_id = match_days.group_id)
WHERE group_id IN (SELECT old_id FROM group_id_remap);

-- groups.team_ids holds TEAM ids, not group ids — untouched on purpose.

INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id)
SELECT r.new_id, g.division_id, g.number, g.team_ids, g.is_archived, r.fftt_pool_id
FROM groups g
JOIN group_id_remap r ON r.old_id = g.id;

DELETE FROM groups WHERE id IN (SELECT old_id FROM group_id_remap);

DROP TABLE group_id_remap;
