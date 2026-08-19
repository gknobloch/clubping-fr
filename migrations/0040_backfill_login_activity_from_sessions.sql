-- #406 follow-up: recover what the sessions table still remembers.
--
-- 0039 left first_login_at / last_seen_at NULL for everyone, on the grounds
-- that seeding them from live sessions would date a visit for whoever happened
-- to hold one. That reasoning had the comparison wrong. The alternative to an
-- approximate date is not silence — the screen renders NULL as
-- « Jamais connecté », which is an active claim, and a false one for every
-- member who has used the app. Filling a column in can only replace a wrong
-- "never" with a real date; it can never do the reverse.
--
-- What `sessions` actually holds, which is more than 30 days of it: rows are
-- removed at logout, and lazily when an EXPIRED token is presented again
-- (auth.ts). Nothing sweeps the table — there is no cron and no scheduled
-- worker — so an expired session whose token is never presented again stays
-- forever. In practice the table is close to an append-only login log going
-- back to 0007, the last migration that cleared it.
--
-- What is therefore recovered, and how well:
--
--   first_login_at  the earliest login still on record. Understated when a
--                   member's early rows were swept: coming back after 30 days
--                   presents the expired token, which deletes that row, and
--                   the fresh login writes a later one.
--   last_seen_at    the most recent LOGIN, which is a lower bound on the most
--                   recent USE — someone signed in for three weeks on one
--                   session shows their sign-in date, not yesterday. It heals
--                   itself: the guard overwrites it within an hour of their
--                   next request (LAST_SEEN_REFRESH_MS).
--
-- What stays NULL, and rightly reads as « Jamais connecté »: members with no
-- session row at all. That includes the one false negative this cannot fix —
-- someone who signed in once, pressed « Se déconnecter », and never returned.
-- They are indistinguishable from someone who never opened the link, which is
-- exactly the state everybody is in before this migration.
--
-- Earliest/latest rather than COALESCE, because #406 shipped before this ran:
-- a member who signed in during that window already carries a first_login_at
-- of that moment, while `sessions` knows they first arrived weeks earlier.
-- min() and max() take the better of the two, and SQLite's two-argument forms
-- return NULL if either side is NULL — hence the CASE arms.
--
-- Re-run safety: idempotent. It only ever moves first_login_at earlier and
-- last_seen_at later, towards values that are already there.

UPDATE users
SET
  first_login_at = CASE
    WHEN users.first_login_at IS NULL THEN s.first_login
    ELSE min(users.first_login_at, s.first_login)
  END,
  last_seen_at = CASE
    WHEN users.last_seen_at IS NULL THEN s.last_login
    ELSE max(users.last_seen_at, s.last_login)
  END
FROM (
  SELECT user_id, MIN(created_at) AS first_login, MAX(created_at) AS last_login
  FROM sessions
  GROUP BY user_id
) AS s
WHERE s.user_id = users.id;
