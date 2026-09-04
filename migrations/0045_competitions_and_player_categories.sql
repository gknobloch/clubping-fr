-- 0045 — competitions, and the category a licensee holds (#482)
--
-- The app knew one competition, the senior team championship, and knew it only
-- by never having met another. Nothing said what a division belongs to, and
-- nothing said what a player is: no age category anywhere, though the FFTT
-- licence feed the player import already reads (#384) carries one in <cat>.
--
-- Three pieces, and they are deliberately small:
--
--   competitions                  what a division belongs to, and which
--                                 categories it admits by default
--   club_competition_eligibility  a club's amendments to that default, one row
--                                 per exception
--   users.category                the raw FFTT code, normalized on read
--
-- The rattachement runs division → competition rather than team → competition:
-- a team already declares a division, and a championship is what a set of
-- divisions IS. A second place to state the same fact is a second place for it
-- to be wrong.
--
-- `categories` is a JSON array, like every other list column in this schema
-- (teams.player_ids, groups.team_ids). **An empty array means every category**,
-- not "no one" — the senior championship does not enumerate seventeen codes to
-- say "anyone", and that is also what makes an unconfigured competition
-- harmless.
--
-- club_competition_eligibility carries club_id even though it is derivable
-- from the player, because it is the scope the API authorizes against: a club
-- admin writes rows bearing their own club and no others, and the clause is
-- direct. Not a foreign key, for the same reason the rest of this schema has
-- none: D1 rows here outlive each other by design.
--
-- Nothing is created by this migration. A competition is a general admin's
-- decision, and a division that belongs to none restricts nobody — so every
-- existing row keeps behaving exactly as it did until someone says otherwise.

CREATE TABLE competitions (
  id                 TEXT PRIMARY KEY NOT NULL,
  display_name       TEXT NOT NULL,
  -- JSON array of category codes; '[]' admits every category.
  categories         TEXT NOT NULL DEFAULT '[]',
  -- 1 = a club may exclude but never add (a youth championship).
  is_category_locked INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_archived        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE club_competition_eligibility (
  club_id        TEXT NOT NULL,
  competition_id TEXT NOT NULL,
  player_id      TEXT NOT NULL,
  -- included | excluded
  effect         TEXT NOT NULL,
  PRIMARY KEY (club_id, competition_id, player_id)
);

CREATE INDEX club_competition_eligibility_by_competition
  ON club_competition_eligibility (competition_id);

-- The FFTT category, verbatim: "S", "V45", sometimes "B2". Normalizing on
-- write would throw away the only thing that tells us the export changed.
ALTER TABLE users ADD COLUMN category TEXT;

-- NULL = belongs to no competition = restricts nobody, which is every row here.
ALTER TABLE divisions ADD COLUMN competition_id TEXT;
