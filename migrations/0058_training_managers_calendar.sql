-- 0058 — who runs a guided series, and its calendar link (#608)
--
--   trainings.manager_ids     JSON array of users ids; [] for a regular slot
--   trainings.calendar_token  the key of the series' .ics link
--
-- ## manager_ids
--
-- A guided series is run by its coach, who is rarely a club admin. The members
-- named here may add and remove dates, call a session off and answer for
-- whoever is expected — the schedule. The series itself (time, place, audience,
-- and who runs it) stays with the club's admins.
--
-- ## calendar_token
--
-- « Toute la série » in the app hands the member's phone a link to the
-- series' .ics: a browser or calendar opening it carries no session, so the
-- link carries its own key. Random per series, and it reveals that series'
-- dates and place and nothing else. Existing rows get one here; the API mints
-- one for every new series.
--
-- A separate migration from 0057 because 0057 already ran on the preview
-- database under its first name (#608), and a file that has run is never
-- edited. Re-run safety: the first ALTER fails once the column exists.

ALTER TABLE trainings ADD COLUMN manager_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trainings ADD COLUMN calendar_token TEXT;

UPDATE trainings SET calendar_token = lower(hex(randomblob(16))) WHERE calendar_token IS NULL;
