import type { User, Club, Season, Phase, Division, Group, Team, Player, PlayerPhasePoints, Address, MatchDay, Game, GameAvailability, GameSelection } from '@/types'

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------
const ppaAddresses: Address[] = [
  { id: 'addr-1', label: 'Gymnase principal', street: '12 rue du Sport', postalCode: '68170', city: 'Rixheim', isDefault: true },
  { id: 'addr-2', label: 'Salle annexe', street: '5 avenue des Lilas', postalCode: '68170', city: 'Rixheim', isDefault: false },
]

const opponentAddr = (id: string, city: string): Address[] => [
  { id, label: 'Salle', street: '1 rue du Sport', postalCode: '68000', city, isDefault: true },
]

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------
// Channels are authored per club via the admin UI; mocks start with an empty list.
const baseClubs: Omit<Club, 'channels'>[] = [
  { id: 'club-fftt-06680011', affiliationNumber: '06680011', displayName: 'PPA Rixheim', isArchived: false, addresses: ppaAddresses },
  { id: 'club-fftt-06880123', affiliationNumber: '06880123', displayName: 'Etival', isArchived: false, addresses: opponentAddr('addr-etival', 'Etival') },
  { id: 'club-fftt-06680125', affiliationNumber: '06680125', displayName: 'Rosenau', isArchived: false, addresses: opponentAddr('addr-rosenau', 'Rosenau') },
  { id: 'club-fftt-06670045', affiliationNumber: '06670045', displayName: 'RC Strasbourg', isArchived: false, addresses: opponentAddr('addr-rcs', 'Strasbourg') },
  { id: 'club-fftt-06880022', affiliationNumber: '06880022', displayName: 'Vittel St Remy', isArchived: false, addresses: opponentAddr('addr-vittel', 'Vittel') },
  { id: 'club-fftt-06680091', affiliationNumber: '06680091', displayName: 'Illzach', isArchived: false, addresses: opponentAddr('addr-illzach', 'Illzach') },
  { id: 'club-fftt-06100004', affiliationNumber: '06100004', displayName: 'Moussey', isArchived: false, addresses: opponentAddr('addr-moussey', 'Moussey') },
  { id: 'club-fftt-06880002', affiliationNumber: '06880002', displayName: 'Anould', isArchived: false, addresses: opponentAddr('addr-anould', 'Anould') },
  { id: 'club-fftt-06680004', affiliationNumber: '06680004', displayName: 'Colmar MJC', isArchived: false, addresses: opponentAddr('addr-cmjc', 'Colmar') },
  { id: 'club-fftt-06680080', affiliationNumber: '06680080', displayName: 'Colmar AJE', isArchived: false, addresses: opponentAddr('addr-caje', 'Colmar') },
  { id: 'club-fftt-06680082', affiliationNumber: '06680082', displayName: 'Saint-Louis', isArchived: false, addresses: opponentAddr('addr-stlouis', 'Saint-Louis') },
  { id: 'club-fftt-06680102', affiliationNumber: '06680102', displayName: 'Huningue', isArchived: false, addresses: opponentAddr('addr-huningue', 'Huningue') },
  { id: 'club-fftt-06680090', affiliationNumber: '06680090', displayName: 'Ingersheim', isArchived: false, addresses: opponentAddr('addr-ingersheim', 'Ingersheim') },
  { id: 'club-fftt-06680071', affiliationNumber: '06680071', displayName: 'Issenheim', isArchived: false, addresses: opponentAddr('addr-issenheim', 'Issenheim') },
  { id: 'club-fftt-06680116', affiliationNumber: '06680116', displayName: 'Wintzfelden', isArchived: false, addresses: opponentAddr('addr-wintzfelden', 'Wintzfelden') },
  { id: 'club-fftt-06680111', affiliationNumber: '06680111', displayName: 'Thann', isArchived: false, addresses: opponentAddr('addr-thann', 'Thann') },
  { id: 'club-fftt-06680138', affiliationNumber: '06680138', displayName: 'Soultz', isArchived: false, addresses: opponentAddr('addr-soultz', 'Soultz') },
  { id: 'club-fftt-06680118', affiliationNumber: '06680118', displayName: 'Wittelsheim', isArchived: false, addresses: opponentAddr('addr-wittelsheim', 'Wittelsheim') },
  { id: 'club-fftt-06680006', affiliationNumber: '06680006', displayName: 'FC Mulhouse', isArchived: false, addresses: opponentAddr('addr-fcm', 'Mulhouse') },
  { id: 'club-fftt-06680140', affiliationNumber: '06680140', displayName: 'Kembs', isArchived: false, addresses: opponentAddr('addr-kembs', 'Kembs') },
  { id: 'club-fftt-06680123', affiliationNumber: '06680123', displayName: 'Ensisheim TTMC', isArchived: false, addresses: opponentAddr('addr-ensisheim', 'Ensisheim') },
  { id: 'club-fftt-06880064', affiliationNumber: '06880064', displayName: 'Ballons des Vosges', isArchived: false, addresses: opponentAddr('addr-ballons', 'Ballons des Vosges') },
  { id: 'club-fftt-06680105', affiliationNumber: '06680105', displayName: 'Mulhouse TT', isArchived: false, addresses: opponentAddr('addr-mutt', 'Mulhouse') },
]

export const mockClubs: Club[] = baseClubs.map((c) => ({ ...c, channels: [] }))

// ---------------------------------------------------------------------------
// Season & Phase
// ---------------------------------------------------------------------------
export const mockSeasons: Season[] = [
  { id: '26', displayName: '2025/2026', status: 'active' },
]

export const mockPhases: Phase[] = [
  { id: 'phase-26-1', seasonId: '26', name: 'Phase 1', displayName: '2025/2026 Phase 1', status: 'active' },
]

// ---------------------------------------------------------------------------
// Divisions
// ---------------------------------------------------------------------------
// GE1 → GE5 form a parent chain (each the previous one's parent, like the
// real GRAND-EST GEEP1→GE5P1 chain in ffttDivisions.spec.ts); GE6 and GE7
// are orphans, same as real FFTT data — lets #236's locked reordering be
// exercised locally without needing a live FFTT import.
export const mockDivisions: Division[] = [
  { id: '198609', phaseId: 'phase-26-1', displayName: 'GE 1', rank: 1, playersPerGame: 4, isArchived: false, identifier: 'GE1P1' },
  { id: '198755', phaseId: 'phase-26-1', displayName: 'GE 2', rank: 2, playersPerGame: 4, isArchived: false, identifier: 'GE2P1', parentId: '198609' },
  { id: '198305', phaseId: 'phase-26-1', displayName: 'GE 3', rank: 3, playersPerGame: 4, isArchived: false, identifier: 'GE3P1', parentId: '198755' },
  { id: '198821', phaseId: 'phase-26-1', displayName: 'GE 4', rank: 4, playersPerGame: 4, isArchived: false, identifier: 'GE4P1', parentId: '198305' },
  { id: '198895', phaseId: 'phase-26-1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false, identifier: 'GE5P1', parentId: '198821' },
  { id: '198435', phaseId: 'phase-26-1', displayName: 'GE 6', rank: 6, playersPerGame: 3, isArchived: false, identifier: 'GE6P1' },
  { id: '198907', phaseId: 'phase-26-1', displayName: 'GE 7', rank: 7, playersPerGame: 3, isArchived: false, identifier: 'GE7P1' },
]

// ---------------------------------------------------------------------------
// Players — PPA Rixheim (IDs match remote DB p2-player-* scheme)
// ---------------------------------------------------------------------------
export const mockPlayers: Player[] = [
  // Equipe 1
  { id: 'p2-player-5', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686910', email: 'joris.szulc@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-1', firstName: 'Grégory', lastName: 'Canaque', licenseNumber: '425881', email: 'gregory.canaque@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-2', firstName: 'Quentin', lastName: 'Colle', licenseNumber: '8810008', email: 'quentin.colle@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-3', firstName: 'Stéphane', lastName: 'Lach', licenseNumber: '681364', email: 'stephane.lach@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-4', firstName: 'Enzo', lastName: 'Lotz', licenseNumber: '6716966', email: 'enzo.lotz@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 2
  { id: 'p2-player-6', firstName: 'Christian', lastName: 'Buchi', licenseNumber: '6815117', email: 'christian.buchi@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-10', firstName: 'Olivier', lastName: 'Philippe', licenseNumber: '683975', email: 'olivier.philippe@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-7', firstName: 'Hervé', lastName: 'Ceroni', licenseNumber: '684545', email: 'herve.ceroni@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-9', firstName: 'Fabrice', lastName: 'Dangelser', licenseNumber: '682480', email: 'fabrice.dangelser@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-8', firstName: 'Cédric', lastName: 'Cunin', licenseNumber: '6810711', email: 'cedric.cunin@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 3
  { id: 'p2-player-12', firstName: 'Sébastien', lastName: 'Rentz', licenseNumber: '687433', email: 'sebastien.rentz@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-13', firstName: 'Sébastien', lastName: 'Schatt', licenseNumber: '685143', email: 'sebastien.schatt@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-14', firstName: 'Yannick', lastName: 'Schill', licenseNumber: '6814304', email: 'yannick.schill@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-11', firstName: 'Nello', lastName: 'Cristini', licenseNumber: '683787', email: 'nello.cristini@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-17', firstName: 'Bastien', lastName: 'Dangelser', licenseNumber: '684113', email: 'bastien.dangelser@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 4
  { id: 'p2-player-16', firstName: 'Didier', lastName: 'Clément', licenseNumber: '392885', email: 'didier.clement@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-19', firstName: 'Mathieu', lastName: 'Mougey', licenseNumber: '6810243', email: 'mathieu.mougey@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-18', firstName: 'Bertrand', lastName: 'De Coatpont', licenseNumber: '6813454', email: 'bertrand.decoatpont@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-15', firstName: 'Nicolas', lastName: 'Broglin', licenseNumber: '6815877', email: 'nicolas.broglin@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-20', firstName: 'David', lastName: 'Schmitt', licenseNumber: '6815675', email: 'david.schmitt@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 5
  { id: 'p2-player-22', firstName: 'Patricia', lastName: 'De Pauli', licenseNumber: '6812597', email: 'patricia.depauli@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-24', firstName: 'Gilles', lastName: 'Knobloch', licenseNumber: '6814428', email: 'gilles.knobloch@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-21', firstName: 'Abdelaziz', lastName: 'Arif', licenseNumber: '9131446', email: 'abdelaziz.arif@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-23', firstName: 'Christophe', lastName: 'Heurtin', licenseNumber: '6816317', email: 'christophe.heurtin@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-26', firstName: 'Frédéric', lastName: 'Zilbermann', licenseNumber: '689768', email: 'frederic.zilbermann@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 6
  { id: 'p2-player-29', firstName: 'Christophe', lastName: 'Hueber', licenseNumber: '686956', email: 'christophe.hueber@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-39', firstName: 'Samuel', lastName: 'Canemolla', licenseNumber: '6816075', email: 'samuel.canemolla@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-40', firstName: 'Yvan', lastName: 'Meyer', licenseNumber: '6815960', email: 'yvan.meyer@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-41', firstName: 'Nathan', lastName: 'Moreau', licenseNumber: '6816100', email: 'nathan.moreau@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-42', firstName: 'Sacha', lastName: 'Pent', licenseNumber: '6816097', email: 'sacha.pent@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-38', firstName: 'Quentin', lastName: 'Broglin', licenseNumber: '6816118', email: 'quentin.broglin@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-43', firstName: 'Léo', lastName: 'Remetter', licenseNumber: '6815965', email: 'leo.remetter@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-44', firstName: 'Mathéo', lastName: 'Scremin', licenseNumber: '6816084', email: 'matheo.scremin@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 7
  { id: 'p2-player-33', firstName: 'Eric', lastName: 'Cavasino', licenseNumber: '6815606', email: 'eric.cavasino@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-35', firstName: 'Luc', lastName: 'Guehl', licenseNumber: '6816152', email: 'luc.guehl@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-34', firstName: 'Boris', lastName: 'Fessler', licenseNumber: '6816176', email: 'boris.fessler@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-36', firstName: 'Bruno', lastName: 'Lafont', licenseNumber: '6816419', email: 'bruno.lafont@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-37', firstName: 'Alain', lastName: 'Schillinger', licenseNumber: '6816418', email: 'alain.schillinger@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 8
  { id: 'p2-player-32', firstName: 'Vincent', lastName: 'Rambeau', licenseNumber: '6815464', email: 'vincent.rambeau@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-27', firstName: 'Jacky', lastName: 'Antony', licenseNumber: '6815563', email: 'jacky.antony@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-28', firstName: 'Stéphane', lastName: 'Donditz', licenseNumber: '6816101', email: 'stephane.donditz@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-30', firstName: 'Jean-Claude', lastName: 'Laffuge', licenseNumber: '68357', email: 'jeanclaude.laffuge@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  { id: 'p2-player-31', firstName: 'Gilles', lastName: 'Metz', licenseNumber: '6816164', email: 'gilles.metz@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Remplaçante (unassigned)
  { id: 'p2-player-45', firstName: 'Marie-Line', lastName: 'Wertenschlag', licenseNumber: '686416', email: 'marieline.wertenschlag@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
  // Equipe 5 extra
  { id: 'p2-player-25', firstName: 'Jordan', lastName: 'Pesenti', licenseNumber: '6718937', email: 'jordan.pesenti@example.com', phone: '', status: 'active', clubId: 'club-fftt-06680011' },
]

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export const mockGroups: Group[] = [
  { id: 'group-1', divisionId: '198609', number: 1, teamIds: ['team-1', 'opp-etival-1', 'opp-rosenau-1', 'opp-rcs-2', 'opp-vittel-1', 'opp-illzach-2', 'opp-moussey-1', 'opp-anould-2'], isArchived: false },
  { id: 'group-2', divisionId: '198755', number: 1, teamIds: ['team-2', 'opp-illzach-3', 'opp-rosenau-2', 'opp-cmjc-3', 'opp-caje-1', 'opp-stlouis-1', 'opp-huningue-1', 'opp-ingersheim-1'], isArchived: false },
  { id: 'group-3', divisionId: '198305', number: 1, teamIds: ['team-3', 'opp-issenheim-1', 'opp-illzach-6', 'opp-wintzfelden-2', 'opp-huningue-2', 'opp-thann-2', 'opp-rosenau-4'], isArchived: false },
  { id: 'group-4', divisionId: '198821', number: 1, teamIds: ['team-4', 'opp-soultz-2', 'opp-wittelsheim-5', 'opp-illzach-8', 'opp-fcm-3', 'opp-kembs-2', 'opp-ensisheim-1', 'opp-rosenau-6'], isArchived: false },
  { id: 'group-5', divisionId: '198895', number: 1, teamIds: ['team-5', 'team-6', 'opp-issenheim-3', 'opp-illzach-7', 'opp-ballons-4', 'opp-mutt-5', 'opp-wittelsheim-4', 'opp-wintzfelden-3'], isArchived: false },
  { id: 'group-6', divisionId: '198435', number: 1, teamIds: ['team-7', 'opp-huningue-3', 'opp-mutt-7', 'opp-thann-5', 'opp-stlouis-3', 'opp-kembs-3', 'opp-illzach-10', 'opp-soultz-4'], isArchived: false },
  { id: 'group-7', divisionId: '198907', number: 1, teamIds: ['team-8', 'opp-rosenau-7', 'opp-thann-4', 'opp-issenheim-4', 'opp-huningue-4', 'opp-kembs-6', 'opp-kembs-4', 'opp-illzach-11'], isArchived: false },
]

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
const oppTeam = (id: string, clubId: string, num: number, divId: string, groupId: string): Team => ({
  id, clubId, phaseId: 'phase-26-1', number: num, divisionId: divId, groupId,
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '',
  isArchived: false, playerIds: [],
})

export const mockTeams: Team[] = [
  // PPA Rixheim teams
  {
    id: 'team-1', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 1, divisionId: '198609', groupId: 'group-1',
    gameLocationId: 'addr-1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p2-player-2',
    playerIds: ['p2-player-5', 'p2-player-1', 'p2-player-2', 'p2-player-3', 'p2-player-4'],
    color: '#374151', isArchived: false,
  },
  {
    id: 'team-2', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 2, divisionId: '198755', groupId: 'group-2',
    gameLocationId: 'addr-1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p2-player-8',
    playerIds: ['p2-player-6', 'p2-player-10', 'p2-player-7', 'p2-player-9', 'p2-player-8'],
    color: '#b91c1c', isArchived: false,
  },
  {
    id: 'team-3', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 3, divisionId: '198305', groupId: 'group-3',
    gameLocationId: 'addr-1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p2-player-13',
    playerIds: ['p2-player-12', 'p2-player-13', 'p2-player-14', 'p2-player-11', 'p2-player-17'],
    color: '#15803d', isArchived: false,
  },
  {
    id: 'team-4', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 4, divisionId: '198821', groupId: 'group-4',
    gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: 'p2-player-19',
    playerIds: ['p2-player-16', 'p2-player-19', 'p2-player-18', 'p2-player-15', 'p2-player-20'],
    color: '#c2410c', isArchived: false,
  },
  {
    id: 'team-5', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 5, divisionId: '198895', groupId: 'group-5',
    gameLocationId: 'addr-1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p2-player-24',
    playerIds: ['p2-player-22', 'p2-player-24', 'p2-player-21', 'p2-player-23', 'p2-player-26'],
    color: '#1d4ed8', isArchived: false,
  },
  {
    id: 'team-6', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 6, divisionId: '198895', groupId: 'group-5',
    gameLocationId: 'addr-2', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p2-player-29',
    playerIds: ['p2-player-29', 'p2-player-39', 'p2-player-40', 'p2-player-41', 'p2-player-42', 'p2-player-38', 'p2-player-43', 'p2-player-44'],
    color: '#be185d', isArchived: false,
  },
  {
    id: 'team-7', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 7, divisionId: '198435', groupId: 'group-6',
    gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: 'p2-player-33',
    playerIds: ['p2-player-33', 'p2-player-35', 'p2-player-34', 'p2-player-36', 'p2-player-37'],
    color: '#7c2d12', isArchived: false,
  },
  {
    id: 'team-8', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 8, divisionId: '198907', groupId: 'group-7',
    gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: 'p2-player-42',
    playerIds: ['p2-player-32', 'p2-player-27', 'p2-player-28', 'p2-player-30', 'p2-player-31'],
    color: '#0d9488', isArchived: false,
  },
  // Group 1-5 opponents
  oppTeam('opp-etival-1', 'club-fftt-06880123', 1, '198609', 'group-1'),
  oppTeam('opp-rosenau-1', 'club-fftt-06680125', 1, '198609', 'group-1'),
  oppTeam('opp-rcs-2', 'club-fftt-06670045', 2, '198609', 'group-1'),
  oppTeam('opp-vittel-1', 'club-fftt-06880022', 1, '198609', 'group-1'),
  oppTeam('opp-illzach-2', 'club-fftt-06680091', 2, '198609', 'group-1'),
  oppTeam('opp-moussey-1', 'club-fftt-06100004', 1, '198609', 'group-1'),
  oppTeam('opp-anould-2', 'club-fftt-06880002', 2, '198609', 'group-1'),
  oppTeam('opp-illzach-3', 'club-fftt-06680091', 3, '198755', 'group-2'),
  oppTeam('opp-rosenau-2', 'club-fftt-06680125', 2, '198755', 'group-2'),
  oppTeam('opp-cmjc-3', 'club-fftt-06680004', 3, '198755', 'group-2'),
  oppTeam('opp-caje-1', 'club-fftt-06680080', 1, '198755', 'group-2'),
  oppTeam('opp-stlouis-1', 'club-fftt-06680082', 1, '198755', 'group-2'),
  oppTeam('opp-huningue-1', 'club-fftt-06680102', 1, '198755', 'group-2'),
  oppTeam('opp-ingersheim-1', 'club-fftt-06680090', 1, '198755', 'group-2'),
  oppTeam('opp-issenheim-1', 'club-fftt-06680071', 1, '198305', 'group-3'),
  oppTeam('opp-illzach-6', 'club-fftt-06680091', 6, '198305', 'group-3'),
  oppTeam('opp-wintzfelden-2', 'club-fftt-06680116', 2, '198305', 'group-3'),
  oppTeam('opp-huningue-2', 'club-fftt-06680102', 2, '198305', 'group-3'),
  oppTeam('opp-thann-2', 'club-fftt-06680111', 2, '198305', 'group-3'),
  oppTeam('opp-rosenau-4', 'club-fftt-06680125', 4, '198305', 'group-3'),
  oppTeam('opp-soultz-2', 'club-fftt-06680138', 2, '198821', 'group-4'),
  oppTeam('opp-wittelsheim-5', 'club-fftt-06680118', 5, '198821', 'group-4'),
  oppTeam('opp-illzach-8', 'club-fftt-06680091', 8, '198821', 'group-4'),
  oppTeam('opp-fcm-3', 'club-fftt-06680006', 3, '198821', 'group-4'),
  oppTeam('opp-kembs-2', 'club-fftt-06680140', 2, '198821', 'group-4'),
  oppTeam('opp-ensisheim-1', 'club-fftt-06680123', 1, '198821', 'group-4'),
  oppTeam('opp-rosenau-6', 'club-fftt-06680125', 6, '198821', 'group-4'),
  oppTeam('opp-issenheim-3', 'club-fftt-06680071', 3, '198895', 'group-5'),
  oppTeam('opp-illzach-7', 'club-fftt-06680091', 7, '198895', 'group-5'),
  oppTeam('opp-ballons-4', 'club-fftt-06880064', 4, '198895', 'group-5'),
  oppTeam('opp-mutt-5', 'club-fftt-06680105', 5, '198895', 'group-5'),
  oppTeam('opp-wittelsheim-4', 'club-fftt-06680118', 4, '198895', 'group-5'),
  oppTeam('opp-wintzfelden-3', 'club-fftt-06680116', 3, '198895', 'group-5'),
  // Group 6 opponents (Equipe 7)
  oppTeam('opp-huningue-3', 'club-fftt-06680102', 3, '198435', 'group-6'),
  oppTeam('opp-mutt-7', 'club-fftt-06680105', 7, '198435', 'group-6'),
  oppTeam('opp-thann-5', 'club-fftt-06680111', 5, '198435', 'group-6'),
  oppTeam('opp-stlouis-3', 'club-fftt-06680082', 3, '198435', 'group-6'),
  oppTeam('opp-kembs-3', 'club-fftt-06680140', 3, '198435', 'group-6'),
  oppTeam('opp-illzach-10', 'club-fftt-06680091', 10, '198435', 'group-6'),
  oppTeam('opp-soultz-4', 'club-fftt-06680138', 4, '198435', 'group-6'),
  // Group 7 opponents (Equipe 8)
  oppTeam('opp-rosenau-7', 'club-fftt-06680125', 7, '198907', 'group-7'),
  oppTeam('opp-thann-4', 'club-fftt-06680111', 4, '198907', 'group-7'),
  oppTeam('opp-issenheim-4', 'club-fftt-06680071', 4, '198907', 'group-7'),
  oppTeam('opp-huningue-4', 'club-fftt-06680102', 4, '198907', 'group-7'),
  oppTeam('opp-kembs-6', 'club-fftt-06680140', 6, '198907', 'group-7'),
  oppTeam('opp-kembs-4', 'club-fftt-06680140', 4, '198907', 'group-7'),
  oppTeam('opp-illzach-11', 'club-fftt-06680091', 11, '198907', 'group-7'),
]

// ---------------------------------------------------------------------------
// Player points per phase (#384)
// ---------------------------------------------------------------------------
// These used to sit on each team as `rosterInitialPoints`. Points belong to the
// phase: a licensee with no team has them too, and they are the same points.
export const mockPlayerPhasePoints: PlayerPhasePoints[] = [
  { phaseId: 'phase-26-1', playerId: 'p2-player-5', points: '1887' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-1', points: '1763' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-2', points: '1665' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-3', points: '1647' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-4', points: '1566' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-6', points: '1791' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-10', points: '1661' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-7', points: '1500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-9', points: '1301' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-8', points: '1301' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-12', points: '1356' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-13', points: '1267' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-14', points: '1198' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-11', points: '1186' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-17', points: '754' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-16', points: '889' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-19', points: '728' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-18', points: '727' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-15', points: '713' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-20', points: '704' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-22', points: '735' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-24', points: '701' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-21', points: '702' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-23', points: '1050' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-26', points: '707' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-29', points: '632' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-39', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-40', points: '503' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-41', points: '561' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-42', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-38', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-43', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-44', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-33', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-35', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-34', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-36', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-37', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-32', points: '607' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-27', points: '501' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-28', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-30', points: '500' },
  { phaseId: 'phase-26-1', playerId: 'p2-player-31', points: '500' },
]

// ---------------------------------------------------------------------------
// Match Days (7 per group, plus a couple of "retour" fixtures dated relative
// to today so upcoming/"prochain match" views stay populated regardless of
// when the app is run).
// ---------------------------------------------------------------------------
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const mockMatchDays: MatchDay[] = [
  // Group 1 (Equipe 1)
  { id: 'md-g1-1', groupId: 'group-1', number: 1, date: '2025-09-27' },
  { id: 'md-g1-2', groupId: 'group-1', number: 2, date: '2025-10-11' },
  { id: 'md-g1-3', groupId: 'group-1', number: 3, date: '2025-11-08' },
  { id: 'md-g1-4', groupId: 'group-1', number: 4, date: '2025-11-15' },
  { id: 'md-g1-5', groupId: 'group-1', number: 5, date: '2025-11-29' },
  { id: 'md-g1-6', groupId: 'group-1', number: 6, date: '2025-12-13' },
  { id: 'md-g1-7', groupId: 'group-1', number: 7, date: '2026-01-10' },
  // Group 2 (Equipe 2)
  { id: 'md-g2-1', groupId: 'group-2', number: 1, date: '2025-09-27' },
  { id: 'md-g2-2', groupId: 'group-2', number: 2, date: '2025-10-11' },
  { id: 'md-g2-3', groupId: 'group-2', number: 3, date: '2025-11-08' },
  { id: 'md-g2-4', groupId: 'group-2', number: 4, date: '2025-11-16' },
  { id: 'md-g2-5', groupId: 'group-2', number: 5, date: '2025-11-29' },
  { id: 'md-g2-6', groupId: 'group-2', number: 6, date: '2025-12-13' },
  { id: 'md-g2-7', groupId: 'group-2', number: 7, date: '2026-01-10' },
  // Group 3 (Equipe 3)
  { id: 'md-g3-1', groupId: 'group-3', number: 1, date: '2025-09-27' },
  { id: 'md-g3-2', groupId: 'group-3', number: 2, date: '2025-10-10' },
  { id: 'md-g3-3', groupId: 'group-3', number: 3, date: '2025-11-08' },
  { id: 'md-g3-4', groupId: 'group-3', number: 4, date: '2025-11-14' },
  { id: 'md-g3-5', groupId: 'group-3', number: 5, date: '2025-11-29' },
  { id: 'md-g3-6', groupId: 'group-3', number: 6, date: '2025-12-13' },
  { id: 'md-g3-7', groupId: 'group-3', number: 7, date: '2026-01-10' },
  // Group 4 (Equipe 4)
  { id: 'md-g4-1', groupId: 'group-4', number: 1, date: '2025-09-22' },
  { id: 'md-g4-2', groupId: 'group-4', number: 2, date: '2025-10-09' },
  { id: 'md-g4-3', groupId: 'group-4', number: 3, date: '2025-11-05' },
  { id: 'md-g4-4', groupId: 'group-4', number: 4, date: '2025-11-13' },
  { id: 'md-g4-5', groupId: 'group-4', number: 5, date: '2025-11-27' },
  { id: 'md-g4-6', groupId: 'group-4', number: 6, date: '2025-12-13' },
  { id: 'md-g4-7', groupId: 'group-4', number: 7, date: '2026-01-08' },
  // Group 5 (Equipe 5 & 6)
  { id: 'md-g5-1', groupId: 'group-5', number: 1, date: '2025-09-27' },
  { id: 'md-g5-2', groupId: 'group-5', number: 2, date: '2025-10-11' },
  { id: 'md-g5-3', groupId: 'group-5', number: 3, date: '2025-11-07' },
  { id: 'md-g5-4', groupId: 'group-5', number: 4, date: '2025-11-15' },
  { id: 'md-g5-5', groupId: 'group-5', number: 5, date: '2025-11-28' },
  { id: 'md-g5-6', groupId: 'group-5', number: 6, date: '2025-12-13' },
  { id: 'md-g5-7', groupId: 'group-5', number: 7, date: '2026-01-10' },
  // Group 6 (Equipe 7)
  { id: 'md-g6-1', groupId: 'group-6', number: 1, date: '2025-09-25' },
  { id: 'md-g6-2', groupId: 'group-6', number: 2, date: '2025-10-09' },
  { id: 'md-g6-3', groupId: 'group-6', number: 3, date: '2025-11-08' },
  { id: 'md-g6-4', groupId: 'group-6', number: 4, date: '2025-11-11' },
  { id: 'md-g6-5', groupId: 'group-6', number: 5, date: '2025-11-27' },
  { id: 'md-g6-6', groupId: 'group-6', number: 6, date: '2025-12-10' },
  { id: 'md-g6-7', groupId: 'group-6', number: 7, date: '2026-01-08' },
  // Group 7 (Equipe 8)
  { id: 'md-g7-1', groupId: 'group-7', number: 1, date: '2025-09-25' },
  { id: 'md-g7-2', groupId: 'group-7', number: 2, date: '2025-10-09' },
  { id: 'md-g7-3', groupId: 'group-7', number: 3, date: '2025-11-07' },
  { id: 'md-g7-4', groupId: 'group-7', number: 4, date: '2025-11-13' },
  { id: 'md-g7-5', groupId: 'group-7', number: 5, date: '2025-11-27' },
  { id: 'md-g7-6', groupId: 'group-7', number: 6, date: '2025-12-09' },
  { id: 'md-g7-7', groupId: 'group-7', number: 7, date: '2026-01-08' },
  // "Retour" fixtures — always in the future so next-match views are non-empty.
  { id: 'md-g1-8', groupId: 'group-1', number: 8, date: daysFromNow(14) },
  { id: 'md-g6-8', groupId: 'group-6', number: 8, date: daysFromNow(21) },
]

// ---------------------------------------------------------------------------
// Games (PPA Rixheim games only)
// ---------------------------------------------------------------------------
export const mockGames: Game[] = [
  // Equipe 1
  { id: 'g1-1', matchDayId: 'md-g1-1', homeTeamId: 'opp-etival-1', awayTeamId: 'team-1' },
  { id: 'g1-2', matchDayId: 'md-g1-2', homeTeamId: 'opp-rosenau-1', awayTeamId: 'team-1' },
  { id: 'g1-3', matchDayId: 'md-g1-3', homeTeamId: 'opp-rcs-2', awayTeamId: 'team-1' },
  { id: 'g1-4', matchDayId: 'md-g1-4', homeTeamId: 'opp-vittel-1', awayTeamId: 'team-1' },
  { id: 'g1-5', matchDayId: 'md-g1-5', homeTeamId: 'opp-illzach-2', awayTeamId: 'team-1' },
  { id: 'g1-6', matchDayId: 'md-g1-6', homeTeamId: 'opp-moussey-1', awayTeamId: 'team-1' },
  { id: 'g1-7', matchDayId: 'md-g1-7', homeTeamId: 'opp-anould-2', awayTeamId: 'team-1' },
  // Equipe 2
  { id: 'g2-1', matchDayId: 'md-g2-1', homeTeamId: 'opp-illzach-3', awayTeamId: 'team-2' },
  { id: 'g2-2', matchDayId: 'md-g2-2', homeTeamId: 'opp-rosenau-2', awayTeamId: 'team-2' },
  { id: 'g2-3', matchDayId: 'md-g2-3', homeTeamId: 'opp-cmjc-3', awayTeamId: 'team-2' },
  { id: 'g2-4', matchDayId: 'md-g2-4', homeTeamId: 'opp-caje-1', awayTeamId: 'team-2' },
  { id: 'g2-5', matchDayId: 'md-g2-5', homeTeamId: 'opp-stlouis-1', awayTeamId: 'team-2' },
  { id: 'g2-6', matchDayId: 'md-g2-6', homeTeamId: 'opp-huningue-1', awayTeamId: 'team-2' },
  { id: 'g2-7', matchDayId: 'md-g2-7', homeTeamId: 'opp-ingersheim-1', awayTeamId: 'team-2' },
  // Equipe 3 (J7 = exempt)
  { id: 'g3-1', matchDayId: 'md-g3-1', homeTeamId: 'opp-issenheim-1', awayTeamId: 'team-3' },
  { id: 'g3-2', matchDayId: 'md-g3-2', homeTeamId: 'opp-illzach-6', awayTeamId: 'team-3', time: '20h00' },
  { id: 'g3-3', matchDayId: 'md-g3-3', homeTeamId: 'opp-wintzfelden-2', awayTeamId: 'team-3' },
  { id: 'g3-4', matchDayId: 'md-g3-4', homeTeamId: 'opp-huningue-2', awayTeamId: 'team-3', time: '20h00' },
  { id: 'g3-5', matchDayId: 'md-g3-5', homeTeamId: 'opp-thann-2', awayTeamId: 'team-3' },
  { id: 'g3-6', matchDayId: 'md-g3-6', homeTeamId: 'opp-rosenau-4', awayTeamId: 'team-3' },
  // Equipe 4
  { id: 'g4-1', matchDayId: 'md-g4-1', homeTeamId: 'opp-soultz-2', awayTeamId: 'team-4', time: '20h00' },
  { id: 'g4-2', matchDayId: 'md-g4-2', homeTeamId: 'opp-wittelsheim-5', awayTeamId: 'team-4' },
  { id: 'g4-3', matchDayId: 'md-g4-3', homeTeamId: 'opp-illzach-8', awayTeamId: 'team-4', time: '20h00' },
  { id: 'g4-4', matchDayId: 'md-g4-4', homeTeamId: 'opp-fcm-3', awayTeamId: 'team-4' },
  { id: 'g4-5', matchDayId: 'md-g4-5', homeTeamId: 'opp-kembs-2', awayTeamId: 'team-4' },
  { id: 'g4-6', matchDayId: 'md-g4-6', homeTeamId: 'opp-ensisheim-1', awayTeamId: 'team-4', time: '16h00' },
  { id: 'g4-7', matchDayId: 'md-g4-7', homeTeamId: 'opp-rosenau-6', awayTeamId: 'team-4' },
  // Equipe 5
  { id: 'g5-1', matchDayId: 'md-g5-1', homeTeamId: 'team-6', awayTeamId: 'team-5' },
  { id: 'g5-2', matchDayId: 'md-g5-2', homeTeamId: 'opp-issenheim-3', awayTeamId: 'team-5' },
  { id: 'g5-3', matchDayId: 'md-g5-3', homeTeamId: 'opp-illzach-7', awayTeamId: 'team-5', time: '20h00' },
  { id: 'g5-4', matchDayId: 'md-g5-4', homeTeamId: 'opp-ballons-4', awayTeamId: 'team-5', time: '20h00' },
  { id: 'g5-5', matchDayId: 'md-g5-5', homeTeamId: 'opp-mutt-5', awayTeamId: 'team-5', time: '20h00' },
  { id: 'g5-6', matchDayId: 'md-g5-6', homeTeamId: 'opp-wittelsheim-4', awayTeamId: 'team-5' },
  { id: 'g5-7', matchDayId: 'md-g5-7', homeTeamId: 'opp-wintzfelden-3', awayTeamId: 'team-5' },
  // Equipe 6
  { id: 'g6-2', matchDayId: 'md-g5-2', homeTeamId: 'opp-illzach-7', awayTeamId: 'team-6' },
  { id: 'g6-3', matchDayId: 'md-g5-3', homeTeamId: 'opp-ballons-4', awayTeamId: 'team-6' },
  { id: 'g6-4', matchDayId: 'md-g5-4', homeTeamId: 'opp-mutt-5', awayTeamId: 'team-6' },
  { id: 'g6-5', matchDayId: 'md-g5-5', homeTeamId: 'opp-wittelsheim-4', awayTeamId: 'team-6' },
  { id: 'g6-6', matchDayId: 'md-g5-6', homeTeamId: 'opp-wintzfelden-3', awayTeamId: 'team-6' },
  { id: 'g6-7', matchDayId: 'md-g5-7', homeTeamId: 'opp-issenheim-3', awayTeamId: 'team-6' },
  // Equipe 7
  { id: 'g7-1', matchDayId: 'md-g6-1', homeTeamId: 'opp-huningue-3', awayTeamId: 'team-7' },
  { id: 'g7-2', matchDayId: 'md-g6-2', homeTeamId: 'opp-mutt-7', awayTeamId: 'team-7' },
  { id: 'g7-3', matchDayId: 'md-g6-3', homeTeamId: 'opp-thann-5', awayTeamId: 'team-7' },
  { id: 'g7-4', matchDayId: 'md-g6-4', homeTeamId: 'opp-stlouis-3', awayTeamId: 'team-7' },
  { id: 'g7-5', matchDayId: 'md-g6-5', homeTeamId: 'opp-kembs-3', awayTeamId: 'team-7' },
  { id: 'g7-6', matchDayId: 'md-g6-6', homeTeamId: 'opp-illzach-10', awayTeamId: 'team-7' },
  { id: 'g7-7', matchDayId: 'md-g6-7', homeTeamId: 'opp-soultz-4', awayTeamId: 'team-7' },
  // Equipe 8
  { id: 'g8-1', matchDayId: 'md-g7-1', homeTeamId: 'opp-rosenau-7', awayTeamId: 'team-8' },
  { id: 'g8-2', matchDayId: 'md-g7-2', homeTeamId: 'opp-thann-4', awayTeamId: 'team-8' },
  { id: 'g8-3', matchDayId: 'md-g7-3', homeTeamId: 'opp-issenheim-4', awayTeamId: 'team-8' },
  { id: 'g8-4', matchDayId: 'md-g7-4', homeTeamId: 'opp-huningue-4', awayTeamId: 'team-8' },
  { id: 'g8-5', matchDayId: 'md-g7-5', homeTeamId: 'opp-kembs-6', awayTeamId: 'team-8' },
  { id: 'g8-6', matchDayId: 'md-g7-6', homeTeamId: 'opp-kembs-4', awayTeamId: 'team-8' },
  { id: 'g8-7', matchDayId: 'md-g7-7', homeTeamId: 'opp-illzach-11', awayTeamId: 'team-8' },
  // "Retour" fixtures (see mockMatchDays) — future games for team-1 and team-7.
  // Its own date and time, two days after its journée's — relative to today
  // like the journée itself, so it never drifts into the past (#393) and the
  // "prochains matchs" views stay populated. (#292): an FFTT round
  // spans a week and a club can play another day, so a game must show ITS
  // date, not the journée's derived one. `date` was missing from /api/data
  // entirely, and this is what covers that path end to end.
  { id: 'g1-8', matchDayId: 'md-g1-8', homeTeamId: 'team-1', awayTeamId: 'opp-etival-1', date: daysFromNow(16), time: '9h30', source: 'manual' },
  { id: 'g7-8', matchDayId: 'md-g6-8', homeTeamId: 'team-7', awayTeamId: 'opp-huningue-3' },
]

// ---------------------------------------------------------------------------
// Game Selections — a realistic slice covering match days 1 & 2 for every
// PPA Rixheim team. p2-player-8 (team-2 roster) is called up to team-1 for
// MD2 — a "renfort" — while still playing his own team-2 game at MD1; having
// played 2 games across the two teams burns him into team-2 (see
// computeBrulage in lib/brulage.ts: totalGames > 1 caps him at the highest
// team number he's still eligible for).
// ---------------------------------------------------------------------------
export const mockGameSelections: GameSelection[] = [
  // Equipe 1
  { gameId: 'g1-1', teamId: 'team-1', playerIds: ['p2-player-5', 'p2-player-1', 'p2-player-2', 'p2-player-3'] },
  { gameId: 'g1-2', teamId: 'team-1', playerIds: ['p2-player-5', 'p2-player-1', 'p2-player-2', 'p2-player-8'] },
  // g1-8 is the future "retour" fixture (see mockGames) — lineup already set.
  { gameId: 'g1-8', teamId: 'team-1', playerIds: ['p2-player-5', 'p2-player-1', 'p2-player-2', 'p2-player-3'] },
  // Equipe 2 (p2-player-8 sits out MD2 — he's playing up for team-1 that day)
  { gameId: 'g2-1', teamId: 'team-2', playerIds: ['p2-player-6', 'p2-player-10', 'p2-player-7', 'p2-player-8'] },
  { gameId: 'g2-2', teamId: 'team-2', playerIds: ['p2-player-6', 'p2-player-10', 'p2-player-7', 'p2-player-9'] },
  // Equipe 3
  { gameId: 'g3-1', teamId: 'team-3', playerIds: ['p2-player-12', 'p2-player-13', 'p2-player-14', 'p2-player-11'] },
  { gameId: 'g3-2', teamId: 'team-3', playerIds: ['p2-player-12', 'p2-player-13', 'p2-player-14', 'p2-player-17'] },
  // Equipe 4
  { gameId: 'g4-1', teamId: 'team-4', playerIds: ['p2-player-16', 'p2-player-19', 'p2-player-18', 'p2-player-15'] },
  { gameId: 'g4-2', teamId: 'team-4', playerIds: ['p2-player-16', 'p2-player-19', 'p2-player-18', 'p2-player-20'] },
  // Equipe 5 & 6 (derby at MD1 — both teams field a selection for game g5-1)
  { gameId: 'g5-1', teamId: 'team-5', playerIds: ['p2-player-22', 'p2-player-24', 'p2-player-21', 'p2-player-23'] },
  { gameId: 'g5-1', teamId: 'team-6', playerIds: ['p2-player-29', 'p2-player-39', 'p2-player-40', 'p2-player-41'] },
  { gameId: 'g5-2', teamId: 'team-5', playerIds: ['p2-player-22', 'p2-player-24', 'p2-player-21', 'p2-player-26'] },
  { gameId: 'g6-2', teamId: 'team-6', playerIds: ['p2-player-29', 'p2-player-42', 'p2-player-38', 'p2-player-43'] },
  // Equipe 7
  { gameId: 'g7-1', teamId: 'team-7', playerIds: ['p2-player-33', 'p2-player-35', 'p2-player-34'] },
  { gameId: 'g7-2', teamId: 'team-7', playerIds: ['p2-player-33', 'p2-player-35', 'p2-player-36'] },
  // Equipe 8
  { gameId: 'g8-1', teamId: 'team-8', playerIds: ['p2-player-32', 'p2-player-27', 'p2-player-28'] },
  { gameId: 'g8-2', teamId: 'team-8', playerIds: ['p2-player-32', 'p2-player-27', 'p2-player-30'] },
]

// ---------------------------------------------------------------------------
// Game Availabilities — a few responses on the upcoming "retour" games so the
// Accueil next-match widget and the game modal's disponibilités list aren't
// empty. Some roster players are left without a record to exercise the
// "À confirmer" (no response yet) state too.
// ---------------------------------------------------------------------------
export const mockGameAvailabilities: GameAvailability[] = [
  // g1-8 (team-1, in daysFromNow(14) days)
  { gameId: 'g1-8', playerId: 'p2-player-5', status: 'available' },
  { gameId: 'g1-8', playerId: 'p2-player-1', status: 'maybe' },
  { gameId: 'g1-8', playerId: 'p2-player-2', status: 'unavailable', overriddenBy: 'captain' },
  { gameId: 'g1-8', playerId: 'p2-player-3', status: 'available' },
  // g7-8 (team-7, in daysFromNow(21) days)
  { gameId: 'g7-8', playerId: 'p2-player-33', status: 'available' },
  { gameId: 'g7-8', playerId: 'p2-player-35', status: 'unavailable' },
]

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
// Every player is a user (is_player). Plus two admin-only users.
export const mockUsers: User[] = [
  { id: 'user-1', email: 'admin@example.com', role: 'general_admin', isPlayer: false },
  { id: 'user-2', email: 'club.admin@example.com', role: 'club_admin', isPlayer: false, clubId: 'club-fftt-06680011' },
  ...mockPlayers.map(
    (p): User => ({
      id: p.id,
      email: p.email,
      role: 'player',
      isPlayer: true,
      firstName: p.firstName,
      lastName: p.lastName,
      licenseNumber: p.licenseNumber,
      phone: p.phone,
      ...(p.birthDate ? { birthDate: p.birthDate } : {}),
      ...(p.birthPlace ? { birthPlace: p.birthPlace } : {}),
      status: p.status,
      clubId: p.clubId,
    }),
  ),
]

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------
export function getDisplayNameForUser(user: User): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
  }
  // E-mail was the last-resort label; a member may now have none (#315).
  return user.email ?? 'Utilisateur sans nom'
}

export function getRoleLabel(role: User['role']): string {
  const labels: Record<User['role'], string> = {
    general_admin: 'Administrateur général',
    club_admin: 'Administrateur de club',
    player: 'Joueur',
  }
  return labels[role]
}
