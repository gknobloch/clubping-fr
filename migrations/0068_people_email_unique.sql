-- 0068 — one address, one person (#655, « 4 bis »)
--
--   people_email_unique   no two people sign in with the same address
--
-- #640 let a parent and a child share an address, so the parent could open
-- the child's profile; #655 gave that a name — the parent is the child's
-- DELEGATE — and the general admin turned each shared address into one
-- (« Adresses partagées », step 3). The API refuses a second person on an
-- address since #673. This makes it a fact of the schema.
--
-- **Only once no shared address is left in production**: an index that cannot
-- be built fails this migration, and the deploy with it. Check first, on the
-- production database:
--
--   SELECT lower(trim(email)), count(*) FROM people
--    WHERE email IS NOT NULL AND trim(email) != ''
--    GROUP BY 1 HAVING count(*) > 1;
--
-- must return nothing. Numbered after the drafts of steps 4 and 5 (0066,
-- 0067); wrangler applies whatever is unapplied, in order, whichever deploy
-- brings it.
--
-- Partial: a person with no address — a child whose parent is their delegate
-- — is not an address, and there may be many of them.
CREATE UNIQUE INDEX IF NOT EXISTS people_email_unique
  ON people (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) != '';
