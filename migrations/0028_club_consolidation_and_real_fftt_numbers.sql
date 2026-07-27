-- #277: finish the club cleanup #275 could not finish on its own.
--
-- 0024 deliberately refused to touch a club whose target id was already taken,
-- because it had no way to tell a genuine duplicate from two different clubs
-- that collided on one affiliation number. That judgement has now been made by
-- hand, per pair, against production — so this migration does the three
-- consolidations and two renames explicitly, by id, rather than by rule.
--
-- Consolidations (keep <- remove):
--   club-fftt-06680128  <- 06680128            Bergheim CSS
--   club-fftt-06680123  <- 06680123            Ensisheim TTMC
--   club-fftt-06100002  <- club-fftt-99000005  Troyes OS - Noës TT
--
-- Two of those carry a DIFFERENT club's rows, confirmed against production and
-- accepted deliberately: 06680128 holds p2-opp-eloyes-1 and an Eloyes address
-- (next to doc-06680128-1, which is genuinely Bergheim), and 06680123 holds
-- p2-opp-staffelfelden-1 and a Staffelfelden address. Nothing is deleted, so
-- those rows survive under Bergheim / Ensisheim and stay visible and editable
-- in the UI. Consolidating Ensisheim also leaves two teams numbered 1 in
-- phase-26-2 (p2-opp-staffelfelden-1 and p2-opp-ttmcensisheim-1) — expected,
-- to be sorted out by hand rather than by a migration that cannot know which
-- one is right.
--
-- Renames (the #252 synthetics whose real FFTT number is now known):
--   club-fftt-99000001  -> club-fftt-06670058   Benfeld,   affiliation 06670058
--   club-fftt-99000003  -> club-fftt-06880010   Saint-Dié, affiliation 06880010
-- Both targets were verified free before writing this.
--
-- club_logos.club_id REFERENCES clubs(id) ON DELETE CASCADE with no
-- ON UPDATE CASCADE, so — as 0018/0020/0024 all spell out — a club row is
-- never updated in place: insert the survivor, repoint every dependent, then
-- delete. Here the survivor already exists for the three consolidations, so
-- only the repoint-then-delete half applies.
--
-- Re-run safety: naturally idempotent. Every statement is keyed on a source id
-- that no longer exists after the first run, so a redeploy matches zero rows.

DROP TABLE IF EXISTS club_consolidation;

CREATE TABLE club_consolidation (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL
);

-- The pairs, as data. (A `VALUES ... AS x(a, b)` inline table would read
-- better, but D1's SQLite rejects the column-alias form.)
DROP TABLE IF EXISTS club_pairs;
CREATE TABLE club_pairs (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
INSERT INTO club_pairs (old_id, new_id) VALUES
  ('06680128',           'club-fftt-06680128'),
  ('06680123',           'club-fftt-06680123'),
  ('club-fftt-99000005', 'club-fftt-06100002');

-- Only pairs where BOTH rows are still present: on a re-run, or on a database
-- that never had the duplicate, this comes out empty.
INSERT INTO club_consolidation (old_id, new_id)
SELECT p.old_id, p.new_id
FROM club_pairs p
JOIN clubs o ON o.id = p.old_id
JOIN clubs n ON n.id = p.new_id;

DROP TABLE club_pairs;

-- Addresses coming from the row being removed must not arrive as a second
-- default: the surviving club keeps the default it already has.
UPDATE club_addresses
SET is_default = 0
WHERE club_id IN (SELECT old_id FROM club_consolidation)
  AND EXISTS (
    SELECT 1 FROM club_addresses d
    WHERE d.club_id = (SELECT new_id FROM club_consolidation WHERE old_id = club_addresses.club_id)
      AND d.is_default = 1
  );

UPDATE club_addresses
SET club_id = (SELECT new_id FROM club_consolidation WHERE old_id = club_addresses.club_id)
WHERE club_id IN (SELECT old_id FROM club_consolidation);

UPDATE club_channels
SET club_id = (SELECT new_id FROM club_consolidation WHERE old_id = club_channels.club_id)
WHERE club_id IN (SELECT old_id FROM club_consolidation);

UPDATE teams
SET club_id = (SELECT new_id FROM club_consolidation WHERE old_id = teams.club_id)
WHERE club_id IN (SELECT old_id FROM club_consolidation);

UPDATE users
SET club_id = (SELECT new_id FROM club_consolidation WHERE old_id = users.club_id)
WHERE club_id IN (SELECT old_id FROM club_consolidation);

-- club_logos.club_id is the primary key, so a logo only moves onto a survivor
-- that has none; any leftover disappears with its club row below via the FK
-- cascade — a duplicate logo of the same club, nothing else.
UPDATE club_logos
SET club_id = (SELECT new_id FROM club_consolidation WHERE old_id = club_logos.club_id)
WHERE club_id IN (SELECT old_id FROM club_consolidation)
  AND NOT EXISTS (
    SELECT 1 FROM club_logos e
    WHERE e.club_id = (SELECT new_id FROM club_consolidation WHERE old_id = club_logos.club_id)
  );

-- The survivor may still be missing the affiliation number the removed row
-- carried (Troyes: club-fftt-06100002 has it, the synthetic did not — but keep
-- this general).
UPDATE clubs
SET affiliation_number = (
  SELECT o.affiliation_number FROM clubs o
  JOIN club_consolidation m ON m.old_id = o.id
  WHERE m.new_id = clubs.id AND o.affiliation_number IS NOT NULL AND o.affiliation_number != ''
)
WHERE (affiliation_number IS NULL OR affiliation_number = '')
  AND id IN (SELECT new_id FROM club_consolidation)
  AND EXISTS (
    SELECT 1 FROM clubs o JOIN club_consolidation m ON m.old_id = o.id
    WHERE m.new_id = clubs.id AND o.affiliation_number IS NOT NULL AND o.affiliation_number != ''
  );

DELETE FROM clubs WHERE id IN (SELECT old_id FROM club_consolidation);

DROP TABLE club_consolidation;

-- === Synthetic ids replaced by the real FFTT numbers ===

DROP TABLE IF EXISTS club_renumber;

CREATE TABLE club_renumber (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL,
  affiliation_number TEXT NOT NULL
);

DROP TABLE IF EXISTS club_renumber_src;
CREATE TABLE club_renumber_src (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL, aff TEXT NOT NULL);
INSERT INTO club_renumber_src (old_id, new_id, aff) VALUES
  ('club-fftt-99000001', 'club-fftt-06670058', '06670058'),
  ('club-fftt-99000003', 'club-fftt-06880010', '06880010');

INSERT INTO club_renumber (old_id, new_id, affiliation_number)
SELECT r.old_id, r.new_id, r.aff
FROM club_renumber_src r
JOIN clubs o ON o.id = r.old_id
WHERE NOT EXISTS (SELECT 1 FROM clubs t WHERE t.id = r.new_id);

DROP TABLE club_renumber_src;

INSERT INTO clubs (id, affiliation_number, display_name, is_archived)
SELECT r.new_id, r.affiliation_number, c.display_name, c.is_archived
FROM clubs c
JOIN club_renumber r ON r.old_id = c.id;

UPDATE club_addresses
SET club_id = (SELECT new_id FROM club_renumber WHERE old_id = club_addresses.club_id)
WHERE club_id IN (SELECT old_id FROM club_renumber);

UPDATE club_channels
SET club_id = (SELECT new_id FROM club_renumber WHERE old_id = club_channels.club_id)
WHERE club_id IN (SELECT old_id FROM club_renumber);

UPDATE club_logos
SET club_id = (SELECT new_id FROM club_renumber WHERE old_id = club_logos.club_id)
WHERE club_id IN (SELECT old_id FROM club_renumber);

UPDATE teams
SET club_id = (SELECT new_id FROM club_renumber WHERE old_id = teams.club_id)
WHERE club_id IN (SELECT old_id FROM club_renumber);

UPDATE users
SET club_id = (SELECT new_id FROM club_renumber WHERE old_id = users.club_id)
WHERE club_id IN (SELECT old_id FROM club_renumber);

DELETE FROM clubs WHERE id IN (SELECT old_id FROM club_renumber);

DROP TABLE club_renumber;
