-- 0063 — a person behind every club profile (#655, first step)
--
--   people           who someone is: name, birth, address, phone
--   users.person_id  the person a club profile belongs to
--
-- A `users` row mixed two things: the PERSON (name, birth, the address that
-- signs in) and their PLACE IN ONE CLUB (club, status, player or not, licences,
-- role). With one club each, nothing told them apart. Since #640 and #642 two
-- workarounds lean on the e-mail address instead: a parent and a child share
-- one so the parent can open the child's profile, and Gilles is two rows —
-- Rixheim for the FFTT, Landser for the AGR — tied together by an equal string.
--
-- ## `users` becomes the club profile; nothing is renamed or rebuilt
--
-- `users.id` is what thirty-odd player_id / user_id / captain_id columns, six
-- ON DELETE CASCADE foreign keys and three JSON arrays (teams.player_ids,
-- game_selections.player_ids, trainings.manager_ids) point at. Rebuilding or
-- renaming the table is the trap of 0036, #604 and 0060. So the person is added
-- BESIDE it, and every id stays what it is.
--
-- ## The person's fields stay on `users`, as a mirror
--
-- The API reads names and addresses off `users` in some 140 places. Rather
-- than move every read in one deploy, the columns stay and are kept equal to
-- the person's: a write goes to `people` and to every profile of that person
-- (`writePerson` in the API). Reads move later, and the columns go after that,
-- in their own deploys (#410).
--
-- ## The backfill
--
-- One person per row, then the rows that share an address AND a name are folded
-- into one — #640's rule, "même adresse et même nom, c'est la même personne".
-- That is Gilles at two clubs. A parent and a child sharing an address keep two
-- people: the names differ, and nothing here can tell which one is the parent.
-- Folded people keep the first non-blank phone and birth details of their
-- profiles, which are then made equal to it — a mirror that disagrees with
-- itself is no mirror.
--
-- No foreign key from users.person_id: a person must never take a club profile
-- with it on delete, which is exactly what a cascade here would do.

CREATE TABLE IF NOT EXISTS people (
  id           TEXT PRIMARY KEY NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  email        TEXT,
  phone        TEXT,
  birth_date   TEXT,
  birth_place  TEXT
);

ALTER TABLE users ADD COLUMN person_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_person ON users (person_id);

INSERT OR IGNORE INTO people (id, first_name, last_name, email, phone, birth_date, birth_place)
  SELECT 'person-' || id, first_name, last_name, email, phone, birth_date, birth_place FROM users;
UPDATE users SET person_id = 'person-' || id WHERE person_id IS NULL;

-- Same address and same name: the same person, whatever the club. The
-- person kept is the OLDEST profile's — the one the club first typed in or
-- imported, whose spelling the others were copied from.
UPDATE users SET person_id = (
  SELECT u2.person_id FROM users u2
   WHERE lower(trim(u2.email)) = lower(trim(users.email))
     AND lower(trim(COALESCE(u2.first_name, ''))) = lower(trim(COALESCE(users.first_name, '')))
     AND lower(trim(COALESCE(u2.last_name, ''))) = lower(trim(COALESCE(users.last_name, '')))
   ORDER BY u2.rowid LIMIT 1
)
WHERE email IS NOT NULL AND trim(email) != ''
  AND trim(COALESCE(first_name, '')) != '' AND trim(COALESCE(last_name, '')) != '';

DELETE FROM people WHERE id NOT IN (SELECT person_id FROM users WHERE person_id IS NOT NULL);

-- A folded person takes what any of its profiles knew.
UPDATE people SET
  phone = COALESCE(NULLIF(trim(COALESCE(phone, '')), ''),
    (SELECT u.phone FROM users u WHERE u.person_id = people.id AND trim(COALESCE(u.phone, '')) != '' LIMIT 1), phone),
  birth_date = COALESCE(birth_date,
    (SELECT u.birth_date FROM users u WHERE u.person_id = people.id AND u.birth_date IS NOT NULL LIMIT 1)),
  birth_place = COALESCE(birth_place,
    (SELECT u.birth_place FROM users u WHERE u.person_id = people.id AND u.birth_place IS NOT NULL LIMIT 1));

-- And every profile mirrors its person.
UPDATE users SET
  first_name = (SELECT p.first_name FROM people p WHERE p.id = users.person_id),
  last_name = (SELECT p.last_name FROM people p WHERE p.id = users.person_id),
  email = (SELECT p.email FROM people p WHERE p.id = users.person_id),
  phone = (SELECT p.phone FROM people p WHERE p.id = users.person_id),
  birth_date = (SELECT p.birth_date FROM people p WHERE p.id = users.person_id),
  birth_place = (SELECT p.birth_place FROM people p WHERE p.id = users.person_id)
WHERE person_id IN (SELECT person_id FROM users GROUP BY person_id HAVING COUNT(*) > 1);
