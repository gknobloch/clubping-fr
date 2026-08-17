-- Demo club for App Store / Play Store review (#398).
--
-- The review sign-in account (clubping.demo@leskno.fr, #396) must land in a
-- POPULATED app without exposing any real member's personal data. This seeds a
-- fully self-contained, fictional club and repoints that account at it.
--
-- Conventions that make it safe and re-runnable:
--   * Every id is prefixed `demo-`; every player email is on `.invalid`.
--   * The demo teams attach to the EXISTING active phase, never a new one —
--     the app enforces a single active phase (phases.status='active'), and a
--     second active phase would be silently hidden. The phase id is resolved
--     at insert time with a subquery, so this file is identical local vs prod.
--   * The upcoming-match widget shows games with date >= today, so one match
--     day is dated far in the future to always have an upcoming fixture.
--   * Idempotent: every `demo-%` row (and the demo players) is deleted first,
--     then re-inserted. Safe to run repeatedly.
--
-- Apply:  npx wrangler d1 execute clubping-fr-prod --remote --file=seed-demo.sql
-- Local:  npx wrangler d1 execute clubping-fr-prod --local  --file=seed-demo.sql

-- ---------------------------------------------------------------------------
-- Clean up any previous run (children before parents).
-- ---------------------------------------------------------------------------
DELETE FROM game_availabilities WHERE game_id LIKE 'demo-%';
DELETE FROM game_selections     WHERE team_id LIKE 'demo-%';
DELETE FROM games               WHERE id LIKE 'demo-%';
DELETE FROM match_days          WHERE id LIKE 'demo-%';
DELETE FROM player_phase_points WHERE player_id LIKE 'demo-%';
DELETE FROM teams               WHERE id LIKE 'demo-%';
DELETE FROM groups              WHERE id LIKE 'demo-%';
DELETE FROM divisions           WHERE id LIKE 'demo-%';
DELETE FROM club_addresses      WHERE id LIKE 'demo-%';
DELETE FROM users               WHERE id LIKE 'demo-player-%';
DELETE FROM clubs               WHERE id LIKE 'demo-%';

-- ---------------------------------------------------------------------------
-- Clubs — the demo club plus three fictional opponents.
-- ---------------------------------------------------------------------------
INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
  ('demo-club',       '09990001', 'Club Démo Pongiste', 0),
  ('demo-club-adv-a', '09990002', 'Démo TT Alpha',      0),
  ('demo-club-adv-b', '09990003', 'Démo TT Bravo',      0),
  ('demo-club-adv-c', '09990004', 'Démo TT Charlie',    0);

INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES
  ('demo-addr-1', 'demo-club', 'Gymnase Démo', '1 rue de la Démonstration', '68000', 'Démoville', 1);

-- ---------------------------------------------------------------------------
-- Users — the review admin (repointed) and a fabricated roster of 10 players.
-- ---------------------------------------------------------------------------
-- Repoint the review account (created in #396) at the demo club.
INSERT OR REPLACE INTO users
  (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id)
VALUES
  ('user-appstore-demo', 'clubping.demo@leskno.fr', 'club_admin', 0, 'Démo', 'App Store', NULL, '', NULL, NULL, 'active', 'demo-club');

INSERT INTO users
  (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id)
VALUES
  ('demo-player-1',  'alex.martin@demo.clubping.invalid',    'player', 1, 'Alex',    'Martin',    '99990001', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-2',  'camille.durand@demo.clubping.invalid', 'player', 1, 'Camille', 'Durand',    '99990002', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-3',  'sam.petit@demo.clubping.invalid',      'player', 1, 'Sam',     'Petit',     '99990003', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-4',  'lea.moreau@demo.clubping.invalid',     'player', 1, 'Léa',     'Moreau',    '99990004', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-5',  'noah.fontaine@demo.clubping.invalid',  'player', 1, 'Noah',    'Fontaine',  '99990005', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-6',  'jade.robert@demo.clubping.invalid',    'player', 1, 'Jade',    'Robert',    '99990006', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-7',  'hugo.girard@demo.clubping.invalid',    'player', 1, 'Hugo',    'Girard',    '99990007', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-8',  'manon.bonnet@demo.clubping.invalid',   'player', 1, 'Manon',   'Bonnet',    '99990008', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-9',  'louis.dupont@demo.clubping.invalid',   'player', 1, 'Louis',   'Dupont',    '99990009', '', NULL, NULL, 'active', 'demo-club'),
  ('demo-player-10', 'emma.lambert@demo.clubping.invalid',   'player', 1, 'Emma',    'Lambert',   '99990010', '', NULL, NULL, 'active', 'demo-club');

-- ---------------------------------------------------------------------------
-- Divisions — attached to the active phase via subquery (single-active
-- invariant: exactly one row has status='active').
-- ---------------------------------------------------------------------------
INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier)
SELECT 'demo-div-1', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1),
       'Démo Division 1', 1, 4, 0, NULL, 'DEMO-D1';
INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier)
SELECT 'demo-div-2', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1),
       'Démo Division 2', 2, 4, 0, 'demo-div-1', 'DEMO-D2';

-- ---------------------------------------------------------------------------
-- Groups — one per division, each with the demo team plus three opponents.
-- ---------------------------------------------------------------------------
INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id) VALUES
  ('demo-grp-1', 'demo-div-1', 1, '["demo-team-1","demo-opp-a1","demo-opp-b1","demo-opp-c1"]', 0, NULL),
  ('demo-grp-2', 'demo-div-2', 1, '["demo-team-2","demo-opp-a2","demo-opp-b2","demo-opp-c2"]', 0, NULL);

-- ---------------------------------------------------------------------------
-- Teams — two for the demo club (with rosters), plus empty-roster opponents.
-- phase_id resolved from the active phase, as with divisions above.
-- ---------------------------------------------------------------------------
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-team-1', 'demo-club', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1),
       1, 'demo-grp-1', 'demo-addr-1', 'Samedi', '17h00', 'demo-player-1',
       '["demo-player-1","demo-player-2","demo-player-3","demo-player-4","demo-player-5"]', '#1d4ed8', NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-team-2', 'demo-club', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1),
       2, 'demo-grp-2', 'demo-addr-1', 'Samedi', '17h00', 'demo-player-6',
       '["demo-player-6","demo-player-7","demo-player-8","demo-player-9","demo-player-10"]', '#b91c1c', NULL, 0;

-- Opponent teams: empty rosters, no captain/location (mirrors seed.sql). One
-- statement each — D1 caps terms in a compound (UNION ALL) subquery, and the
-- phase-id subquery has to sit inside the SELECT, so a derived VALUES list is
-- not an option here.
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-a1', 'demo-club-adv-a', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 1, 'demo-grp-1', '', '', '', '', '[]', NULL, NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-b1', 'demo-club-adv-b', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 1, 'demo-grp-1', '', '', '', '', '[]', NULL, NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-c1', 'demo-club-adv-c', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 1, 'demo-grp-1', '', '', '', '', '[]', NULL, NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-a2', 'demo-club-adv-a', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 2, 'demo-grp-2', '', '', '', '', '[]', NULL, NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-b2', 'demo-club-adv-b', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 2, 'demo-grp-2', '', '', '', '', '[]', NULL, NULL, 0;
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, color, whatsapp_link, is_archived)
SELECT 'demo-opp-c2', 'demo-club-adv-c', (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 2, 'demo-grp-2', '', '', '', '', '[]', NULL, NULL, 0;

-- ---------------------------------------------------------------------------
-- Player points for the active phase (stored as text, as in seed.sql).
-- ---------------------------------------------------------------------------
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-1', '1520';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-2', '1390';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-3', '1240';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-4', '1105';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-5', '980';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-6', '1460';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-7', '1315';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-8', '1190';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-9', '1040';
INSERT INTO player_phase_points (phase_id, player_id, points)
SELECT (SELECT id FROM phases WHERE status = 'active' ORDER BY id LIMIT 1), 'demo-player-10', '905';

-- ---------------------------------------------------------------------------
-- Match days — three per group. The last is far in the future so the Accueil
-- "prochain match" widget always has an upcoming fixture (date >= today).
-- ---------------------------------------------------------------------------
INSERT INTO match_days (id, group_id, number, date) VALUES
  ('demo-md-1-1', 'demo-grp-1', 1, '2026-09-12'),
  ('demo-md-1-2', 'demo-grp-1', 2, '2026-10-10'),
  ('demo-md-1-3', 'demo-grp-1', 3, '2030-05-18'),
  ('demo-md-2-1', 'demo-grp-2', 1, '2026-09-12'),
  ('demo-md-2-2', 'demo-grp-2', 2, '2026-10-10'),
  ('demo-md-2-3', 'demo-grp-2', 3, '2030-05-18');

-- ---------------------------------------------------------------------------
-- Games — one per match day involving each demo team (home/away alternating).
-- ---------------------------------------------------------------------------
INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time) VALUES
  ('demo-g-1-1', 'demo-md-1-1', 'demo-team-1', 'demo-opp-a1', NULL),
  ('demo-g-1-2', 'demo-md-1-2', 'demo-opp-b1', 'demo-team-1', NULL),
  ('demo-g-1-3', 'demo-md-1-3', 'demo-team-1', 'demo-opp-c1', NULL),
  ('demo-g-2-1', 'demo-md-2-1', 'demo-team-2', 'demo-opp-a2', NULL),
  ('demo-g-2-2', 'demo-md-2-2', 'demo-opp-b2', 'demo-team-2', NULL),
  ('demo-g-2-3', 'demo-md-2-3', 'demo-team-2', 'demo-opp-c2', NULL);

-- ---------------------------------------------------------------------------
-- Selections on the first match day of each team (four players out).
-- ---------------------------------------------------------------------------
INSERT INTO game_selections (game_id, team_id, player_ids) VALUES
  ('demo-g-1-1', 'demo-team-1', '["demo-player-1","demo-player-2","demo-player-3","demo-player-4"]'),
  ('demo-g-2-1', 'demo-team-2', '["demo-player-6","demo-player-7","demo-player-8","demo-player-9"]');

-- ---------------------------------------------------------------------------
-- Availabilities on the upcoming (far-future) games, so the widget and the
-- game modal's disponibilités list are populated.
-- ---------------------------------------------------------------------------
INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) VALUES
  ('demo-g-1-3', 'demo-player-1', 'available',   NULL),
  ('demo-g-1-3', 'demo-player-2', 'maybe',       NULL),
  ('demo-g-1-3', 'demo-player-3', 'unavailable', 'captain'),
  ('demo-g-1-3', 'demo-player-4', 'available',   NULL),
  ('demo-g-2-3', 'demo-player-6', 'available',   NULL),
  ('demo-g-2-3', 'demo-player-7', 'unavailable', NULL);
