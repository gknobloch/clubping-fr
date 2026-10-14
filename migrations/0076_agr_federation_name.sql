-- #739 — the AGR is « AGR Tennis de Table », not « … — Section du Haut-Rhin ».
--
-- 0061 named the federation after the one section the app started with. Since
-- #692 the Haut-Rhin and the Bas-Rhin are the AGR's ORGANISATIONS: the
-- department is read off a club's or a division's organisation, and the
-- federation's name no longer carries it.
--
-- Data only, so one deploy: the web and the app both read the name from
-- /data, and an installed 1.8.0 shows the new one at its next refresh.
-- Only the seeded name is replaced — one written since by hand is kept.
UPDATE federations
   SET display_name = 'AGR Tennis de Table'
 WHERE id = 'agr' AND display_name = 'AGR Tennis de table — Section du Haut-Rhin';
