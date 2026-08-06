-- Two leftovers from migration 0007, which merged `players` into `users` (#317).
--
-- 1. The `players` table has been empty ever since, and no SQL anywhere reads
--    or writes it — /api/data builds its player list from
--    `users WHERE is_player = 1`. All it does is suggest a second source of
--    truth that does not exist.
--
-- 2. `player_avatars` is keyed by `user_id` and holds the avatar of any
--    member, playing or not. The name predates the merge; the HTTP routes were
--    renamed in #320 and this brings the table in line.
--
-- Written to be idempotent rather than as a bare `ALTER TABLE … RENAME TO`,
-- because deploy.yml re-runs every migration behind `|| true` (#312) and the
-- interaction with 0036 is otherwise nasty: 0036 recreates `player_avatars` on
-- re-application, so a rename here would leave an orphan table behind on the
-- next deploy. Instead this folds whatever is in `player_avatars` into
-- `user_avatars` and drops it — whatever state the database starts in, it ends
-- the same way.

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data         TEXT NOT NULL,        -- base64-encoded image bytes (no data: prefix)
  content_type TEXT NOT NULL,        -- e.g. image/jpeg
  updated_at   TEXT NOT NULL         -- ISO timestamp, used as the cache-busting version
);

-- Fails harmlessly once player_avatars is gone; tolerated by the runner.
INSERT OR REPLACE INTO user_avatars (user_id, data, content_type, updated_at)
SELECT user_id, data, content_type, updated_at FROM player_avatars;

DROP TABLE IF EXISTS player_avatars;
DROP TABLE IF EXISTS players;
