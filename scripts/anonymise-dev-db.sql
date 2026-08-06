-- Anonymise the preview database after a refresh from production (#313).
--
-- Previews are deployed to pr-<N>.clubping-fr.pages.dev, which is guessable and
-- publicly reachable even though the repo is private. Once dev login ("sign in
-- as anyone, no password") is enabled there, anything left in this database is
-- effectively public — so real member data must not survive the refresh.
--
-- Run ONLY against clubping-fr-dev. refresh-dev-db.sh refuses any target whose
-- name does not end in `-dev`.
--
-- What is deliberately KEPT: ids, club membership, roles, status, points,
-- teams, groups, games, availabilities. That is the structure and volume that
-- makes a preview worth having (#296) — it reproduces layout and pagination
-- bugs that seed data, with its handful of rows, does not.

-- Pseudonyms rather than "Joueur 12": names of realistic length are what
-- surface wrapping and truncation bugs, which is half the point of previewing
-- on a phone. 12 x 12 combinations, deterministic on rowid so a given row keeps
-- the same identity across refreshes.
UPDATE users SET
  first_name = CASE rowid % 12
    WHEN 0 THEN 'Camille' WHEN 1 THEN 'Lucas'  WHEN 2  THEN 'Manon'
    WHEN 3 THEN 'Hugo'    WHEN 4 THEN 'Léa'    WHEN 5  THEN 'Nathan'
    WHEN 6 THEN 'Chloé'   WHEN 7 THEN 'Théo'   WHEN 8  THEN 'Inès'
    WHEN 9 THEN 'Louis'   WHEN 10 THEN 'Jade'  ELSE 'Paul' END,
  last_name = CASE (rowid / 12) % 12
    WHEN 0 THEN 'Martin'  WHEN 1 THEN 'Bernard' WHEN 2  THEN 'Dubois'
    WHEN 3 THEN 'Thomas'  WHEN 4 THEN 'Robert'  WHEN 5  THEN 'Richard'
    WHEN 6 THEN 'Petit'   WHEN 7 THEN 'Durand'  WHEN 8  THEN 'Leroy'
    WHEN 9 THEN 'Moreau'  WHEN 10 THEN 'Simon'  ELSE 'Laurent' END,
  -- .invalid is reserved by RFC 2606: guaranteed never to resolve, so a stray
  -- send from a preview cannot reach a real inbox.
  email = 'membre' || rowid || '@example.invalid',
  phone = '0600000000',
  -- An FFTT licence number identifies a real person through the federation's
  -- public directory, so it goes even though the name is already fake. Cost:
  -- FFTT matching by licence will not line up on previews.
  license_number = printf('99%05d', rowid),
  birth_date = NULL,
  birth_place = NULL;

-- Live production session tokens. Copying these into a less protected
-- environment hands out authenticated access to real accounts; nothing on a
-- preview needs them.
DELETE FROM sessions;

-- Pending one-time codes, keyed by real email addresses.
DELETE FROM auth_otp;

-- Google/Apple subject ids — stable per-person identifiers from the provider.
DELETE FROM auth_identities;
