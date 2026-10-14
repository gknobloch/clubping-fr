-- 0066 — reads go through the person (#655, fourth step)
--
--   profiles   a club profile with its person's fields: what `users` was
--
-- Since 0063 the person's fields (name, address, phone, birth) live in
-- `people`, and every write also copied them onto each profile in `users` so
-- that the API, which read them there, kept working. This is the step where
-- reads move: the API reads `profiles`, a view that is `users` row for row,
-- with the person's fields taken from `people`. Once nothing reads the copies,
-- nothing needs to write them, and the code stops — so after this deploy the
-- columns on `users` go stale, and are dropped in a later one (#410).
--
-- Additive only: a view and an index. The worker that was serving when this
-- runs reads `users`, whose copies are still exact — it is the worker that
-- arrives with this migration that stops writing them.
--
-- ## Every profile has a person first
--
-- A profile created by the worker of the release before 0063, while 0063 ran,
-- has no person (`person_id` NULL). The view would still show it (it falls
-- back to the profile's own columns), but writes now go to `people` alone and
-- would have nowhere to land. So each one becomes its own person, exactly as
-- 0063's backfill did — `person-` and the profile id.
--
-- ## The view lists its columns
--
-- `SELECT u.*` plus the person's fields would name `first_name` twice. So the
-- columns are listed, and a column added to `users` later must be added here
-- too: `functions/api/profilesView.test.ts` compares the two and fails the
-- build on the first one forgotten. `email_pre_0060` stays out — emptied by
-- 0060, read by nothing.
--
-- A person's field is the person's even when it is NULL: Sacha's address
-- emptied by the general admin (step 3) is NULL in `people`, and the stale
-- copy on `users` must not show through. Only a profile with no person at all
-- reads its own columns — `CASE`, never `COALESCE`.

INSERT OR IGNORE INTO people (id, first_name, last_name, email, phone, birth_date, birth_place)
  SELECT 'person-' || id, first_name, last_name, email, COALESCE(phone, ''), birth_date, birth_place
    FROM users
   WHERE person_id IS NULL;

UPDATE users SET person_id = 'person-' || id WHERE person_id IS NULL;

CREATE VIEW profiles AS
  SELECT
    u.id,
    u.role,
    u.is_player,
    CASE WHEN p.id IS NULL THEN u.first_name ELSE p.first_name END AS first_name,
    CASE WHEN p.id IS NULL THEN u.last_name ELSE p.last_name END AS last_name,
    u.license_number,
    CASE WHEN p.id IS NULL THEN u.phone ELSE COALESCE(p.phone, '') END AS phone,
    CASE WHEN p.id IS NULL THEN u.birth_date ELSE p.birth_date END AS birth_date,
    CASE WHEN p.id IS NULL THEN u.birth_place ELSE p.birth_place END AS birth_place,
    u.status,
    u.club_id,
    u.first_login_at,
    u.last_seen_at,
    u.notifications_enabled,
    u.last_client_version,
    u.notification_preferences,
    CASE WHEN p.id IS NULL THEN u.email ELSE p.email END AS email,
    u.person_id
  FROM users u
  LEFT JOIN people p ON p.id = u.person_id;

-- Sign-in looks a person up by address; `users_by_email` indexed the copy.
CREATE INDEX IF NOT EXISTS people_by_email ON people (lower(email));
