-- 0055 — a club's own groups of members (#602)
--
--   member_groups          one row per group, owned by one club
--   member_group_members   PRIMARY KEY (group_id, user_id)
--
-- "Bureau", "Jeunes", "Loisirs", "Entraîneurs": ways a club sorts its own
-- people that no federation record carries. A member may belong to several,
-- hence a join table rather than a column on `users`.
--
-- Named `member_groups` because `groups` is already taken, by the poules of a
-- division — the one word the domain uses for two different things.
--
-- A group belongs to a club and to nothing above it: no season, no phase. The
-- "Bureau" of September is still the "Bureau" in January, and a group a club
-- has to recreate every August is one it stops maintaining.
--
-- Membership is keyed on the member, not on a licence: a club's president may
-- hold none. The API only lets a club file its own members into its own groups.

CREATE TABLE IF NOT EXISTS member_groups (
  id           TEXT PRIMARY KEY,
  club_id      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL
);

-- Two groups of one club under one name would be a filter nobody can read.
-- Case-insensitive, as the name is typed by hand.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_groups_club_name
  ON member_groups (club_id, display_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS member_group_members (
  group_id TEXT NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_group_members_user
  ON member_group_members (user_id);
