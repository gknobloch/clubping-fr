-- 0061 — federations, and clubs that belong to more than one (#643)
--
--   federations                 the FFTT and the AGR
--   competitions.federation_id  which federation runs the championship
--   club_federations            a club's affiliation to any federation BUT the FFTT
--
-- The app knew one federation by never having met another: a club was an FFTT
-- affiliation number, a competition an FFTT contest. Clubs in the Haut-Rhin also
-- play — or only play — the AGR championship (Section du Haut-Rhin): Landser
-- ASL plays there alone, Kembs plays both.
--
-- ## Federation → competition → division → poule
--
-- The federation hangs off the competition, not the division nor the team, for
-- the reason 0045 gave for the competition itself: a team already declares a
-- division, a division its competition, and a championship belongs to exactly
-- one federation. A division that belongs to no competition is the FFTT's — it
-- is what every such division has always been.
--
-- ## Why the FFTT is not a club_federations row
--
-- `clubs.affiliation_number` already IS the FFTT number: the imports, the
-- venue lookup (#613), the onboarding (#474) and the match sheet all read it.
-- Copying it into club_federations would be a second place for it to drift, and
-- every path that creates a club — four of them — would have to remember to
-- write both. So a club is in the FFTT when it has an FFTT number, and in any
-- other federation when it has a row here; `clubAffiliations` (src/lib/
-- federations.ts) is the one place that puts the two together.
--
-- `name` is the club's name *in that federation*: the AGR prints "KEMBS ASL TT",
-- and that is what its calendars will have to be matched against (#647).
--
-- Purely additive (#410): nothing existing is read differently.

CREATE TABLE IF NOT EXISTS federations (
  id            TEXT PRIMARY KEY NOT NULL,
  display_name  TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  -- 1 = its data comes from an import (the FFTT's API); 0 = typed in by hand or
  -- read off its documents. Decides who may build its competitions (#647).
  is_imported   INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO federations (id, display_name, short_name, is_imported, sort_order) VALUES
  ('fftt', 'Fédération française de tennis de table', 'FFTT', 1, 0),
  ('agr', 'AGR Tennis de table — Section du Haut-Rhin', 'AGR', 0, 1);

-- Every existing competition came from the FFTT import or was typed in for it.
ALTER TABLE competitions ADD COLUMN federation_id TEXT NOT NULL DEFAULT 'fftt';

CREATE TABLE IF NOT EXISTS club_federations (
  club_id             TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  federation_id       TEXT NOT NULL REFERENCES federations(id),
  affiliation_number  TEXT NOT NULL DEFAULT '',
  name                TEXT,
  PRIMARY KEY (club_id, federation_id)
);
