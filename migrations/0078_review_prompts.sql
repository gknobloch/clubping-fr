-- #781 — asking a member to review the app, and remembering the answer.
--
-- One row per PERSON (#655), not per club profile: « Ne plus demander » is a
-- promise to whoever said it, and it has to hold on their other profiles, on
-- their next phone and after a reinstall. Written for the person who signed
-- in (#702), never for a profile they manage.
--
--   first_seen_at   first time a build carrying this asked about them (ms)
--   asked_count     prompts put in front of them, on any device
--   last_asked_at   the latest of those (ms)
--   stopped         'declined' (« Ne plus demander ») or 'reviewed'
--
-- The rules are in src/lib/reviewPrompt.ts. A person merged into another
-- (POST /people/:id/merge-into) has their row folded into the kept one first;
-- the cascade then removes what is left.
--
-- Additive, one deploy: nothing that runs today names the table.
CREATE TABLE IF NOT EXISTS review_prompts (
  person_id      TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  first_seen_at  INTEGER NOT NULL,
  asked_count    INTEGER NOT NULL DEFAULT 0,
  last_asked_at  INTEGER,
  stopped        TEXT CHECK (stopped IN ('declined', 'reviewed'))
);
