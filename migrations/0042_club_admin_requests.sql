-- 0042 — requests to administer a club (#474)
--
-- Sign-in is passwordless and /auth/email/request only sends a code to an
-- address that already has a row, so someone discovering the app for a club we
-- have never heard of cannot get in at all — not even far enough to ask. This
-- table is that missing door: an unauthenticated POST lands a row here, and a
-- general admin turns it into a club and an admin, or refuses it.
--
-- `fftt_snapshot` is what the requester's *browser* read from FFTT when they
-- asked, stored as JSON. It is here because the server cannot fetch it — FFTT
-- and dafunker block Cloudflare's egress IPs, which is why every FFTT read in
-- this app runs client-side (#229/#231/#247). It is therefore claimant-supplied
-- data with no authority: the review screen re-reads FFTT in the general
-- admin's own browser and compares against this, rather than trusting it.
--
-- `club_id` is NULL while the request names a club we do not have; approving
-- creates the club and fills it in. It is deliberately not a foreign key: the
-- request outlives the decision as a record, and a club deleted later must not
-- take its history with it.
--
-- Decided requests are kept, not deleted. "Why was this refused?" is a question
-- that gets asked, and a row that says so is the only place to answer it.

CREATE TABLE club_admin_requests (
  id                  TEXT PRIMARY KEY,
  affiliation_number  TEXT NOT NULL,
  club_id             TEXT,
  email               TEXT NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  phone               TEXT NOT NULL DEFAULT '',
  message             TEXT NOT NULL DEFAULT '',
  fftt_snapshot       TEXT NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at          INTEGER NOT NULL,
  decided_at          INTEGER,
  decided_by          TEXT,
  decision_note       TEXT
);

-- One pending request per (address, club). The endpoint is public, so this is
-- the cheapest place to stop a form being submitted forty times: the second
-- attempt collides here rather than growing the queue. Partial, so a refused
-- request never blocks asking again — circumstances change, and a rejection is
-- not a ban.
CREATE UNIQUE INDEX club_admin_requests_one_pending
  ON club_admin_requests (lower(email), affiliation_number)
  WHERE status = 'pending';

-- The review screen's only query: the pending ones, newest first.
CREATE INDEX club_admin_requests_by_status
  ON club_admin_requests (status, created_at DESC);
