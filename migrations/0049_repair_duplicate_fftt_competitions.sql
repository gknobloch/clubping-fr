-- 0049 — undo the duplicates 0048's backfill created (#482)
--
-- 0048 filled `fftt_contest_name` for competitions that predated it by copying
-- `display_name`, reasoning that "before renaming existed, that is what an
-- imported competition was called". The reasoning was sound and the fact was
-- wrong: renaming at import shipped BEFORE 0048, so any competition a general
-- admin had already renamed got its chosen name written into the column that
-- is supposed to hold FFTT's.
--
-- The next import then looked for (identifier, FFTT's name), found the renamed
-- value instead, matched nothing, and created a second competition for the same
-- championship — one holding every division and derogation, the other empty.
--
-- Two things fix it. The lookup no longer treats the name as the key
-- (`findCompetitionForContest` adopts the single row carrying an identifier and
-- corrects its stored name), which stops it recurring and heals a stale name on
-- the next import. And this file removes the empty twins already made.
--
-- Deliberately conservative: a row goes only when it holds nothing at all — no
-- division filed under it, no club derogation naming it — AND another row with
-- the same identifier does hold something. That second half matters. Two empty
-- rows sharing an identifier are just as likely to be the genuine "TO" pair,
-- two unrelated championships neither of which has been used yet, and there is
-- nothing in the data to tell them apart; deleting either would be a guess, and
-- an unused row costs nothing. So both stay, and only a twin standing beside a
-- row that carries real work is removed.

DELETE FROM competitions
WHERE fftt_contest_identifier IS NOT NULL
  AND id NOT IN (SELECT competition_id FROM divisions WHERE competition_id IS NOT NULL)
  AND id NOT IN (SELECT competition_id FROM club_competition_eligibility)
  AND EXISTS (
    SELECT 1 FROM competitions other
    WHERE other.fftt_contest_identifier = competitions.fftt_contest_identifier
      AND other.id <> competitions.id
      AND (
        other.id IN (SELECT competition_id FROM divisions WHERE competition_id IS NOT NULL)
        OR other.id IN (SELECT competition_id FROM club_competition_eligibility)
      )
  );
