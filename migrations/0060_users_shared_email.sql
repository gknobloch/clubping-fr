-- 0060 — several profiles behind one address (#640).
--
-- A parent and their child, both licensed at the club, often have one e-mail
-- address between them — the parent's. `users.email` was `UNIQUE`, so only one
-- of the two could carry it, and the other could never sign in: the code goes
-- out by e-mail. The address is now shared, and signing in with it reaches
-- every profile that carries it.
--
-- ## Why not rebuild `users` without the constraint
--
-- The constraint is part of the column definition, and its index
-- (`sqlite_autoindex_users_1`) cannot be dropped on its own; the usual answer
-- is to rebuild the table, as 0036 did. That is no longer an option: seven
-- tables reference users(id) ON DELETE CASCADE (avatars, season categories,
-- season licences, push tokens, notifications sent, member groups, training
-- availabilities), D1 enforces foreign keys, and `DROP TABLE users` performs
-- an implicit DELETE that cascades through every one of them — silently, as
-- #604 learnt for `competitions`. 0036 parked and restored one child table to
-- get round it; seven, on the live database, is not a migration worth the risk.
--
-- ## What this does instead
--
-- The constrained column is renamed out of the way and a plain `email` column
-- takes its name. Every statement in the code already says `email`, so nothing
-- has to change to keep reading and writing the address — which is also what
-- makes this a single deploy (#410): the worker still serving requests between
-- this migration and the swap reads the new `email`, holding exactly the values
-- it held a moment before, and writes to it the same way.
--
-- The renamed column is emptied, and stays: SQLite cannot drop a UNIQUE column
-- either. NULLs are distinct under UNIQUE, so it constrains nothing.

ALTER TABLE users RENAME COLUMN email TO email_pre_0060;

ALTER TABLE users ADD COLUMN email TEXT;

UPDATE users SET email = email_pre_0060, email_pre_0060 = NULL;

-- Every sign-in looks the address up case-insensitively, and so does the push
-- sweep, to find the profiles a device rings for.
CREATE INDEX IF NOT EXISTS users_by_email ON users (lower(email));
