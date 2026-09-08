-- 0048 — an FFTT contest is identified by its identifier AND its name (#482)
--
-- 0046 keyed a competition on the contest identifier alone, on the assumption
-- that FFTT issues one identifier per championship. Three live listings say
-- otherwise, and the counter-examples are not exotic:
--
--   org 15 (Hauts-de-France), season 27 — one identifier, twice, same listing:
--     TO     id 18647  "TOP DE ZONE 06"
--     TO     id 18742  "TOP DE QUALIFICATION"
--     L07TO  id 18945  "L07-Tournoi Régional-ARQUES ES"
--     L07TO  id 19611  "TOURNOI REGIONAL BEAUVAIS 2425"
--
--   and across leagues the same identifier names something else entirely:
--     TO  org 14 = "Tournoi par Equipes"   vs   org 15 = "TOP DE QUALIFICATION"
--
-- So the unique index 0046 created was wrong twice over: it would have merged
-- two unrelated championships into one row — sharing its categories, its lock
-- and every club's derogations — and, where both were imported, the second
-- INSERT would simply have failed.
--
-- Only the federation's own contests have clean identifiers ("1" masculin, "2"
-- féminin, "3" corporatif, "4" jeunes, N, K, V, E…). Those are genuinely
-- global: the same identifier carries the same id in every organisation's
-- listing, which is what proves a contest is one FFTT entity rather than one
-- per league. The regional ones are free text and collide freely.
--
-- What IS stable, and unique in all three listings, is the pair
-- (identifier, FFTT's own name). Both survive a season change — every one of
-- the 35 contests org 14 lists for season 26 reappears in season 27 with the
-- same identifier and the same name, and only the id changes (18368 vs 15954
-- for the men's championship). So the pair is the key, and the id stays what it
-- always was: a per-season handle, never an identity.
--
-- The organisation is deliberately NOT part of the key. Contests being global,
-- the men's championship imported from two leagues is one championship and
-- should be one row, configured once.
--
-- `fftt_contest_name` is FFTT's name, kept apart from `display_name` precisely
-- so renaming a competition — which the import now invites — cannot break the
-- match. The backfill takes the display name because, before the rename existed,
-- that is exactly what an imported competition was called.

ALTER TABLE competitions ADD COLUMN fftt_contest_name TEXT;

UPDATE competitions
SET fftt_contest_name = display_name
WHERE fftt_contest_identifier IS NOT NULL AND fftt_contest_name IS NULL;

DROP INDEX IF EXISTS competitions_fftt_contest_identifier;

CREATE UNIQUE INDEX competitions_fftt_contest
  ON competitions (fftt_contest_identifier, fftt_contest_name)
  WHERE fftt_contest_identifier IS NOT NULL;
