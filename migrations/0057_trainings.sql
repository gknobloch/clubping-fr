-- 0057 — a club's collective trainings, and what each member wants pushed (#608)
--
--   trainings                  one row per series, owned by one club
--   training_sessions          PRIMARY KEY (training_id, date)
--   training_availabilities    PRIMARY KEY (training_id, date, player_id)
--   users.notification_preferences
--
-- ## Two kinds of training, one table
--
-- A club runs two very different calendars. A *regular* training is a slot —
-- "every Tuesday at 20:00" — that holds all season, bar the evenings the gym is
-- closed. A *guided* training (entraînement dirigé) follows a coach's own
-- schedule: dated sessions, often weekly, never reliably so.
--
-- Both are a `trainings` row — the series: its club, its time, its place, who is
-- expected. What differs is where the dates come from:
--
--   regular  `weekday` over [`valid_from`, `valid_until`], computed on read.
--   guided   the `training_sessions` rows, one per date.
--
-- A regular slot is never materialised into a row per Tuesday: a season of them
-- would be forty rows to keep in step with every edit of the slot, for dates
-- nobody has said anything about.
--
-- ## training_sessions — one row per date somebody said something about
--
-- For a guided series a row IS a session: no row, no session. For a regular
-- series a row is an exception — the Tuesday the gym is closed — and the other
-- Tuesdays have none. Same key either way, (training_id, date), because a date
-- is how a member, a reminder and an answer all name an occurrence.
--
-- `cancelled` rather than a deleted row: a session called off is something
-- members must still see ("annulé : salle prise pour le tournoi"), and the
-- sweep reads it to tell whoever was already reminded. Deleting is for a date
-- entered by mistake.
--
-- ## training_availabilities
--
-- Only guided sessions ask for an answer; a regular slot is where the usual
-- people turn up, and asking them every week would teach them to mute the app.
-- "No answer" is the absence of a row, as for matches.
--
-- ## users.notification_preferences
--
-- JSON, NULL meaning every default. Per category — championship matches,
-- guided trainings, regular trainings — an on/off and, for the trainings, how
-- many days ahead. On the member row rather than per device: a member with a
-- phone and a tablet sets it once, and a club phone handed over carries the
-- next holder's preferences, not the last one's (#495's `push_tokens`).
-- `notifications_enabled` stays the master switch it was, so a build that only
-- knows that one keeps working.
--
-- Re-run safety: the ALTER fails once the column exists, rolling the file back.

CREATE TABLE IF NOT EXISTS trainings (
  id            TEXT PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  -- 'guided' | 'regular'
  kind          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  -- Regular only: ISO weekday, 1 = Monday … 7 = Sunday.
  weekday       INTEGER,
  -- "20:00". The end is optional; the start is what a reminder states.
  start_time    TEXT NOT NULL,
  end_time      TEXT,
  -- One of the club's addresses; NULL = the club's default.
  address_id    TEXT,
  -- JSON array of member_groups ids; [] = the whole club.
  member_group_ids TEXT NOT NULL DEFAULT '[]',
  -- Regular only: the period the slot runs. Either end may be open.
  valid_from    TEXT,
  valid_until   TEXT,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_trainings_club ON trainings (club_id);

CREATE TABLE IF NOT EXISTS training_sessions (
  training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  cancelled   INTEGER NOT NULL DEFAULT 0,
  -- Why it is cancelled, or anything worth saying about that one date.
  note        TEXT,
  PRIMARY KEY (training_id, date)
);

CREATE TABLE IF NOT EXISTS training_availabilities (
  training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  player_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'available' | 'maybe' | 'unavailable', as for a match.
  status      TEXT NOT NULL,
  PRIMARY KEY (training_id, date, player_id)
);

ALTER TABLE users ADD COLUMN notification_preferences TEXT;
