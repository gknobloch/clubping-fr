-- 0046 — a competition remembers which FFTT contest it is (#482)
--
-- The divisions import (#219) asks FFTT for one contest and only one:
--
--   contests(divisions_organization_id: … season_id: … identifier: "1")
--
-- so every division it has ever created belongs to the same competition — the
-- men's team championship. 0045 left those divisions filed under nothing,
-- which asked a general admin to re-state by hand a fact the import already
-- had on screen ("Championnat : FED_Championnat de France par Equipes
-- Masculin"). This column is what lets the import file them itself.
--
-- Keyed on the contest IDENTIFIER, not on its id. FFTT issues a fresh contest
-- id per (organisation, season) — 18368 for Grand-Est 2026/2027 — so keying on
-- the id would mint a new competition every August, and every category mapping
-- and club derogation configured against last season's row would be orphaned
-- while the app quietly stopped restricting anything. The identifier is what
-- stays put across seasons and across leagues.
--
-- Hence the unique index: one competition per contest identifier, so two
-- imports run against two different leagues converge on the same row rather
-- than racing to create a second one. Partial, because a competition created
-- by hand on /competitions has no FFTT contest at all and there may be many of
-- those.
--
-- No data is created here either. The competition appears on the first import
-- that needs it, with no categories — which admits everyone, so an import
-- still cannot start restricting who may be fielded.

ALTER TABLE competitions ADD COLUMN fftt_contest_identifier TEXT;

CREATE UNIQUE INDEX competitions_fftt_contest_identifier
  ON competitions (fftt_contest_identifier)
  WHERE fftt_contest_identifier IS NOT NULL;
