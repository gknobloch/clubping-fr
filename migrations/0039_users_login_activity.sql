-- #406: record when a member first opened the app, and when they were last seen.
--
--   users.first_login_at  unix epoch ms, NULL = never signed in
--   users.last_seen_at    unix epoch ms, NULL = never signed in
--
-- Why on `users` and not derived from `sessions`: a session is deleted at
-- logout (auth.ts) and expires after 30 days, so the only question it can
-- answer is "who is signed in right now". The question the club actually has
-- after sharing the app — who has ever opened it — needs a fact that outlives
-- the session, and `auth_identities` cannot stand in for it (no date, and
-- empty for the e-mail code, which is the only sign-in enabled today).
--
-- Only `last_seen_at` reaches the client; nothing displays a first login yet.
-- `first_login_at` is stored all the same because it is the one fact that
-- cannot be reconstructed afterwards — once a member has come back, the date
-- they started is gone unless it was written down the first time.
--
-- Both stay NULL for everyone already in the database. That is honest rather
-- than tidy: sessions carry a created_at that could seed last_seen_at, but only
-- for members holding a live session, which would date a "last visit" for some
-- and leave others blank for a reason no reader could guess. NULL means "not
-- known to have signed in since #406", and every real login fills it in.
--
-- Re-run safety: the first ALTER fails once the column exists, rolling the
-- whole file back — same contract as 0023/0029/0031/0032/0035.

ALTER TABLE users ADD COLUMN first_login_at INTEGER;
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
