-- 0067 — the person's fields leave `users` (#655, fifth step)
--
-- Since 0066 the API reads a profile through `profiles` and writes the
-- person's fields to `people` alone: the columns on `users` are stale copies
-- that nothing reads or writes. They go here — in a deploy of their own, after
-- 0066's code is the one serving (#410): the worker still serving while this
-- runs must be one that never names them.
--
-- `DROP COLUMN`, never a rebuild: `users.id` is what thirty-odd columns, six
-- ON DELETE CASCADE keys and three JSON arrays point at (0036, #604, 0060).
--
-- Order matters to SQLite. The view names the columns (its fallback for a
-- profile with no person), and an index names `email`: both would make the
-- drop fail, so the view is recreated without the fallback first — every
-- profile has had a person since 0066 — and the index goes.
--
-- `email_pre_0060` stays: SQLite cannot drop a UNIQUE column, and 0060 emptied
-- it long ago.

DROP VIEW profiles;

CREATE VIEW profiles AS
  SELECT
    u.id,
    u.role,
    u.is_player,
    p.first_name,
    p.last_name,
    u.license_number,
    COALESCE(p.phone, '') AS phone,
    p.birth_date,
    p.birth_place,
    u.status,
    u.club_id,
    u.first_login_at,
    u.last_seen_at,
    u.notifications_enabled,
    u.last_client_version,
    u.notification_preferences,
    p.email,
    u.person_id
  FROM users u
  LEFT JOIN people p ON p.id = u.person_id;

DROP INDEX IF EXISTS users_by_email;

ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN last_name;
ALTER TABLE users DROP COLUMN phone;
ALTER TABLE users DROP COLUMN birth_date;
ALTER TABLE users DROP COLUMN birth_place;
ALTER TABLE users DROP COLUMN email;
