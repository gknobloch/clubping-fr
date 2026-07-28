-- Seed data generated from src/mock/data.ts

-- seasons
INSERT INTO seasons (id, display_name, status) VALUES
  ('26', '2025/2026', 'active');

-- phases
INSERT INTO phases (id, season_id, name, display_name, status) VALUES
  ('phase-26-1', '26', 'Phase 1', '2025/2026 Phase 1', 'active');

-- divisions
-- Ids, identifiers and names are the real FFTT ones for 2025/2026 Phase 1
-- (#275). GE 1 -> GE 5 form a parent chain (#236); GE 6/GE 7 are orphans here,
-- same as real FFTT data (see src/mock/data.ts for the rationale).
INSERT INTO divisions (id, phase_id, display_name, rank, players_per_game, is_archived, parent_id, identifier) VALUES
  ('198609', 'phase-26-1', 'GE 1', 1, 4, 0, NULL, 'GE1P1'),
  ('198755', 'phase-26-1', 'GE 2', 2, 4, 0, '198609', 'GE2P1'),
  ('198305', 'phase-26-1', 'GE 3', 3, 4, 0, '198755', 'GE3P1'),
  ('198821', 'phase-26-1', 'GE 4', 4, 4, 0, '198305', 'GE4P1'),
  ('198895', 'phase-26-1', 'GE 5', 5, 4, 0, '198821', 'GE5P1'),
  ('198435', 'phase-26-1', 'GE 6', 6, 3, 0, NULL, 'GE6P1'),
  ('198907', 'phase-26-1', 'GE 7', 7, 3, 0, NULL, 'GE7P1');

-- clubs
INSERT INTO clubs (id, affiliation_number, display_name, is_archived) VALUES
  ('club-fftt-06680011', '06680011', 'PPA Rixheim', 0),
  ('club-fftt-06880123', '06880123', 'Etival', 0),
  ('club-fftt-06680125', '06680125', 'Rosenau', 0),
  ('club-fftt-06670045', '06670045', 'RC Strasbourg', 0),
  ('club-fftt-06880022', '06880022', 'Vittel St Remy', 0),
  ('club-fftt-06680091', '06680091', 'Illzach', 0),
  ('club-fftt-06100004', '06100004', 'Moussey', 0),
  ('club-fftt-06880002', '06880002', 'Anould', 0),
  ('club-fftt-06680004', '06680004', 'Colmar MJC', 0),
  ('club-fftt-06680080', '06680080', 'Colmar AJE', 0),
  ('club-fftt-06680082', '06680082', 'Saint-Louis', 0),
  ('club-fftt-06680102', '06680102', 'Huningue', 0),
  ('club-fftt-06680090', '06680090', 'Ingersheim', 0),
  ('club-fftt-06680071', '06680071', 'Issenheim', 0),
  ('club-fftt-06680116', '06680116', 'Wintzfelden', 0),
  ('club-fftt-06680111', '06680111', 'Thann', 0),
  ('club-fftt-06680138', '06680138', 'Soultz', 0),
  ('club-fftt-06680118', '06680118', 'Wittelsheim', 0),
  ('club-fftt-06680006', '06680006', 'FC Mulhouse', 0),
  ('club-fftt-06680140', '06680140', 'Kembs', 0),
  ('club-fftt-06680123', '06680123', 'Ensisheim TTMC', 0),
  ('club-fftt-06880064', '06880064', 'Ballons des Vosges', 0),
  ('club-fftt-06680105', '06680105', 'Mulhouse TT', 0);

-- club_addresses
INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) VALUES
  ('addr-1', 'club-fftt-06680011', 'Gymnase principal', '12 rue du Sport', '68170', 'Rixheim', 1),
  ('addr-2', 'club-fftt-06680011', 'Salle annexe', '5 avenue des Lilas', '68170', 'Rixheim', 0),
  ('addr-etival', 'club-fftt-06880123', 'Salle', '1 rue du Sport', '68000', 'Etival', 1),
  ('addr-rosenau', 'club-fftt-06680125', 'Salle', '1 rue du Sport', '68000', 'Rosenau', 1),
  ('addr-rcs', 'club-fftt-06670045', 'Salle', '1 rue du Sport', '68000', 'Strasbourg', 1),
  ('addr-vittel', 'club-fftt-06880022', 'Salle', '1 rue du Sport', '68000', 'Vittel', 1),
  ('addr-illzach', 'club-fftt-06680091', 'Salle', '1 rue du Sport', '68000', 'Illzach', 1),
  ('addr-moussey', 'club-fftt-06100004', 'Salle', '1 rue du Sport', '68000', 'Moussey', 1),
  ('addr-anould', 'club-fftt-06880002', 'Salle', '1 rue du Sport', '68000', 'Anould', 1),
  ('addr-cmjc', 'club-fftt-06680004', 'Salle', '1 rue du Sport', '68000', 'Colmar', 1),
  ('addr-caje', 'club-fftt-06680080', 'Salle', '1 rue du Sport', '68000', 'Colmar', 1),
  ('addr-stlouis', 'club-fftt-06680082', 'Salle', '1 rue du Sport', '68000', 'Saint-Louis', 1),
  ('addr-huningue', 'club-fftt-06680102', 'Salle', '1 rue du Sport', '68000', 'Huningue', 1),
  ('addr-ingersheim', 'club-fftt-06680090', 'Salle', '1 rue du Sport', '68000', 'Ingersheim', 1),
  ('addr-issenheim', 'club-fftt-06680071', 'Salle', '1 rue du Sport', '68000', 'Issenheim', 1),
  ('addr-wintzfelden', 'club-fftt-06680116', 'Salle', '1 rue du Sport', '68000', 'Wintzfelden', 1),
  ('addr-thann', 'club-fftt-06680111', 'Salle', '1 rue du Sport', '68000', 'Thann', 1),
  ('addr-soultz', 'club-fftt-06680138', 'Salle', '1 rue du Sport', '68000', 'Soultz', 1),
  ('addr-wittelsheim', 'club-fftt-06680118', 'Salle', '1 rue du Sport', '68000', 'Wittelsheim', 1),
  ('addr-fcm', 'club-fftt-06680006', 'Salle', '1 rue du Sport', '68000', 'Mulhouse', 1),
  ('addr-kembs', 'club-fftt-06680140', 'Salle', '1 rue du Sport', '68000', 'Kembs', 1),
  ('addr-ensisheim', 'club-fftt-06680123', 'Salle', '1 rue du Sport', '68000', 'Ensisheim', 1),
  ('addr-ballons', 'club-fftt-06880064', 'Salle', '1 rue du Sport', '68000', 'Ballons des Vosges', 1),
  ('addr-mutt', 'club-fftt-06680105', 'Salle', '1 rue du Sport', '68000', 'Mulhouse', 1);

-- groups
-- group_id (FFTT pool id, #278) is NULL here: the seed's groups are local,
-- not imported from FFTT.
INSERT INTO groups (id, division_id, number, team_ids, is_archived, group_id) VALUES
  ('group-1', '198609', 1, '["team-1","opp-etival-1","opp-rosenau-1","opp-rcs-2","opp-vittel-1","opp-illzach-2","opp-moussey-1","opp-anould-2"]', 0, NULL),
  ('group-2', '198755', 1, '["team-2","opp-illzach-3","opp-rosenau-2","opp-cmjc-3","opp-caje-1","opp-stlouis-1","opp-huningue-1","opp-ingersheim-1"]', 0, NULL),
  ('group-3', '198305', 1, '["team-3","opp-issenheim-1","opp-illzach-6","opp-wintzfelden-2","opp-huningue-2","opp-thann-2","opp-rosenau-4"]', 0, NULL),
  ('group-4', '198821', 1, '["team-4","opp-soultz-2","opp-wittelsheim-5","opp-illzach-8","opp-fcm-3","opp-kembs-2","opp-ensisheim-1","opp-rosenau-6"]', 0, NULL),
  ('group-5', '198895', 1, '["team-5","team-6","opp-issenheim-3","opp-illzach-7","opp-ballons-4","opp-mutt-5","opp-wittelsheim-4","opp-wintzfelden-3"]', 0, NULL),
  ('group-6', '198435', 1, '["team-7","opp-huningue-3","opp-mutt-7","opp-thann-5","opp-stlouis-3","opp-kembs-3","opp-illzach-10","opp-soultz-4"]', 0, NULL),
  ('group-7', '198907', 1, '["team-8","opp-rosenau-7","opp-thann-4","opp-issenheim-4","opp-huningue-4","opp-kembs-6","opp-kembs-4","opp-illzach-11"]', 0, NULL);

-- players

-- teams (PPA Rixheim)
-- division_id dropped in 0031 (#282): the group holds the division.
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, roster_initial_points, color, whatsapp_link, is_archived) VALUES
  ('team-1', 'club-fftt-06680011', 'phase-26-1', 1, 'group-1', 'addr-1', 'Samedi', '16h00', 'p2-player-5', '["p2-player-5","p2-player-1","p2-player-2","p2-player-3","p2-player-4"]', '{"p2-player-5":"1887","p2-player-1":"1763","p2-player-2":"1665","p2-player-3":"1647","p2-player-4":"1566"}', '#374151', NULL, 0),
  ('team-2', 'club-fftt-06680011', 'phase-26-1', 2, 'group-2', 'addr-1', 'Samedi', '16h00', 'p2-player-6', '["p2-player-6","p2-player-10","p2-player-7","p2-player-9","p2-player-8"]', '{"p2-player-6":"1791","p2-player-10":"1661","p2-player-7":"1500","p2-player-9":"1301","p2-player-8":"1301"}', '#b91c1c', NULL, 0),
  ('team-3', 'club-fftt-06680011', 'phase-26-1', 3, 'group-3', 'addr-1', 'Samedi', '16h00', 'p2-player-12', '["p2-player-12","p2-player-13","p2-player-14","p2-player-11","p2-player-17"]', '{"p2-player-12":"1356","p2-player-13":"1267","p2-player-14":"1198","p2-player-11":"1186","p2-player-17":"754"}', '#15803d', NULL, 0),
  ('team-4', 'club-fftt-06680011', 'phase-26-1', 4, 'group-4', 'addr-1', 'Jeudi', '20h00', 'p2-player-16', '["p2-player-16","p2-player-19","p2-player-18","p2-player-15","p2-player-20"]', '{"p2-player-16":"889","p2-player-19":"728","p2-player-18":"727","p2-player-15":"713","p2-player-20":"704"}', '#c2410c', NULL, 0),
  ('team-5', 'club-fftt-06680011', 'phase-26-1', 5, 'group-5', 'addr-1', 'Samedi', '16h00', 'p2-player-23', '["p2-player-22","p2-player-24","p2-player-21","p2-player-23","p2-player-26"]', '{"p2-player-22":"735","p2-player-24":"701","p2-player-21":"702","p2-player-23":"1050","p2-player-26":"707"}', '#1d4ed8', NULL, 0),
  ('team-6', 'club-fftt-06680011', 'phase-26-1', 6, 'group-5', 'addr-2', 'Samedi', '16h00', 'p2-player-42', '["p2-player-29","p2-player-39","p2-player-40","p2-player-41","p2-player-42","p2-player-38","p2-player-43","p2-player-44"]', '{"p2-player-29":"632","p2-player-39":"500","p2-player-40":"503","p2-player-41":"561","p2-player-42":"500","p2-player-38":"500","p2-player-43":"500","p2-player-44":"500"}', '#be185d', NULL, 0),
  ('team-7', 'club-fftt-06680011', 'phase-26-1', 7, 'group-6', 'addr-1', 'Jeudi', '20h00', 'p2-player-33', '["p2-player-33","p2-player-35","p2-player-34","p2-player-36","p2-player-37"]', '{"p2-player-33":"500","p2-player-35":"500","p2-player-34":"500","p2-player-36":"500","p2-player-37":"500"}', '#7c2d12', NULL, 0),
  ('team-8', 'club-fftt-06680011', 'phase-26-1', 8, 'group-7', 'addr-1', 'Jeudi', '20h00', 'p2-player-32', '["p2-player-32","p2-player-27","p2-player-28","p2-player-30","p2-player-31"]', '{"p2-player-32":"607","p2-player-27":"501","p2-player-28":"500","p2-player-30":"500","p2-player-31":"500"}', '#0d9488', NULL, 0);

-- teams (opponents)
-- division_id dropped in 0031 (#282): the group holds the division.
INSERT INTO teams (id, club_id, phase_id, number, group_id, game_location_id, default_day, default_time, captain_id, player_ids, roster_initial_points, color, whatsapp_link, is_archived) VALUES
  ('opp-etival-1', 'club-fftt-06880123', 'phase-26-1', 1, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rosenau-1', 'club-fftt-06680125', 'phase-26-1', 1, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rcs-2', 'club-fftt-06670045', 'phase-26-1', 2, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-vittel-1', 'club-fftt-06880022', 'phase-26-1', 1, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-2', 'club-fftt-06680091', 'phase-26-1', 2, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-moussey-1', 'club-fftt-06100004', 'phase-26-1', 1, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-anould-2', 'club-fftt-06880002', 'phase-26-1', 2, 'group-1', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-3', 'club-fftt-06680091', 'phase-26-1', 3, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rosenau-2', 'club-fftt-06680125', 'phase-26-1', 2, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-cmjc-3', 'club-fftt-06680004', 'phase-26-1', 3, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-caje-1', 'club-fftt-06680080', 'phase-26-1', 1, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-stlouis-1', 'club-fftt-06680082', 'phase-26-1', 1, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-huningue-1', 'club-fftt-06680102', 'phase-26-1', 1, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-ingersheim-1', 'club-fftt-06680090', 'phase-26-1', 1, 'group-2', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-issenheim-1', 'club-fftt-06680071', 'phase-26-1', 1, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-6', 'club-fftt-06680091', 'phase-26-1', 6, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-wintzfelden-2', 'club-fftt-06680116', 'phase-26-1', 2, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-huningue-2', 'club-fftt-06680102', 'phase-26-1', 2, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-thann-2', 'club-fftt-06680111', 'phase-26-1', 2, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rosenau-4', 'club-fftt-06680125', 'phase-26-1', 4, 'group-3', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-soultz-2', 'club-fftt-06680138', 'phase-26-1', 2, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-wittelsheim-5', 'club-fftt-06680118', 'phase-26-1', 5, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-8', 'club-fftt-06680091', 'phase-26-1', 8, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-fcm-3', 'club-fftt-06680006', 'phase-26-1', 3, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-kembs-2', 'club-fftt-06680140', 'phase-26-1', 2, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-ensisheim-1', 'club-fftt-06680123', 'phase-26-1', 1, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rosenau-6', 'club-fftt-06680125', 'phase-26-1', 6, 'group-4', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-issenheim-3', 'club-fftt-06680071', 'phase-26-1', 3, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-7', 'club-fftt-06680091', 'phase-26-1', 7, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-ballons-4', 'club-fftt-06880064', 'phase-26-1', 4, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-mutt-5', 'club-fftt-06680105', 'phase-26-1', 5, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-wittelsheim-4', 'club-fftt-06680118', 'phase-26-1', 4, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-wintzfelden-3', 'club-fftt-06680116', 'phase-26-1', 3, 'group-5', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-huningue-3', 'club-fftt-06680102', 'phase-26-1', 3, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-mutt-7', 'club-fftt-06680105', 'phase-26-1', 7, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-thann-5', 'club-fftt-06680111', 'phase-26-1', 5, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-stlouis-3', 'club-fftt-06680082', 'phase-26-1', 3, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-kembs-3', 'club-fftt-06680140', 'phase-26-1', 3, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-10', 'club-fftt-06680091', 'phase-26-1', 10, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-soultz-4', 'club-fftt-06680138', 'phase-26-1', 4, 'group-6', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-rosenau-7', 'club-fftt-06680125', 'phase-26-1', 7, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-thann-4', 'club-fftt-06680111', 'phase-26-1', 4, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-issenheim-4', 'club-fftt-06680071', 'phase-26-1', 4, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-huningue-4', 'club-fftt-06680102', 'phase-26-1', 4, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-kembs-6', 'club-fftt-06680140', 'phase-26-1', 6, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-kembs-4', 'club-fftt-06680140', 'phase-26-1', 4, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0),
  ('opp-illzach-11', 'club-fftt-06680091', 'phase-26-1', 11, 'group-7', '', '', '', '', '[]', NULL, NULL, NULL, 0);

-- match_days
INSERT INTO match_days (id, group_id, number, date) VALUES
  ('md-g1-1', 'group-1', 1, '2025-09-27'),
  ('md-g1-2', 'group-1', 2, '2025-10-11'),
  ('md-g1-3', 'group-1', 3, '2025-11-08'),
  ('md-g1-4', 'group-1', 4, '2025-11-15'),
  ('md-g1-5', 'group-1', 5, '2025-11-29'),
  ('md-g1-6', 'group-1', 6, '2025-12-13'),
  ('md-g1-7', 'group-1', 7, '2026-01-10'),
  ('md-g2-1', 'group-2', 1, '2025-09-27'),
  ('md-g2-2', 'group-2', 2, '2025-10-11'),
  ('md-g2-3', 'group-2', 3, '2025-11-08'),
  ('md-g2-4', 'group-2', 4, '2025-11-16'),
  ('md-g2-5', 'group-2', 5, '2025-11-29'),
  ('md-g2-6', 'group-2', 6, '2025-12-13'),
  ('md-g2-7', 'group-2', 7, '2026-01-10'),
  ('md-g3-1', 'group-3', 1, '2025-09-27'),
  ('md-g3-2', 'group-3', 2, '2025-10-10'),
  ('md-g3-3', 'group-3', 3, '2025-11-08'),
  ('md-g3-4', 'group-3', 4, '2025-11-14'),
  ('md-g3-5', 'group-3', 5, '2025-11-29'),
  ('md-g3-6', 'group-3', 6, '2025-12-13'),
  ('md-g3-7', 'group-3', 7, '2026-01-10'),
  ('md-g4-1', 'group-4', 1, '2025-09-22'),
  ('md-g4-2', 'group-4', 2, '2025-10-09'),
  ('md-g4-3', 'group-4', 3, '2025-11-05'),
  ('md-g4-4', 'group-4', 4, '2025-11-13'),
  ('md-g4-5', 'group-4', 5, '2025-11-27'),
  ('md-g4-6', 'group-4', 6, '2025-12-13'),
  ('md-g4-7', 'group-4', 7, '2026-01-08'),
  ('md-g5-1', 'group-5', 1, '2025-09-27'),
  ('md-g5-2', 'group-5', 2, '2025-10-11'),
  ('md-g5-3', 'group-5', 3, '2025-11-07'),
  ('md-g5-4', 'group-5', 4, '2025-11-15'),
  ('md-g5-5', 'group-5', 5, '2025-11-28'),
  ('md-g5-6', 'group-5', 6, '2025-12-13'),
  ('md-g5-7', 'group-5', 7, '2026-01-10'),
  ('md-g6-1', 'group-6', 1, '2025-09-25'),
  ('md-g6-2', 'group-6', 2, '2025-10-09'),
  ('md-g6-3', 'group-6', 3, '2025-11-08'),
  ('md-g6-4', 'group-6', 4, '2025-11-11'),
  ('md-g6-5', 'group-6', 5, '2025-11-27'),
  ('md-g6-6', 'group-6', 6, '2025-12-10'),
  ('md-g6-7', 'group-6', 7, '2026-01-08'),
  ('md-g7-1', 'group-7', 1, '2025-09-25'),
  ('md-g7-2', 'group-7', 2, '2025-10-09'),
  ('md-g7-3', 'group-7', 3, '2025-11-07'),
  ('md-g7-4', 'group-7', 4, '2025-11-13'),
  ('md-g7-5', 'group-7', 5, '2025-11-27'),
  ('md-g7-6', 'group-7', 6, '2025-12-09'),
  ('md-g7-7', 'group-7', 7, '2026-01-08'),
  -- "Retour" fixtures — SQL can't compute relative dates, so these use fixed
  -- far-future dates (re-seed with fresher ones if they ever stop being useful).
  ('md-g1-8', 'group-1', 8, '2030-06-01'),
  ('md-g6-8', 'group-6', 8, '2030-06-15');

-- games
INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time) VALUES
  ('g1-1', 'md-g1-1', 'opp-etival-1', 'team-1', NULL),
  ('g1-2', 'md-g1-2', 'opp-rosenau-1', 'team-1', NULL),
  ('g1-3', 'md-g1-3', 'opp-rcs-2', 'team-1', NULL),
  ('g1-4', 'md-g1-4', 'opp-vittel-1', 'team-1', NULL),
  ('g1-5', 'md-g1-5', 'opp-illzach-2', 'team-1', NULL),
  ('g1-6', 'md-g1-6', 'opp-moussey-1', 'team-1', NULL),
  ('g1-7', 'md-g1-7', 'opp-anould-2', 'team-1', NULL),
  ('g2-1', 'md-g2-1', 'opp-illzach-3', 'team-2', NULL),
  ('g2-2', 'md-g2-2', 'opp-rosenau-2', 'team-2', NULL),
  ('g2-3', 'md-g2-3', 'opp-cmjc-3', 'team-2', NULL),
  ('g2-4', 'md-g2-4', 'opp-caje-1', 'team-2', NULL),
  ('g2-5', 'md-g2-5', 'opp-stlouis-1', 'team-2', NULL),
  ('g2-6', 'md-g2-6', 'opp-huningue-1', 'team-2', NULL),
  ('g2-7', 'md-g2-7', 'opp-ingersheim-1', 'team-2', NULL),
  ('g3-1', 'md-g3-1', 'opp-issenheim-1', 'team-3', NULL),
  ('g3-2', 'md-g3-2', 'opp-illzach-6', 'team-3', '20h00'),
  ('g3-3', 'md-g3-3', 'opp-wintzfelden-2', 'team-3', NULL),
  ('g3-4', 'md-g3-4', 'opp-huningue-2', 'team-3', '20h00'),
  ('g3-5', 'md-g3-5', 'opp-thann-2', 'team-3', NULL),
  ('g3-6', 'md-g3-6', 'opp-rosenau-4', 'team-3', NULL),
  ('g4-1', 'md-g4-1', 'opp-soultz-2', 'team-4', '20h00'),
  ('g4-2', 'md-g4-2', 'opp-wittelsheim-5', 'team-4', NULL),
  ('g4-3', 'md-g4-3', 'opp-illzach-8', 'team-4', '20h00'),
  ('g4-4', 'md-g4-4', 'opp-fcm-3', 'team-4', NULL),
  ('g4-5', 'md-g4-5', 'opp-kembs-2', 'team-4', NULL),
  ('g4-6', 'md-g4-6', 'opp-ensisheim-1', 'team-4', '16h00'),
  ('g4-7', 'md-g4-7', 'opp-rosenau-6', 'team-4', NULL),
  ('g5-1', 'md-g5-1', 'team-6', 'team-5', NULL),
  ('g5-2', 'md-g5-2', 'opp-issenheim-3', 'team-5', NULL),
  ('g5-3', 'md-g5-3', 'opp-illzach-7', 'team-5', '20h00'),
  ('g5-4', 'md-g5-4', 'opp-ballons-4', 'team-5', '20h00'),
  ('g5-5', 'md-g5-5', 'opp-mutt-5', 'team-5', '20h00'),
  ('g5-6', 'md-g5-6', 'opp-wittelsheim-4', 'team-5', NULL),
  ('g5-7', 'md-g5-7', 'opp-wintzfelden-3', 'team-5', NULL),
  ('g6-2', 'md-g5-2', 'opp-illzach-7', 'team-6', NULL),
  ('g6-3', 'md-g5-3', 'opp-ballons-4', 'team-6', NULL),
  ('g6-4', 'md-g5-4', 'opp-mutt-5', 'team-6', NULL),
  ('g6-5', 'md-g5-5', 'opp-wittelsheim-4', 'team-6', NULL),
  ('g6-6', 'md-g5-6', 'opp-wintzfelden-3', 'team-6', NULL),
  ('g6-7', 'md-g5-7', 'opp-issenheim-3', 'team-6', NULL),
  ('g7-1', 'md-g6-1', 'opp-huningue-3', 'team-7', NULL),
  ('g7-2', 'md-g6-2', 'opp-mutt-7', 'team-7', NULL),
  ('g7-3', 'md-g6-3', 'opp-thann-5', 'team-7', NULL),
  ('g7-4', 'md-g6-4', 'opp-stlouis-3', 'team-7', NULL),
  ('g7-5', 'md-g6-5', 'opp-kembs-3', 'team-7', NULL),
  ('g7-6', 'md-g6-6', 'opp-illzach-10', 'team-7', NULL),
  ('g7-7', 'md-g6-7', 'opp-soultz-4', 'team-7', NULL),
  ('g8-1', 'md-g7-1', 'opp-rosenau-7', 'team-8', NULL),
  ('g8-2', 'md-g7-2', 'opp-thann-4', 'team-8', NULL),
  ('g8-3', 'md-g7-3', 'opp-issenheim-4', 'team-8', NULL),
  ('g8-4', 'md-g7-4', 'opp-huningue-4', 'team-8', NULL),
  ('g8-5', 'md-g7-5', 'opp-kembs-6', 'team-8', NULL),
  ('g8-6', 'md-g7-6', 'opp-kembs-4', 'team-8', NULL),
  ('g8-7', 'md-g7-7', 'opp-illzach-11', 'team-8', NULL),
  -- "Retour" fixtures (see match_days above) — future games for team-1 and team-7.
  ('g1-8', 'md-g1-8', 'team-1', 'opp-etival-1', NULL),
  ('g7-8', 'md-g6-8', 'team-7', 'opp-huningue-3', NULL);

-- game_selections — a realistic slice covering match days 1 & 2 for every
-- PPA Rixheim team. p2-player-8 (team-2 roster) is called up to team-1 for
-- MD2 — a "renfort" — while still playing his own team-2 game at MD1; two
-- games across the two teams burns him into team-2 (see computeBrulage in
-- src/lib/brulage.ts).
-- (game_id, team_id) is the primary key since 0033 (#282).
INSERT INTO game_selections (game_id, team_id, player_ids) VALUES
  ('g1-1', 'team-1', '["p2-player-5","p2-player-1","p2-player-2","p2-player-3"]'),
  ('g1-2', 'team-1', '["p2-player-5","p2-player-1","p2-player-2","p2-player-8"]'),
  ('g1-8', 'team-1', '["p2-player-5","p2-player-1","p2-player-2","p2-player-3"]'),
  ('g2-1', 'team-2', '["p2-player-6","p2-player-10","p2-player-7","p2-player-8"]'),
  ('g2-2', 'team-2', '["p2-player-6","p2-player-10","p2-player-7","p2-player-9"]'),
  ('g3-1', 'team-3', '["p2-player-12","p2-player-13","p2-player-14","p2-player-11"]'),
  ('g3-2', 'team-3', '["p2-player-12","p2-player-13","p2-player-14","p2-player-17"]'),
  ('g4-1', 'team-4', '["p2-player-16","p2-player-19","p2-player-18","p2-player-15"]'),
  ('g4-2', 'team-4', '["p2-player-16","p2-player-19","p2-player-18","p2-player-20"]'),
  ('g5-1', 'team-5', '["p2-player-22","p2-player-24","p2-player-21","p2-player-23"]'),
  ('g5-1', 'team-6', '["p2-player-29","p2-player-39","p2-player-40","p2-player-41"]'),
  ('g5-2', 'team-5', '["p2-player-22","p2-player-24","p2-player-21","p2-player-26"]'),
  ('g6-2', 'team-6', '["p2-player-29","p2-player-42","p2-player-38","p2-player-43"]'),
  ('g7-1', 'team-7', '["p2-player-33","p2-player-35","p2-player-34"]'),
  ('g7-2', 'team-7', '["p2-player-33","p2-player-35","p2-player-36"]'),
  ('g8-1', 'team-8', '["p2-player-32","p2-player-27","p2-player-28"]'),
  ('g8-2', 'team-8', '["p2-player-32","p2-player-27","p2-player-30"]');

-- game_availabilities — a few responses on the upcoming "retour" games so the
-- Accueil next-match widget and the game modal's disponibilités list aren't empty.
-- (game_id, player_id) is the primary key since 0033 (#282).
INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) VALUES
  ('g1-8', 'p2-player-5', 'available', NULL),
  ('g1-8', 'p2-player-1', 'maybe', NULL),
  ('g1-8', 'p2-player-2', 'unavailable', 'captain'),
  ('g1-8', 'p2-player-3', 'available', NULL),
  ('g7-8', 'p2-player-33', 'available', NULL),
  ('g7-8', 'p2-player-35', 'unavailable', NULL);

-- users
INSERT INTO users (id, email, role, is_player, first_name, last_name, license_number, phone, birth_date, birth_place, status, club_id) VALUES
  ('user-1', 'admin@example.com', 'general_admin', 0, NULL, NULL, NULL, '', NULL, NULL, 'active', NULL),
  ('user-2', 'club.admin@example.com', 'club_admin', 0, NULL, NULL, NULL, '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-5', 'joris.szulc@example.com', 'player', 1, 'Joris', 'Szulc', '686910', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-1', 'gregory.canaque@example.com', 'player', 1, 'Grégory', 'Canaque', '425881', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-2', 'quentin.colle@example.com', 'player', 1, 'Quentin', 'Colle', '8810008', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-3', 'stephane.lach@example.com', 'player', 1, 'Stéphane', 'Lach', '681364', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-4', 'enzo.lotz@example.com', 'player', 1, 'Enzo', 'Lotz', '6716966', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-6', 'christian.buchi@example.com', 'player', 1, 'Christian', 'Buchi', '6815117', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-10', 'olivier.philippe@example.com', 'player', 1, 'Olivier', 'Philippe', '683975', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-7', 'herve.ceroni@example.com', 'player', 1, 'Hervé', 'Ceroni', '684545', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-9', 'fabrice.dangelser@example.com', 'player', 1, 'Fabrice', 'Dangelser', '682480', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-8', 'cedric.cunin@example.com', 'player', 1, 'Cédric', 'Cunin', '6810711', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-12', 'sebastien.rentz@example.com', 'player', 1, 'Sébastien', 'Rentz', '687433', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-13', 'sebastien.schatt@example.com', 'player', 1, 'Sébastien', 'Schatt', '685143', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-14', 'yannick.schill@example.com', 'player', 1, 'Yannick', 'Schill', '6814304', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-11', 'nello.cristini@example.com', 'player', 1, 'Nello', 'Cristini', '683787', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-17', 'bastien.dangelser@example.com', 'player', 1, 'Bastien', 'Dangelser', '684113', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-16', 'didier.clement@example.com', 'player', 1, 'Didier', 'Clément', '392885', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-19', 'mathieu.mougey@example.com', 'player', 1, 'Mathieu', 'Mougey', '6810243', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-18', 'bertrand.decoatpont@example.com', 'player', 1, 'Bertrand', 'De Coatpont', '6813454', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-15', 'nicolas.broglin@example.com', 'player', 1, 'Nicolas', 'Broglin', '6815877', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-20', 'david.schmitt@example.com', 'player', 1, 'David', 'Schmitt', '6815675', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-22', 'patricia.depauli@example.com', 'player', 1, 'Patricia', 'De Pauli', '6812597', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-24', 'gilles.knobloch@example.com', 'player', 1, 'Gilles', 'Knobloch', '6814428', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-21', 'abdelaziz.arif@example.com', 'player', 1, 'Abdelaziz', 'Arif', '9131446', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-23', 'christophe.heurtin@example.com', 'player', 1, 'Christophe', 'Heurtin', '6816317', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-26', 'frederic.zilbermann@example.com', 'player', 1, 'Frédéric', 'Zilbermann', '689768', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-29', 'christophe.hueber@example.com', 'player', 1, 'Christophe', 'Hueber', '686956', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-39', 'samuel.canemolla@example.com', 'player', 1, 'Samuel', 'Canemolla', '6816075', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-40', 'yvan.meyer@example.com', 'player', 1, 'Yvan', 'Meyer', '6815960', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-41', 'nathan.moreau@example.com', 'player', 1, 'Nathan', 'Moreau', '6816100', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-42', 'sacha.pent@example.com', 'player', 1, 'Sacha', 'Pent', '6816097', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-38', 'quentin.broglin@example.com', 'player', 1, 'Quentin', 'Broglin', '6816118', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-43', 'leo.remetter@example.com', 'player', 1, 'Léo', 'Remetter', '6815965', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-44', 'matheo.scremin@example.com', 'player', 1, 'Mathéo', 'Scremin', '6816084', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-33', 'eric.cavasino@example.com', 'player', 1, 'Eric', 'Cavasino', '6815606', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-35', 'luc.guehl@example.com', 'player', 1, 'Luc', 'Guehl', '6816152', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-34', 'boris.fessler@example.com', 'player', 1, 'Boris', 'Fessler', '6816176', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-36', 'bruno.lafont@example.com', 'player', 1, 'Bruno', 'Lafont', '6816419', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-37', 'alain.schillinger@example.com', 'player', 1, 'Alain', 'Schillinger', '6816418', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-32', 'vincent.rambeau@example.com', 'player', 1, 'Vincent', 'Rambeau', '6815464', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-27', 'jacky.antony@example.com', 'player', 1, 'Jacky', 'Antony', '6815563', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-28', 'stephane.donditz@example.com', 'player', 1, 'Stéphane', 'Donditz', '6816101', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-30', 'jeanclaude.laffuge@example.com', 'player', 1, 'Jean-Claude', 'Laffuge', '68357', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-31', 'gilles.metz@example.com', 'player', 1, 'Gilles', 'Metz', '6816164', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-45', 'marieline.wertenschlag@example.com', 'player', 1, 'Marie-Line', 'Wertenschlag', '686416', '', NULL, NULL, 'active', 'club-fftt-06680011'),
  ('p2-player-25', 'jordan.pesenti@example.com', 'player', 1, 'Jordan', 'Pesenti', '6718937', '', NULL, NULL, 'active', 'club-fftt-06680011')
;

-- player_avatars — a sample avatar so the authed-image round trip (GET/PUT
-- /api/players/:id/avatar) is exercisable locally. 1x1 transparent PNG.
INSERT INTO player_avatars (user_id, data, content_type, updated_at) VALUES
  ('p2-player-24', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'image/png', '2026-01-01T00:00:00.000Z');

