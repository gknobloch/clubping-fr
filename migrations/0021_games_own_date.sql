-- Games own their date (#271): match_days.date used to be the only place a
-- date lived, shared by every game in a round ("journée"), even though FFTT
-- sometimes schedules different matches of the same round on different real
-- dates. games.date becomes the source of truth per match; match_days.date
-- stays as a column but its semantics change to "derived" (recomputed
-- server-side as the MIN of its games' dates) — see functions/api/[[path]].ts.
--
-- Nullable, no index (consistent with the rest of the schema — nothing here
-- is indexed, every join is JS-side). Backfilling from the existing
-- match_days.date keeps every current game correctly dated at exactly its
-- round's prior single date; per-game divergence only starts accruing once
-- the write paths (this migration's follow-up code changes) ship.

ALTER TABLE games ADD COLUMN date TEXT;

UPDATE games SET date = (SELECT date FROM match_days WHERE match_days.id = games.match_day_id)
WHERE date IS NULL;
