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
--
-- Images (user_avatars, club_logos) are NOT handled here: refresh-dev-db.sh
-- tells normalise-d1-export.py to skip their rows outright, so they never
-- reach this database. The deletes at the foot of this file are a safety net
-- for a load that bypassed that flag, not the primary mechanism (#359).

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
  birth_place = NULL,
  -- When a real member last opened the app (#406). A pseudonym makes it
  -- harmless on its own, but it is a fact about someone's behaviour on a
  -- publicly reachable preview, and keeping it buys nothing: the dev login
  -- stamps a fresh visit the moment anyone signs in as a row.
  first_login_at = NULL,
  last_seen_at = NULL;

-- Live production session tokens. Copying these into a less protected
-- environment hands out authenticated access to real accounts; nothing on a
-- preview needs them.
DELETE FROM sessions;

-- Pending one-time codes, keyed by real email addresses.
DELETE FROM auth_otp;

-- Google/Apple subject ids — stable per-person identifiers from the provider.
DELETE FROM auth_identities;

-- ---------------------------------------------------------------------------
-- Clubs (#359)
--
-- A club is not a person, but a preview that names real clubs, gives the
-- street address of their venue and links their WhatsApp group is still
-- production data on a guessable public URL — and the venue address is where
-- identifiable people physically are on a Thursday evening.
--
-- Team labels come along for free: `teams` has no name column, so a team reads
-- as "<club display_name> <number>" everywhere. Renaming the club renames every
-- team, fixture and composition that mentions it.
--
-- 4 prefixes x 12 towns, indexed so rowid 0..47 are distinct; beyond 48 clubs
-- names start repeating, which is cosmetic rather than a leak.
UPDATE clubs SET
  display_name =
    CASE rowid % 4 WHEN 0 THEN 'TT ' WHEN 1 THEN 'US ' WHEN 2 THEN 'AS ' ELSE 'CP ' END
    || CASE (rowid / 4) % 12
      WHEN 0 THEN 'Valmont'    WHEN 1  THEN 'Beauval'   WHEN 2  THEN 'Montfleury'
      WHEN 3 THEN 'Chalonnes'  WHEN 4  THEN 'Preuilly'  WHEN 5  THEN 'Vaubourg'
      WHEN 6 THEN 'Sancourt'   WHEN 7  THEN 'Marnaval'  WHEN 8  THEN 'Ferrières'
      WHEN 9 THEN 'Aubercy'    WHEN 10 THEN 'Brémont'   ELSE 'Tilleul' END,
  -- An affiliation number resolves to the real club in the FFTT's public
  -- directory. The 99 prefix marks the row as synthetic, which is what
  -- refresh-dev-db.sh verifies afterwards.
  affiliation_number = printf('99%06d', rowid);

-- The town is recomputed from the club's rowid rather than parsed back out of
-- display_name, so an address stays in the town its club is named after.
UPDATE club_addresses SET
  label = 'Salle municipale',
  street = printf('%d rue du Stade', 1 + (rowid % 60)),
  postal_code = printf('%05d', 10000 + (rowid * 137) % 79000),
  city = COALESCE(
    (SELECT CASE (c.rowid / 4) % 12
      WHEN 0 THEN 'Valmont'    WHEN 1  THEN 'Beauval'   WHEN 2  THEN 'Montfleury'
      WHEN 3 THEN 'Chalonnes'  WHEN 4  THEN 'Preuilly'  WHEN 5  THEN 'Vaubourg'
      WHEN 6 THEN 'Sancourt'   WHEN 7  THEN 'Marnaval'  WHEN 8  THEN 'Ferrières'
      WHEN 9 THEN 'Aubercy'    WHEN 10 THEN 'Brémont'   ELSE 'Tilleul' END
     FROM clubs c WHERE c.id = club_addresses.club_id),
    'Valmont');

-- Websites, WhatsApp invites and Facebook pages all lead straight back to the
-- real club and its members. .invalid never resolves (RFC 2606).
UPDATE club_channels SET
  link = 'https://example.invalid/' || type || '/' || rowid,
  display_name = NULL;

-- Raw FFTT payloads cached per club and per season. They hold the real club and
-- team names the renames above just removed, so leaving them would both leak
-- and contradict the database around them. They are caches: they refill.
DELETE FROM fftt_club_teams_cache;
DELETE FROM fftt_season_cache;

-- ---------------------------------------------------------------------------
-- Images — safety net (#359)
--
-- Normally empty already: refresh-dev-db.sh skips these tables at load time.
-- They are photographs of real members and real club marks, so a refresh that
-- somehow carried them must not leave them sitting here.
DELETE FROM user_avatars;
DELETE FROM player_avatars_pre_0036;
DELETE FROM club_logos;
