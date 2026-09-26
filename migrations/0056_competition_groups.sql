-- 0056 — a club restricts a competition to one of its groups (#604)
--
--   club_competition_groups  PRIMARY KEY (club_id, competition_id)
--   users.last_client_version
--
-- #482 let a club amend a competition licensee by licensee: exclude this one,
-- add that one. Every arrival, every August category change and every
-- departure left the list a little more wrong, and a year-old exclusion no
-- longer said why it was there. #602 gave clubs groups of members; a
-- competition now points at one of them, and the club maintains the group once
-- for everything it uses it for.
--
-- The rule is the competition's categories AND the club's group. A group can
-- only narrow, so a club can no longer widen a competition past its categories
-- — which is what `competitions.is_category_locked` existed to prevent.
--
-- **Additive only.** `club_competition_eligibility` and
-- `competitions.is_category_locked` stay: this release's code stops reading and
-- writing them, and they are dropped by a later migration, once this release
-- is deployed — dropping them here would pull them out from under the previous
-- worker, still serving requests between the migration and the swap (#410).
--
-- `last_client_version` is what tells us when that later step — and the
-- removal of the compatibility rows `GET /api/data` sends app ≤ 1.5 — is safe:
-- the app has sent `X-Client-Version` on every request since #508, and nothing
-- has recorded it until now.

CREATE TABLE IF NOT EXISTS club_competition_groups (
  club_id        TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  -- Deleting the group lifts the restriction: the competition is open again to
  -- its whole category, which the club screen says before the group goes.
  group_id       TEXT NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (club_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_club_competition_groups_group
  ON club_competition_groups (group_id);

-- The app build a member last used. NULL for someone who only ever used the
-- web, which sends no version.
ALTER TABLE users ADD COLUMN last_client_version TEXT;
