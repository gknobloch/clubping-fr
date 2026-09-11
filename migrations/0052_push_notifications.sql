-- 0052 — notifications push mobile (#495)
--
--   push_tokens         PRIMARY KEY (token)
--   notifications_sent  PRIMARY KEY (kind, user_id, game_id)
--   users.notifications_enabled
--
-- ## push_tokens
--
-- Keyed on the token, not on the member: one licensee may hold a phone and a
-- tablet, and both have to ring. The reverse also happens and is the reason
-- `user_id` is not part of the key — a club phone handed over at the end of a
-- season re-registers the SAME Expo token under a new member, and an upsert on
-- the token is what moves it. Keyed on (user_id, token) the old row would
-- survive and the previous holder would keep receiving the club's pushes.
--
-- `last_seen_at` is refreshed on every registration. Expo tells us about a
-- dead token through the receipt ("DeviceNotRegistered") and that is what
-- actually prunes; this is only there to make an abandoned install visible.
--
-- ## notifications_sent
--
-- The ledger of what has already gone out, and the reason the dispatcher has
-- one rule instead of two. The obvious reading of "J-7" is a date arithmetic:
-- notify the games whose date is exactly seven days out. That rule cannot see
-- the player added to the squad at J-3 — the only member of the squad who has
-- never been told — so it needs a second, separate trigger on roster changes,
-- which then has to avoid notifying twice.
--
-- Turned around, both disappear: the question is "who is on the squad of a
-- match inside the next seven days and has not been told yet?". The latecomer
-- is answered by the same sweep on the next run, and a cron that fires twice
-- sends nothing the second time.
--
-- Keyed per (kind, member, game) because that is exactly what must happen at
-- most once. Not per journée: two teams of the same club play two different
-- matches on the same day, and a licensee on both squads owes two answers.
--
-- `game_id` is a plain column, not a reference: the ledger has to outlive the
-- match it talks about. A game deleted by a re-imported poule takes its
-- availabilities with it (#422), and if it comes back under the same derived
-- id (#282) the squad would be notified a second time for a match they already
-- answered. The rows are small and never read back except by this key.
--
-- ## users.notifications_enabled
--
-- One switch, not a matrix. The OS prompt is the real opt-in; this is for the
-- member who granted it once and now wants quiet without hunting through the
-- system settings. Default 1: a member who has no token is not notified by
-- anything, so the default only takes effect the moment they register one,
-- which is the moment they said yes to the OS.
--
-- Re-run safety: the ALTER fails once the column exists, rolling the file back.

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'ios' | 'android'. Kept for support ("does this only fail on Android?"),
  -- never read by the dispatcher: Expo routes on the token itself.
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- The dispatcher's only access path: given the members to notify, their tokens.
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE IF NOT EXISTS notifications_sent (
  -- 'availability_request' for now; the column exists so a second kind does
  -- not need its own table to be deduplicated.
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (kind, user_id, game_id)
);

ALTER TABLE users ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1;
