-- 0062 — a licence per federation (#644)
--
--   federation_licences   a member's licence in any federation BUT the FFTT
--
-- `users.license_number` is one column, and it is the FFTT's: the club import
-- matches on it (#384, #566), onboarding writes it (#474), and every app build
-- up to 1.7 reads it. A member of Kembs who plays both championships holds two
-- licences, and a member of Landser — the AGR alone — holds no FFTT licence at
-- all (1251178 is an AGR number).
--
-- ## Why the FFTT licence stays where it is
--
-- The same reasoning as the clubs' affiliations in 0061. Five paths write
-- `users.license_number` and the imports read it; a copy here would have to
-- be kept in step by every one of them, and the day one forgets, the import
-- matches on one number while the screens print the other. So a member holds
-- an FFTT licence when `license_number` says so, and any other one when it has
-- a row here; `licencesOf` (src/lib/licences.ts) is the one place that puts
-- the two together. Moving the FFTT licence in here, and dropping the column,
-- is a two-deploy change of its own (#410) for the day nothing reads it.
--
-- Purely additive: nothing existing is read differently.

CREATE TABLE IF NOT EXISTS federation_licences (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  federation_id  TEXT NOT NULL REFERENCES federations(id),
  number         TEXT NOT NULL,
  PRIMARY KEY (user_id, federation_id)
);
