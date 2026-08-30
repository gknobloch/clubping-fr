-- 0043 — the club confirms before the request reaches a general admin (#474)
--
-- The flow gains a step in the middle:
--
--   1. someone submits the form            → pending_club
--   2. the club's correspondent confirms   → pending_admin
--   3. a general admin decides             → approved | rejected
--
-- `pending` no longer exists as a status; the rows written before this ran are
-- moved to `pending_admin`, because they were already waiting on exactly that.
--
-- WHAT THE MIDDLE STEP IS AND IS NOT
--
-- It is a courtesy and a filter: the club gets a say, and obvious noise never
-- reaches the queue. It is NOT proof of anything, and must not be read as such.
-- The address the confirmation is sent to comes from the requester's own
-- browser — the server cannot read the FFTT listing itself, its egress IPs are
-- blocked (#229/#231/#247) — so a requester who submits their own address as
-- the club's will duly receive their own confirmation and confirm it.
--
-- What closes that hole is step 3, unchanged: the general admin re-reads the
-- FFTT record in their own browser, and the review screen compares the address
-- we actually wrote to against the one the federation publishes now. A forged
-- correspondent shows up there as a mismatch. `correspondent_email` exists to
-- make that comparison possible — it records where the confirmation went, which
-- is a different question from what the snapshot claimed.
--
-- The token is stored as a SHA-256 digest, like sessions since 0041 and OTPs
-- from the start: a database read should not hand back a working confirmation
-- link.

ALTER TABLE club_admin_requests ADD COLUMN license_number TEXT NOT NULL DEFAULT '';
ALTER TABLE club_admin_requests ADD COLUMN correspondent_email TEXT NOT NULL DEFAULT '';
ALTER TABLE club_admin_requests ADD COLUMN club_token_hash TEXT;
ALTER TABLE club_admin_requests ADD COLUMN club_token_expires_at INTEGER;
ALTER TABLE club_admin_requests ADD COLUMN club_confirmed_at INTEGER;

-- Everything already in the queue was waiting on a general admin.
UPDATE club_admin_requests SET status = 'pending_admin' WHERE status = 'pending';

-- The unique index named `pending` explicitly and has to be rebuilt. One live
-- request per (address, club) still, whichever step it is sitting on — asking
-- twice while the first is in flight is the thing being prevented, and where it
-- has got to does not change that.
DROP INDEX IF EXISTS club_admin_requests_one_pending;
CREATE UNIQUE INDEX club_admin_requests_one_live
  ON club_admin_requests (lower(email), affiliation_number)
  WHERE status IN ('pending_club', 'pending_admin');

-- Looking a request up by its confirmation token is the correspondent's whole
-- interaction with the app, and it happens with no session.
CREATE INDEX club_admin_requests_by_token ON club_admin_requests (club_token_hash);
