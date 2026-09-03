import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DEV_LOGIN, useAuth } from '@/contexts/AuthContext'
import type { Division } from '@/types'
import type {
  Address,
  Club,
  ClubChannel,
  Competition,
  CompetitionEligibility,
  EligibilityEffect,
  DataState,
  Organization,
  Season,
  SeasonStatus,
  Phase,
  Group,
  Team,
  Player,
  PlayerPhasePoints,
  MatchDay,
  Game,
  GameAvailability,
  GameSelection,
  AvailabilityStatus,
  AvailabilityOverriddenBy,
  User,
} from '@/types'
import {
  mockDivisions,
  mockClubs,
  mockSeasons,
  mockPhases,
  mockGroups,
  mockTeams,
  mockPlayers,
  mockPlayerPhasePoints,
  mockMatchDays,
  mockGames,
  mockGameAvailabilities,
  mockGameSelections,
  mockUsers,
  mockCompetitions,
  mockCompetitionEligibilities,
} from '@/mock/data'
import { clearCache, readCache, writeCache } from '@/lib/offlineCache'
import { seasonIdFromName } from '@/lib/season'
import { ffttPhaseIdForName, localPhaseId, phaseOrderKey } from '@/lib/ffttPhases'
import { fetchFfttCurrentSeasonFromBrowser, fetchTextFromBrowser, ffttGraphqlFromBrowser } from '@/lib/ffttClient'
import { clubIdFromAffiliation, gameIdFor, teamIdFor } from '@/lib/entityIds'
import { parsePoolOpponents, poolOpponentsQuery, type FfttClubTeam, type FfttPoolOpponentNode } from '@/lib/ffttTeams'
import { divisionPoolsQuery, parseDivisionPools, selectPoolForGroup, type FfttDivisionPoolsData, type FfttPool } from '@/lib/ffttGames'
import {
  dafunkerClubTeamsUrl, dafunkerResultsUrl, parseDafunkerClubTeamsXml, parseDafunkerResultsXml,
} from '@/lib/ffttGamesXml'
import { deriveMatchDayDate } from '@/lib/matchdays'

// Chronology-aware demotion (#227): what stops being active is archived when
// older than what becomes active, back to 'upcoming' when newer (rollback).
const demotedSeasonStatus = (seasonId: string, newSeasonId: string): SeasonStatus =>
  Number(seasonId) < Number(newSeasonId) ? 'archived' : 'upcoming'

// DataState moved to src/types (#285): it is the GET /api/data contract, so
// the API is annotated with the same declaration this file asserts against.

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// An empty e-mail is how the forms say "no address"; the API stores NULL and
// /api/data then omits the key, so local state holds undefined rather than ''
// — otherwise the optimistic row would disagree with the one after a reload,
// and `email ?? fallback` chains would pick the empty string (#315).
function withoutEmptyEmail<T extends { email?: string }>(p: T): T {
  return 'email' in p && !p.email ? { ...p, email: undefined } : p
}

/** Response of GET /api/seasons/fftt-current. */
export interface FfttCurrentSeason {
  id: string
  displayName: string
  /** Whether this season already exists in our database. */
  exists: boolean
  /** Local status when it exists — 'archived' means it should be re-activated, not imported. */
  status?: SeasonStatus
}

/** One contest in the FFTT competitions preview (GET /api/fftt/competitions-preview, #482). */
export interface FfttCompetitionPreview {
  /** The stable FFTT identity — what a competition is keyed on. */
  identifier: string
  /** FFTT's own name for it. */
  name: string
  /** Already held locally: the import skips it. */
  exists: boolean
  /** Our name for it when we hold it — a general admin may have renamed it. */
  localName?: string
}

/** One championship the admin ticked, with the name they want it stored under. */
export interface FfttCompetitionSelection {
  identifier: string
  /** Blank or absent falls back to FFTT's own name. */
  name?: string
}

/** Response of POST /api/competitions/import. */
export interface FfttCompetitionsImportResult {
  created: Competition[]
  skipped: Array<{ identifier: string; name: string }>
}

/** One division in the FFTT import preview (GET /api/fftt/divisions-preview). */
export interface FfttDivisionPreview {
  id: string
  identifier: string
  name: string
  rank: number
  playersPerGame: number
  /** Already present locally for that phase — will be skipped on import. */
  exists: boolean
  /**
   * Present, but filed under no competition (#482): importing attaches it.
   * This is why an import where everything already exists is still worth
   * running — and why the button must not read "Rien à importer" then.
   */
  attachable?: boolean
}

export interface FfttDivisionsPreview {
  contest: { id: string; identifier: string; name: string }
  /**
   * The competition the import will file these divisions under (#482). The
   * import is pinned to one FFTT contest, so it already knows; `exists: false`
   * means the competition does not exist yet and the import will create it.
   */
  competition: { id?: string; displayName: string; exists: boolean }
  phaseExists: boolean
  divisions: FfttDivisionPreview[]
}

/** Response of POST /api/divisions/import. */
export interface FfttDivisionsImportResult {
  phase: Phase
  createdPhase: boolean
  created: Division[]
  skipped: Array<{ id: string; name: string }>
}

/** One team in the FFTT import preview (GET /api/fftt/teams-preview, #229). */
export interface FfttTeamPreview {
  /** FFTT team id — becomes the local team id on import. */
  id: string
  /** Simplified display name, e.g. "PPA Rixheim 2" (consistent with existing teams). */
  name: string
  number: number
  /** FFTT phase (1..3); null when undetectable from the labels. */
  phase: number | null
  divisionId: string
  divisionName: string
  /** False = the division will be auto-imported (needs a detectable phase). */
  divisionExists: boolean
  poolNumber: number | null
  /** Already present locally — will be skipped on import. */
  exists: boolean
  /** Already present, but FFTT engages it in another poule: an import moves it (#422). */
  moved?: boolean
  /** The poule it sits in today, when it moves. */
  fromPoolNumber?: number | null
  fromDivisionName?: string | null
  /** Whether the import can create — or move — this team. */
  importable: boolean
}

export interface FfttTeamsPreview {
  club: { id: string; displayName: string }
  season: FfttCurrentSeason
  teams: FfttTeamPreview[]
}

/** Response of POST /api/teams/import. */
export interface FfttTeamsImportResult {
  createdPhases: Phase[]
  createdDivisions: Division[]
  /** Created + updated groups in their final state (client-side upsert). */
  groups: Group[]
  createdTeams: Team[]
  /** Teams FFTT now engages in another poule, moved rather than skipped (#422). */
  movedTeams?: Array<{ id: string; groupId: string; previousGroupId: string }>
  /** Fixtures of the poule the moved teams left, removed with them. */
  deletedGames?: string[]
  deletedMatchDays?: string[]
  skipped: Array<{ id: string; label: string; reason: 'already_exists' | 'division_missing' | 'invalid_location' }>
}

/** Per-team venue / day / time chosen in the import dialog (#229 follow-up). */
export interface TeamImportOverride {
  id: string
  gameLocationId: string
  defaultDay: string
  defaultTime: string
}

/** One group in the FFTT games preview (GET /api/fftt/games-preview, #231). */
export interface FfttGamesGroupPreview {
  groupId: string
  /** Set when the group can't be imported; the count fields are then absent.
   *  'calendar_not_published' = the FFTT hasn't put this division's calendar
   *  on apiv2 yet (season start) — retry later, nothing is wrong locally. */
  error?: 'group_not_found' | 'fftt_unavailable' | 'pool_not_found' | 'calendar_not_published'
  /** Present alongside `error` too, whenever the group exists locally. */
  groupNumber?: number
  divisionName?: string
  /** Distinct rounds (journées) found on FFTT. */
  rounds?: number
  matches?: number
  newMatchDays?: number
  newGames?: number
  existingGames?: number
  /** Already present, but on a different date than FFTT now publishes (#289). */
  dateMismatches?: number
  /** Already present but with no FFTT match id, which the import would link (#294). */
  ffttIdsToLink?: number
  /** Present locally, absent from the pool FFTT now publishes (#422). */
  obsoleteGames?: number
  /** Of those, how many carry a slot agreed by hand — removing them loses it. */
  obsoleteManualGames?: number
  /** Teams of the group playing none of the pool's matches any more (#422). */
  departingTeams?: number
  /** Opponent teams that would be auto-created for this group. */
  newTeams?: number
}

export interface FfttGamesPreview {
  groups: FfttGamesGroupPreview[]
  /** Deduplicated across all requested groups. */
  totals: { newClubs: number; newTeams: number }
}

/** The two things a games import can do beyond adding what is missing (#289, #422). */
export interface ImportGamesOptions {
  /** Take FFTT's dates for fixtures already present. */
  updateDates?: boolean
  /** Remove the fixtures and teams the pool no longer holds. */
  removeObsolete?: boolean
}

/** Response of POST /api/games/import. */
export interface FfttGamesImportResult {
  createdClubs: Club[]
  createdTeams: Team[]
  /** Groups whose team list changed, in their final state (client-side upsert). */
  groups: Group[]
  createdMatchDays: MatchDay[]
  /** Journées whose derived date changed since the last import (re-import sync). */
  updatedMatchDays: MatchDay[]
  createdGames: Game[]
  /** Existing games whose FFTT date changed since the last import (re-import sync); their time is never touched. */
  updatedGames: Game[]
  skippedGroups: Array<{ groupId: string; reason: 'group_not_found' | 'fftt_unavailable' | 'pool_not_found' | 'calendar_not_published' }>
  existingGames: number
  /** Ids of the fixtures removed because the pool no longer holds them (#422). */
  deletedGames?: string[]
  /** Of those, how many carried a slot agreed by hand. */
  deletedManualGames?: number
  /** Journées deleted because they were left with no game at all. */
  deletedMatchDays?: string[]
  /** Teams dropped from a group's roster, having left the pool. */
  departedTeams?: number
  /** Already present and agreed by hand, left exactly as they are (#294). */
  manualKept?: number
  /** Games that gained their FFTT match id in this run (#294). */
  ffttIdsBackfilled?: number
  skippedMatches: number
}

/** One pool/group in the FFTT groups import preview (POST /api/fftt/groups-preview, #237). */
export interface FfttGroupPreview {
  /** FFTT pool id — becomes the local group id on import. */
  id: string
  /** Poule number parsed from the FFTT name; null when unreadable. */
  number: number | null
  /** Already present locally for that division — will be skipped on import. */
  exists: boolean
}

export interface FfttGroupsPreview {
  divisionId: string
  divisionName: string
  groups: FfttGroupPreview[]
}

/** Response of POST /api/groups/import (#237). */
export interface FfttGroupsImportResult {
  created: Group[]
  skipped: Array<{ id: string; number: number | null }>
}

// --- Schedule document import (#260) ---
// Alternative to the FFTT-API imports above: the browser parses an uploaded
// PDF/image itself (see src/lib/ffttScheduleDocument.ts) and the admin
// confirms, per document, which existing phase/division/group/club/team it
// maps to — so unlike the FFTT flows there is no server preview round trip;
// the "preview" is the confirmation table built from data already in this
// context, and this single call both validates and persists.
export interface ScheduleDocImportTeam { name: string; number: number; affiliationNumber: string; day?: string; time?: string }
export interface ScheduleDocImportMatch { homeName: string; homeNumber: number; awayName: string; awayNumber: number; date: string | null; time?: string }
export interface ScheduleDocImportJournee { number: number; date: string; matches: ScheduleDocImportMatch[] }

export interface ScheduleDocImportInput {
  seasonId: string
  phaseNumber: number
  /** Existing division id chosen by the admin; null to create one from newDivisionLabel. */
  divisionId: string | null
  newDivisionLabel: string
  /** Existing group id chosen by the admin; null to create one numbered newGroupNumber. */
  groupId: string | null
  newGroupNumber: number | null
  teams: ScheduleDocImportTeam[]
  journees: ScheduleDocImportJournee[]
}

/** Response of POST /api/schedule-documents/import (#260). */
export interface ScheduleDocImportResult {
  createdPhases: Phase[]
  createdDivisions: Division[]
  createdGroups: Group[]
  createdClubs: Club[]
  createdTeams: Team[]
  /** Every touched group (created or team-list-updated), in its final state. */
  groups: Group[]
  createdMatchDays: MatchDay[]
  /** Existing journées whose derived date changed because a newly-imported game landed under them (#271). */
  updatedMatchDays: MatchDay[]
  createdGames: Game[]
  /** Ids of the fixtures removed because this edition no longer states them (#422). */
  deletedGames?: string[]
  /** Of those, how many carried a slot agreed by hand. */
  deletedManualGames?: number
  /** Journées deleted because they were left with no game at all. */
  deletedMatchDays?: string[]
  /** Teams dropped from a group's roster, absent from the document. */
  departedTeams?: number
  skippedSchedules: Array<{ index: number; reason: string }>
  existingGames: number
  /** Already present with a different date/time than the document states (#298). */
  slotMismatches?: number
  /** Existing games whose date/time this run took from the document (#298). */
  updatedGameSlots?: number
  /** Matches whose home/away team name couldn't be joined back to a roster entry (OCR variance between the roster line and that match's line) — not imported. */
  skippedMatches: number
  /** Which side(s) of each skipped match couldn't be resolved, and what name/number the parser read (bounded to 30 entries). */
  skippedMatchDetails: Array<{ side: 'home' | 'away'; name: string; number: number }>
}

// Read the current session token (set by AuthContext) for the Authorization
// header. Read at call time so mutations always use the latest token.
function sessionToken(): string | null {
  try {
    return window.localStorage.getItem('pp-club-session')
  } catch {
    return null
  }
}

function authHeaders(): Record<string, string> {
  const token = sessionToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function api(path: string, options?: RequestInit) {
  return fetch(`/api${path}`, {
    headers: authHeaders(),
    ...options,
  }).catch(console.error)
}

/**
 * The answer to an admin appointment: the API decides (the cap and the
 * never-zero rule are its to enforce), and its French refusal comes back for
 * display rather than being rebuilt here (#474).
 */
export type ClubAdminResult = { ok: true } | { ok: false; message: string }

/** Who to appoint: a member the club already has, or someone new by name. */
export type ClubAdminTarget =
  | { userId: string }
  | { firstName: string; lastName: string; email: string; phone?: string }

interface DataContextValue extends DataState {
  updateDivision: (id: string, patch: Partial<Division>) => void
  /** Create a competition — general admin only, enforced by the API (#482). */
  addCompetition: (data: Omit<Competition, 'id'>) => Competition
  updateCompetition: (id: string, patch: Partial<Competition>) => void
  /** Deleting one detaches its divisions rather than taking them with it. */
  deleteCompetition: (id: string) => void
  /**
   * A club's amendment for one licensee, or 'default' to drop it. Refused by
   * the API when the competition is locked and the player is out of category,
   * which is why this answers rather than returning void.
   */
  setCompetitionEligibility: (
    clubId: string,
    competitionId: string,
    playerId: string,
    effect: EligibilityEffect | 'default',
  ) => Promise<boolean>
  archiveDivision: (id: string) => void
  deleteDivision: (id: string) => void
  updateClub: (id: string, patch: Partial<Club>) => void
  archiveClub: (id: string) => void
  deleteClub: (id: string) => void
  addClubAddress: (clubId: string, data: Omit<Address, 'id'>) => Address
  updateClubAddress: (clubId: string, addressId: string, patch: Partial<Address>) => void
  deleteClubAddress: (clubId: string, addressId: string) => void
  setClubLogo: (clubId: string, base64: string, contentType: string) => void
  removeClubLogo: (clubId: string) => void
  addClubChannel: (clubId: string, data: Omit<ClubChannel, 'id' | 'sortOrder'>) => ClubChannel
  updateClubChannel: (clubId: string, channelId: string, patch: Partial<Omit<ClubChannel, 'id'>>) => void
  deleteClubChannel: (clubId: string, channelId: string) => void
  reorderClubChannels: (clubId: string, orderedIds: string[]) => void
  updateSeason: (id: string, patch: Partial<Season>) => void
  archiveSeason: (id: string) => void
  deleteSeason: (id: string) => void
  /** Check the FFTT API for the current season; null when unreachable. */
  checkFfttSeason: () => Promise<FfttCurrentSeason | null>
  /** Import the FFTT current season (active) and archive the previous one; null on failure. */
  importFfttSeason: () => Promise<Season | null>
  /** Locally cached FFTT organizations; refresh=true re-syncs from FFTT. Null on failure. */
  fetchOrganizations: (refresh?: boolean) => Promise<Organization[] | null>
  /** Preview the FFTT divisions for (organization, season, phase 1|2). */
  /** The championships FFTT runs for an (organisation, season) (#482). */
  fetchCompetitionsPreview: (organizationId: string, seasonId: string) => Promise<FfttCompetitionPreview[] | null>
  importFfttCompetitions: (
    organizationId: string, seasonId: string, selections: FfttCompetitionSelection[],
  ) => Promise<FfttCompetitionsImportResult | null>
  fetchDivisionsPreview: (organizationId: string, seasonId: string, phase: number, contestIdentifier?: string) => Promise<FfttDivisionsPreview | 'no_contest' | null>
  /** Import the FFTT divisions (creates the phase if missing, skips existing). */
  importFfttDivisions: (
    organizationId: string, seasonId: string, phase: number,
    contestIdentifier?: string,
    /** Which divisions to act on; omitted means every one the preview offered. */
    divisionIds?: string[],
  ) => Promise<FfttDivisionsImportResult | null>
  /** Preview a club's FFTT teams (#229); 'club_not_found' or null on failure. */
  fetchTeamsPreview: (clubId: string) => Promise<FfttTeamsPreview | 'club_not_found' | null>
  /** Import a club's FFTT teams with the chosen defaults (venue / day / time). */
  importFfttTeams: (clubId: string, teams: TeamImportOverride[]) => Promise<FfttTeamsImportResult | null>
  /** Preview the FFTT calendars of the given groups (#231); null on failure. */
  fetchGamesPreview: (groupIds: string[], teamId?: string) => Promise<FfttGamesPreview | null>
  /** Import the FFTT calendars (journées + matchs, auto-creating opponents). */
  importFfttGames: (groupIds: string[], teamId?: string, options?: ImportGamesOptions) => Promise<FfttGamesImportResult | null>
  /** Preview a division's FFTT groups/pools (#237); null on failure. */
  fetchGroupsPreview: (divisionId: string) => Promise<FfttGroupsPreview | null>
  /** Import a division's FFTT groups not already present locally. */
  importFfttGroups: (divisionId: string) => Promise<FfttGroupsImportResult | null>
  /** Import schedule documents (PDF/image, #260) confirmed by the admin; null on failure. */
  importScheduleDocuments: (schedules: ScheduleDocImportInput[], updateSlots?: boolean, removeObsolete?: boolean) => Promise<ScheduleDocImportResult | null>
  updatePhase: (id: string, patch: Partial<Phase>) => void
  archivePhase: (id: string) => void
  deletePhase: (id: string) => void
  updateGroup: (id: string, patch: Partial<Group>) => void
  archiveGroup: (id: string) => void
  deleteGroup: (id: string) => void
  /** Delete every journée/match (and their availabilities/selections) of a group — keeps the group and its teams (#270). */
  resetGroupGames: (id: string) => void
  updateTeam: (id: string, patch: Partial<Team>) => void
  /** Move a team to another poule (#422): its fixtures in the one it leaves go with it. */
  moveTeamToGroup: (teamId: string, groupId: string) => Promise<void>
  archiveTeam: (id: string) => void
  deleteTeam: (id: string) => void
  addClub: (data: Omit<Club, 'id'>) => Club
  /** Returns null when the display name is not a valid season name (YYYY/YYYY+1). */
  addSeason: (data: Omit<Season, 'id'>) => Season | null
  addPhase: (data: Omit<Phase, 'id'>) => Phase
  addDivision: (data: Omit<Division, 'id'>) => Division
  addGroup: (data: Omit<Group, 'id'>) => Group
  addTeam: (data: Omit<Team, 'id'>) => Team
  moveDivisionUp: (divisionId: string) => void
  moveDivisionDown: (divisionId: string) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  addPlayer: (data: Omit<Player, 'id'>) => Player
  /** Appoint a club admin — at most 5 per club, decided by the API (#474). */
  addClubAdmin: (clubId: string, target: ClubAdminTarget) => Promise<ClubAdminResult>
  /** Stand one down; refused for the last admin a club has (#474). */
  removeClubAdmin: (clubId: string, userId: string) => Promise<ClubAdminResult>
  /** Upsert points for (phase, player) — the FFTT import's only write (#384). */
  setPlayerPhasePoints: (updates: PlayerPhasePoints[]) => void
  setAvatar: (id: string, base64: string, contentType: string) => Promise<void>
  removeAvatar: (id: string) => Promise<void>
  matchDays: MatchDay[]
  games: Game[]
  updateMatchDay: (id: string, patch: Partial<MatchDay>) => void
  addMatchDay: (data: Omit<MatchDay, 'id'>) => MatchDay
  updateGame: (id: string, patch: Partial<Game>) => void
  addGame: (data: Omit<Game, 'id'>) => Game
  gameAvailabilities: GameAvailability[]
  setGameAvailability: (
    gameId: string,
    playerId: string,
    status: AvailabilityStatus,
    overriddenBy?: AvailabilityOverriddenBy
  ) => void
  clearGameAvailability: (gameId: string, playerId: string) => void
  gameSelections: GameSelection[]
  /**
   * ISO timestamp of the cached data currently on screen, or null when the
   * data came from the network. Drives the offline banner (#387).
   */
  staleSince: string | null
  getGameSelectionPlayerIds: (gameId: string, teamId: string) => string[]
  setGameSelection: (gameId: string, teamId: string, playerIds: string[]) => void
  setGameSelectionBatch: (
    updates: Array<{ gameId: string; teamId: string; playerIds: string[] }>
  ) => void
}

const DataContext = createContext<DataContextValue | null>(null)

interface DataProviderProps {
  children: React.ReactNode
  /** When provided, skip API fetch and use this data (for tests). */
  initialData?: DataState
}

export function DataProvider({ children, initialData }: DataProviderProps) {
  const { token, logout, user, loading: authLoading } = useAuth()
  const [divisions, setDivisions] = useState<Division[]>(initialData?.divisions ?? [])
  const [competitions, setCompetitions] = useState<Competition[]>(initialData?.competitions ?? [])
  const [competitionEligibilities, setCompetitionEligibilities] = useState<CompetitionEligibility[]>(
    initialData?.competitionEligibilities ?? [],
  )
  const [clubs, setClubs] = useState<Club[]>(initialData?.clubs ?? [])
  const [seasons, setSeasons] = useState<Season[]>(initialData?.seasons ?? [])
  const [phases, setPhases] = useState<Phase[]>(initialData?.phases ?? [])
  const [groups, setGroups] = useState<Group[]>(initialData?.groups ?? [])
  const [teams, setTeams] = useState<Team[]>(initialData?.teams ?? [])
  const [players, setPlayers] = useState<Player[]>(initialData?.players ?? [])
  // Every member, players and non-playing admins alike. The payload has always
  // carried this; before #474 nothing on the web read it, so it was dropped on
  // the floor. A club's admins cannot be found in `players`: an invited
  // secretary is a user who never appears there.
  const [users, setUsers] = useState<User[]>(initialData?.users ?? [])
  const [playerPhasePoints, setPlayerPhasePointsState] = useState<PlayerPhasePoints[]>(
    initialData?.playerPhasePoints ?? []
  )
  const [matchDays, setMatchDays] = useState<MatchDay[]>(initialData?.matchDays ?? [])
  const [games, setGames] = useState<Game[]>(initialData?.games ?? [])
  const [gameAvailabilities, setGameAvailabilities] = useState<GameAvailability[]>(
    initialData?.gameAvailabilities ?? []
  )
  const [gameSelections, setGameSelections] = useState<GameSelection[]>(
    initialData?.gameSelections ?? []
  )
  const [loading, setLoading] = useState(!initialData)
  const [persist, setPersist] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  /** When set, the screen is showing cached data: the last fetch did not land. */
  const [staleSince, setStaleSince] = useState<string | null>(null)

  // A cache belongs to one member. Dropping it as soon as nobody is signed in
  // keeps the next person on a shared phone from meeting the previous one's
  // club, and costs only a refetch (#387).
  const userId = user?.id ?? null
  useEffect(() => {
    if (initialData) return
    if (!userId) clearCache()
  }, [initialData, userId])

  useEffect(() => {
    if (initialData) return
    // Wait for auth to settle first. The cache is keyed to the member, so
    // loading before we know who they are would both miss it and cost a second
    // fetch the moment they arrived (#387).
    if (authLoading) return
    let cancelled = false
    setError(null)

    function applyData(data: DataState) {
      setSeasons(data.seasons)
      setPhases(data.phases)
      setDivisions(data.divisions)
      setCompetitions(data.competitions ?? [])
      setCompetitionEligibilities(data.competitionEligibilities ?? [])
      setClubs(data.clubs)
      setGroups(data.groups)
      setTeams(data.teams)
      setPlayers(data.players)
      setUsers(data.users ?? [])
      setPlayerPhasePointsState(data.playerPhasePoints ?? [])
      setMatchDays(data.matchDays)
      setGames(data.games)
      setGameAvailabilities(data.gameAvailabilities)
      setGameSelections(data.gameSelections)
    }

    function fallbackToMock() {
      console.warn('API unavailable, falling back to mock data (no persistence)')
      setPersist(false)
      applyData({
        seasons: mockSeasons, phases: mockPhases, divisions: mockDivisions,
        competitions: mockCompetitions,
        competitionEligibilities: mockCompetitionEligibilities,
        clubs: mockClubs, groups: mockGroups, teams: mockTeams, players: mockPlayers,
        playerPhasePoints: mockPlayerPhasePoints,
        matchDays: mockMatchDays, games: mockGames,
        gameAvailabilities: mockGameAvailabilities,
        gameSelections: mockGameSelections, users: mockUsers,
      })
    }

    // Show the last known data straight away, before the network is asked.
    // Offline that is the whole answer; online it just removes the spinner.
    const cached = userId ? readCache(userId) : null
    if (cached) {
      applyData(cached.data)
      setStaleSince(cached.fetchedAt)
      setLoading(false)
    } else {
      setLoading(true)
    }

    fetch('/api/data', { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          // Session expired/invalid — force a re-login rather than showing
          // stale or fake data.
          logout()
          return null
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: DataState | null) => {
        if (cancelled || !data) return
        applyData(data)
        setStaleSince(null)
        if (userId) writeCache(userId, data)
      })
      .catch((err) => {
        if (cancelled) return
        if (cached) {
          // Cached data is on screen already: say it is old and let the member
          // carry on reading. Replacing a readable line-up with an error page
          // is the failure this issue is about.
          //
          // Ahead of the mock fallback deliberately, including in dev: a cache
          // only exists because a real fetch once succeeded for this member, so
          // it beats fixtures. Falling through to mock here also left the
          // banner claiming a date for data that was not theirs.
          console.warn('Failed to refresh /api/data, serving cached data', err)
          setStaleSince(cached.fetchedAt)
        } else if (DEV_LOGIN) {
          // No real backend in local dev / E2E — mock data keeps the app usable.
          setStaleSince(null)
          fallbackToMock()
        } else {
          console.error('Failed to load /api/data', err)
          setError('Impossible de charger les données. Vérifiez votre connexion.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Refetch when the session token changes (e.g. after login) or on retry.
  }, [initialData, token, retryNonce, logout, userId, authLoading])

  // Coming back online is the moment the cache stops being the best answer.
  useEffect(() => {
    if (initialData) return
    const onOnline = () => setRetryNonce((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [initialData])

  // --- Seasons ---
  // Mirrors the API's single-active invariant: activating a season demotes
  // the previously active one (archived when older, 'upcoming' when newer).
  const applySeasonPatch = (prev: Season[], id: string, patch: Partial<Season>): Season[] =>
    prev.map((s) => {
      if (s.id === id) return { ...s, ...patch }
      if (patch.status === 'active' && s.status === 'active') return { ...s, status: demotedSeasonStatus(s.id, id) }
      return s
    })

  // Season→phase cascade (#227), symmetric with the phase→season one: keep
  // the active phase when it belongs to the newly activated season, otherwise
  // switch to that season's most recent phase, Phase 2 over Phase 1 (or none
  // when it has no phases).
  const alignActivePhaseToSeason = useCallback((seasonId: string) => {
    setPhases((prev) => {
      const actives = prev.filter((p) => p.status === 'active')
      if (actives.length > 0 && actives.every((p) => p.seasonId === seasonId)) return prev
      const latest = prev
        .filter((p) => p.seasonId === seasonId && p.status !== 'archived')
        .sort((a, b) => b.name.localeCompare(a.name))[0]
      const newKey = phaseOrderKey(seasonId, latest?.name ?? '')
      return prev.map((p) => {
        if (latest && p.id === latest.id) return { ...p, status: 'active' as const }
        if (p.status !== 'active') return p
        return { ...p, status: phaseOrderKey(p.seasonId, p.name) < newKey ? 'archived' as const : 'upcoming' as const }
      })
    })
  }, [])

  const updateSeason = useCallback((id: string, patch: Partial<Season>) => {
    setSeasons((prev) => applySeasonPatch(prev, id, patch))
    if (patch.status === 'active') alignActivePhaseToSeason(id)
    if (persist) api(`/seasons/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist, alignActivePhaseToSeason])

  const addSeason = useCallback((data: Omit<Season, 'id'>): Season | null => {
    // Season ids are derived from the name, aligned with FFTT (#217).
    const id = seasonIdFromName(data.displayName)
    if (!id) return null
    const season: Season = { ...data, displayName: data.displayName.trim(), id }
    setSeasons((prev) => [
      ...(season.status === 'active'
        ? prev.map((s) => (s.status === 'active' ? { ...s, status: demotedSeasonStatus(s.id, id) } : s))
        : prev),
      season,
    ])
    if (season.status === 'active') alignActivePhaseToSeason(id)
    if (persist) api('/seasons', { method: 'POST', body: JSON.stringify(season) })
    return season
  }, [persist, alignActivePhaseToSeason])

  const archiveSeason = useCallback((id: string) => {
    setSeasons((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'archived' } : s)))
    if (persist) api(`/seasons/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) })
  }, [persist])

  // --- FFTT season sync (#217) ---
  const checkFfttSeason = useCallback(async (): Promise<FfttCurrentSeason | null> => {
    try {
      const r = await fetch('/api/seasons/fftt-current', { headers: authHeaders() })
      if (!r.ok) return null
      return (await r.json()) as FfttCurrentSeason
    } catch {
      return null
    }
  }, [])

  const importFfttSeason = useCallback(async (): Promise<Season | null> => {
    try {
      const r = await fetch('/api/seasons/import-current', {
        method: 'POST',
        headers: authHeaders(),
      })
      if (!r.ok) return null
      const { season } = (await r.json()) as { season: Season }
      setSeasons((prev) => [
        ...prev.map((s) => (s.status === 'active' ? { ...s, status: demotedSeasonStatus(s.id, season.id) } : s)),
        season,
      ])
      // A freshly imported season has no phases yet → no phase stays active.
      alignActivePhaseToSeason(season.id)
      return season
    } catch {
      return null
    }
  }, [alignActivePhaseToSeason])

  // --- FFTT divisions import (#219) ---
  const fetchOrganizations = useCallback(async (refresh = false): Promise<Organization[] | null> => {
    try {
      const r = await fetch('/api/fftt/organizations' + (refresh ? '/refresh' : ''), {
        method: refresh ? 'POST' : 'GET',
        headers: authHeaders(),
      })
      if (!r.ok) return null
      const { organizations } = (await r.json()) as { organizations: Organization[] }
      return organizations
    } catch {
      return null
    }
  }, [])

  const fetchCompetitionsPreview = useCallback(async (
    organizationId: string, seasonId: string,
  ): Promise<FfttCompetitionPreview[] | null> => {
    try {
      const params = new URLSearchParams({ organizationId, seasonId })
      const r = await fetch(`/api/fftt/competitions-preview?${params}`, { headers: authHeaders() })
      if (!r.ok) return null
      const body = (await r.json()) as { competitions: FfttCompetitionPreview[] }
      return body.competitions
    } catch {
      return null
    }
  }, [])

  const importFfttCompetitions = useCallback(async (
    organizationId: string, seasonId: string, selections: FfttCompetitionSelection[],
  ): Promise<FfttCompetitionsImportResult | null> => {
    try {
      const r = await fetch('/api/competitions/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ organizationId, seasonId, selections }),
      })
      if (!r.ok) return null
      const result = (await r.json()) as FfttCompetitionsImportResult
      if (result.created.length) setCompetitions((prev) => [...prev, ...result.created])
      return result
    } catch {
      return null
    }
  }, [])

  const fetchDivisionsPreview = useCallback(async (
    organizationId: string, seasonId: string, phase: number, contestIdentifier?: string,
  ): Promise<FfttDivisionsPreview | 'no_contest' | null> => {
    try {
      const params = new URLSearchParams({
        organizationId, seasonId, phase: String(phase),
        ...(contestIdentifier ? { contestIdentifier } : {}),
      })
      const r = await fetch(`/api/fftt/divisions-preview?${params}`, { headers: authHeaders() })
      if (r.status === 404) return 'no_contest'
      if (!r.ok) return null
      return (await r.json()) as FfttDivisionsPreview
    } catch {
      return null
    }
  }, [])

  const importFfttDivisions = useCallback(async (
    organizationId: string, seasonId: string, phase: number,
    contestIdentifier?: string, divisionIds?: string[],
  ): Promise<FfttDivisionsImportResult | null> => {
    try {
      const r = await fetch('/api/divisions/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ organizationId, seasonId, phase, contestIdentifier, divisionIds }),
      })
      if (!r.ok) return null
      const result = (await r.json()) as FfttDivisionsImportResult
      if (result.createdPhase) setPhases((prev) => [...prev, result.phase])
      if (result.created.length) setDivisions((prev) => [...prev, ...result.created])
      return result
    } catch {
      return null
    }
  }, [])

  // --- FFTT teams import (#229, transport reworked in #231 follow-up) ---
  // FFTT blocks Cloudflare's egress IPs, so the FFTT reads happen here in the
  // browser (apiv2 allows CORS) and the parsed payload is handed to our API,
  // which validates and persists. The payload of the last successful preview
  // is kept per club so the import sends exactly what the admin previewed.
  const teamsPayloadRef = useRef<Record<string, { season: { id: string; displayName: string }; ffttTeams: FfttClubTeam[] }>>({})

  const fetchTeamsPreview = useCallback(async (
    clubId: string,
  ): Promise<FfttTeamsPreview | 'club_not_found' | null> => {
    try {
      const club = clubs.find((cl) => cl.id === clubId)
      if (!club) return 'club_not_found'
      const [season, data] = await Promise.all([
        fetchFfttCurrentSeasonFromBrowser(),
        ffttGraphqlFromBrowser<{ poolOpponents?: { edges?: Array<{ node?: FfttPoolOpponentNode }> } }>(
          poolOpponentsQuery(club.affiliationNumber),
        ),
      ])
      if (!season || data === null) return null
      const ffttTeams = parsePoolOpponents(data.poolOpponents?.edges)
      const r = await fetch('/api/fftt/teams-preview', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ clubId, season, ffttTeams }),
      })
      if (r.status === 404) return 'club_not_found'
      if (!r.ok) return null
      teamsPayloadRef.current[clubId] = { season, ffttTeams }
      return (await r.json()) as FfttTeamsPreview
    } catch {
      return null
    }
  }, [clubs])

  /**
   * Drop from local state what an import just deleted server-side (#422):
   * fixtures a rebuilt poule no longer holds, and the journées they emptied.
   * Availabilities and compositions go with them, exactly as the API's
   * cascade does — leaving them would keep answers to matches that are gone.
   */
  const applyImportDeletions = useCallback((
    deletedGames?: string[], deletedMatchDays?: string[],
  ) => {
    if (deletedGames?.length) {
      const gone = new Set(deletedGames)
      setGames((prev) => prev.filter((g) => !gone.has(g.id)))
      setGameAvailabilities((prev) => prev.filter((a) => !gone.has(a.gameId)))
      setGameSelections((prev) => prev.filter((sel) => !gone.has(sel.gameId)))
    }
    if (deletedMatchDays?.length) {
      const gone = new Set(deletedMatchDays)
      setMatchDays((prev) => prev.filter((m) => !gone.has(m.id)))
    }
  }, [])

  const importFfttTeams = useCallback(async (
    clubId: string, overrides: TeamImportOverride[],
  ): Promise<FfttTeamsImportResult | null> => {
    try {
      const payload = teamsPayloadRef.current[clubId]
      if (!payload) return null
      const r = await fetch('/api/teams/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ clubId, teams: overrides, ...payload }),
      })
      if (!r.ok) return null
      const result = (await r.json()) as FfttTeamsImportResult
      if (result.createdPhases.length) setPhases((prev) => [...prev, ...result.createdPhases])
      if (result.createdDivisions.length) setDivisions((prev) => [...prev, ...result.createdDivisions])
      if (result.groups.length) {
        // Upsert: the import both creates pools and appends teams to existing ones.
        setGroups((prev) => [
          ...prev.filter((g) => !result.groups.some((u) => u.id === g.id)),
          ...result.groups,
        ])
      }
      if (result.createdTeams.length) setTeams((prev) => [...prev, ...result.createdTeams])
      if (result.movedTeams?.length) {
        const movedTo = new Map(result.movedTeams.map((t) => [t.id, t.groupId]))
        setTeams((prev) => prev.map((t) => {
          const groupId = movedTo.get(t.id)
          if (!groupId) return t
          // divisionId is derived from the group (#282), and the response's
          // groups carry the destination in its final state.
          return { ...t, groupId, divisionId: result.groups.find((g) => g.id === groupId)?.divisionId ?? t.divisionId }
        }))
      }
      applyImportDeletions(result.deletedGames, result.deletedMatchDays)
      return result
    } catch {
      return null
    }
  }, [applyImportDeletions])

  // --- FFTT games import (#231, browser-side transport like the teams) ---
  // The browser fetches each requested group's schedule from dafunker
  // (FFTT/dafunker block Cloudflare egress) and hands the parsed payload to
  // our API. The payload of the last successful preview is kept per group
  // set so the import sends exactly what the admin previewed.
  //
  // dafunker's xml_result_equ.php returns one pool at a time: `cx_poule`
  // must be that pool's dafunker-space id, which only aligns with local
  // Group.id for groups from the original teams-import flow (#229) — other
  // groups' ids live in a different space (see selectPoolForGroup in
  // ffttGames.ts). Resolving it is therefore three-tier:
  //  0. Authoritative lookup: xml_equipe.php lists a club's teams together
  //     with their real (D1, cx_poule) — query it for the affiliation number
  //     of any of the group's own teams' clubs, no guessing involved.
  //  1. Direct guess: try `cx_poule=<Group.id>` (correct for #229-origin
  //     groups; dafunker validates cx_poule against the division, so a wrong
  //     guess just comes back empty, never another pool's data).
  //  2. apiv2 whole-division fallback, reconciled via selectPoolForGroup, for
  //     whatever tiers 0-1 still didn't resolve.
  const gamesPayloadRef = useRef<Record<string, Array<{ divisionId: string; pools: FfttPool[] }>>>({})

  const fetchGamesPreview = useCallback(async (groupIds: string[], teamId?: string): Promise<FfttGamesPreview | null> => {
    try {
      // Requested groups with an FFTT-aligned (numeric) division id;
      // non-numeric ones predate the FFTT imports and can't be queried.
      const requested = groupIds
        .map((gid) => groups.find((g) => g.id === gid))
        .filter((g): g is Group => !!g && /^\d+$/.test(g.divisionId))
      const divisionIds = [...new Set(requested.map((g) => g.divisionId))]

      const byDivision = new Map<string, FfttPool[]>()
      const addPools = (divisionId: string, pools: FfttPool[]) => {
        if (pools.length === 0) return
        byDivision.set(divisionId, [...(byDivision.get(divisionId) ?? []), ...pools])
      }
      const isResolved = (g: Group) => !!selectPoolForGroup(byDivision.get(g.divisionId) ?? [], g)

      // Tier 0: look up (D1, cx_poule) via an affiliation number from one of
      // the group's own teams' clubs.
      const affiliationNumbers = [...new Set(
        requested.flatMap((g) => teams
          .filter((t) => t.groupId === g.id)
          .map((t) => clubs.find((c) => c.id === t.clubId)?.affiliationNumber)
          .filter((n): n is string => !!n)),
      )]
      const clubTeamPools = (await Promise.all(affiliationNumbers.map(async (aff) => {
        const xml = await fetchTextFromBrowser(dafunkerClubTeamsUrl(aff))
        return xml === null ? [] : parseDafunkerClubTeamsXml(xml)
      }))).flat()
      const lookedUp = await Promise.all(requested.map(async (g) => {
        const match = clubTeamPools.find((p) => p.divisionId === g.divisionId && p.poolNumber === g.number)
        if (!match) return null
        const xml = await fetchTextFromBrowser(dafunkerResultsUrl(g.divisionId, match.cxPoule))
        return xml === null ? null : { divisionId: g.divisionId, pools: parseDafunkerResultsXml(xml) }
      }))
      for (const r of lookedUp) if (r) addPools(r.divisionId, r.pools)

      // Tier 1: direct per-group guess for whatever tier 0 didn't resolve.
      // cx_poule is an FFTT-space id, so this uses the group's own FFTT pool
      // id (#278) — before that field existed it used Group.id, which only
      // happened to hold a pool id for groups from the FFTT import.
      const direct = await Promise.all(requested.filter((g) => !isResolved(g) && g.groupId).map(async (g) => {
        const xml = await fetchTextFromBrowser(dafunkerResultsUrl(g.divisionId, g.groupId!))
        return xml === null ? null : { divisionId: g.divisionId, pools: parseDafunkerResultsXml(xml) }
      }))
      for (const r of direct) if (r) addPools(r.divisionId, r.pools)

      // Tier 2: apiv2 whole-division fallback for divisions still missing a
      // pool for at least one of their requested groups.
      const unresolvedDivisions = divisionIds.filter((divisionId) =>
        requested.some((g) => g.divisionId === divisionId && !isResolved(g)))
      const fallback = await Promise.all(unresolvedDivisions.map(async (divisionId) => {
        const data = await ffttGraphqlFromBrowser<FfttDivisionPoolsData>(divisionPoolsQuery(divisionId))
        return data === null ? null : { divisionId, pools: parseDivisionPools(data) }
      }))
      for (const r of fallback) if (r) addPools(r.divisionId, r.pools)

      const pools = divisionIds.map((divisionId) => ({ divisionId, pools: byDivision.get(divisionId) ?? [] }))
      // Every FFTT-aligned division came back empty → same as FFTT being down.
      if (divisionIds.length > 0 && pools.every((p) => p.pools.length === 0)) return null

      const r = await fetch('/api/fftt/games-preview', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ groupIds, pools, ...(teamId ? { teamId } : {}) }),
      })
      if (!r.ok) return null
      gamesPayloadRef.current[groupIds.join(',')] = pools
      return (await r.json()) as FfttGamesPreview
    } catch {
      return null
    }
  }, [groups, teams, clubs])

  const importFfttGames = useCallback(async (
    groupIds: string[], teamId?: string, options?: ImportGamesOptions,
  ): Promise<FfttGamesImportResult | null> => {
    try {
      const pools = gamesPayloadRef.current[groupIds.join(',')]
      if (!pools) return null
      const r = await fetch('/api/games/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          groupIds, pools, ...(teamId ? { teamId } : {}),
          ...(options?.updateDates ? { updateDates: true } : {}),
          ...(options?.removeObsolete ? { removeObsolete: true } : {}),
        }),
      })
      if (!r.ok) return null
      const result = (await r.json()) as FfttGamesImportResult
      if (result.createdClubs.length) setClubs((prev) => [...prev, ...result.createdClubs])
      if (result.createdTeams.length) setTeams((prev) => [...prev, ...result.createdTeams])
      if (result.groups.length) {
        setGroups((prev) => [
          ...prev.filter((g) => !result.groups.some((u) => u.id === g.id)),
          ...result.groups,
        ])
      }
      if (result.createdMatchDays.length || result.updatedMatchDays.length) {
        const upserts = [...result.createdMatchDays, ...result.updatedMatchDays]
        setMatchDays((prev) => [
          ...prev.filter((m) => !upserts.some((u) => u.id === m.id)),
          ...upserts,
        ])
      }
      if (result.createdGames.length || result.updatedGames.length) {
        const upserts = [...result.createdGames, ...result.updatedGames]
        setGames((prev) => [
          ...prev.filter((g) => !upserts.some((u) => u.id === g.id)),
          ...upserts,
        ])
      }
      applyImportDeletions(result.deletedGames, result.deletedMatchDays)
      return result
    } catch {
      return null
    }
  }, [applyImportDeletions])

  // --- FFTT groups import (#237, same browser-side transport as the games
  // import above: FFTT blocks Cloudflare egress, so the browser fetches the
  // division's pools from apiv2 and hands the parsed payload to our API.) ---
  const groupsPayloadRef = useRef<Record<string, FfttPool[]>>({})

  const fetchGroupsPreview = useCallback(async (divisionId: string): Promise<FfttGroupsPreview | null> => {
    try {
      // Only FFTT-aligned (numeric) division ids can be queried on apiv2; a
      // division that predates the FFTT imports simply has no pools to offer.
      let pools: FfttPool[] = []
      if (/^\d+$/.test(divisionId)) {
        const data = await ffttGraphqlFromBrowser<FfttDivisionPoolsData>(divisionPoolsQuery(divisionId))
        if (data === null) return null
        pools = parseDivisionPools(data)
      }
      const r = await fetch('/api/fftt/groups-preview', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ divisionId, pools }),
      })
      if (!r.ok) return null
      groupsPayloadRef.current[divisionId] = pools
      return (await r.json()) as FfttGroupsPreview
    } catch {
      return null
    }
  }, [])

  const importFfttGroups = useCallback(async (divisionId: string): Promise<FfttGroupsImportResult | null> => {
    try {
      const pools = groupsPayloadRef.current[divisionId]
      if (!pools) return null
      const r = await fetch('/api/groups/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ divisionId, pools }),
      })
      if (!r.ok) return null
      const result = (await r.json()) as FfttGroupsImportResult
      if (result.created.length) setGroups((prev) => [...prev, ...result.created])
      return result
    } catch {
      return null
    }
  }, [])

  // --- Schedule document import (#260, no server preview — see the type note above) ---
  const importScheduleDocuments = useCallback(async (
    schedules: ScheduleDocImportInput[], updateSlots?: boolean, removeObsolete?: boolean,
  ): Promise<ScheduleDocImportResult | null> => {
    try {
      const r = await fetch('/api/schedule-documents/import', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          schedules,
          ...(updateSlots ? { updateSlots: true } : {}),
          ...(removeObsolete ? { removeObsolete: true } : {}),
        }),
      })
      if (!r.ok) {
        console.error('schedule-documents/import failed', r.status, await r.text().catch(() => ''))
        return null
      }
      const result = (await r.json()) as ScheduleDocImportResult
      if (result.createdPhases.length) setPhases((prev) => [...prev, ...result.createdPhases])
      if (result.createdDivisions.length) setDivisions((prev) => [...prev, ...result.createdDivisions])
      if (result.createdClubs.length) setClubs((prev) => [...prev, ...result.createdClubs])
      if (result.createdTeams.length) setTeams((prev) => [...prev, ...result.createdTeams])
      if (result.groups.length) {
        setGroups((prev) => [
          ...prev.filter((g) => !result.groups.some((u) => u.id === g.id)),
          ...result.groups,
        ])
      }
      if (result.createdMatchDays.length || result.updatedMatchDays.length) {
        const upserts = [...result.createdMatchDays, ...result.updatedMatchDays]
        setMatchDays((prev) => [
          ...prev.filter((m) => !upserts.some((u) => u.id === m.id)),
          ...upserts,
        ])
      }
      if (result.createdGames.length) setGames((prev) => [...prev, ...result.createdGames])
      applyImportDeletions(result.deletedGames, result.deletedMatchDays)
      return result
    } catch {
      return null
    }
  }, [applyImportDeletions])

  const deleteSeason = useCallback((id: string) => {
    // Cascade: find phases → divisions → groups → teams, match days, games, avail, selections
    const phaseIds = phases.filter((p) => p.seasonId === id).map((p) => p.id)
    const divIds = divisions.filter((d) => phaseIds.includes(d.phaseId)).map((d) => d.id)
    const grpIds = groups.filter((g) => divIds.includes(g.divisionId)).map((g) => g.id)
    const teamIds = teams.filter((t) => phaseIds.includes(t.phaseId)).map((t) => t.id)
    const mdIds = matchDays.filter((md) => grpIds.includes(md.groupId)).map((md) => md.id)
    const gameIds = games.filter((g) => mdIds.includes(g.matchDayId)).map((g) => g.id)

    setGameAvailabilities((prev) => prev.filter((a) => !gameIds.includes(a.gameId)))
    setGameSelections((prev) => prev.filter((s) => !gameIds.includes(s.gameId)))
    setGames((prev) => prev.filter((g) => !gameIds.includes(g.id)))
    setMatchDays((prev) => prev.filter((md) => !mdIds.includes(md.id)))
    setTeams((prev) => prev.filter((t) => !teamIds.includes(t.id)))
    setGroups((prev) => prev.filter((g) => !grpIds.includes(g.id)))
    setDivisions((prev) => prev.filter((d) => !divIds.includes(d.id)))
    setPhases((prev) => prev.filter((p) => !phaseIds.includes(p.id)))
    setSeasons((prev) => prev.filter((s) => s.id !== id))
    if (persist) api(`/seasons/${id}`, { method: 'DELETE' })
  }, [persist, phases, divisions, groups, teams, matchDays, games])

  // --- Phases ---
  // Mirrors the API's single-active invariant (#221): activating a phase
  // demotes the previously active one — archived when older, back to
  // 'upcoming' when newer (rollback).
  const demoteActivePhases = (prev: Phase[], exceptId: string, newKey: number) =>
    prev.map((p) => {
      if (p.id === exceptId || p.status !== 'active') return p
      return { ...p, status: phaseOrderKey(p.seasonId, p.name) < newKey ? 'archived' as const : 'upcoming' as const }
    })

  // Cascade (#227): the active (season · phase) combination stays coherent —
  // activating a phase also activates its season and demotes the other one.
  const activatePhaseSeason = useCallback((seasonId: string) => {
    setSeasons((prev) => prev.map((s) => {
      if (s.id === seasonId) return s.status === 'active' ? s : { ...s, status: 'active' as const }
      return s.status === 'active' ? { ...s, status: demotedSeasonStatus(s.id, seasonId) } : s
    }))
  }, [])

  const updatePhase = useCallback((id: string, patch: Partial<Phase>) => {
    const target = phases.find((p) => p.id === id)
    if (patch.status === 'active' && target) {
      activatePhaseSeason(target.seasonId)
    }
    setPhases((prev) => {
      const next = patch.status === 'active' && target
        ? demoteActivePhases(prev, id, phaseOrderKey(target.seasonId, target.name))
        : prev
      return next.map((p) => (p.id === id ? { ...p, ...patch } : p))
    })
    if (persist) api(`/phases/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist, phases, activatePhaseSeason])

  const addPhase = useCallback((data: Omit<Phase, 'id'>) => {
    // Deterministic FFTT-aligned id when the name is a known FFTT phase
    // ("Phase 1" for season 27 → "phase-27-1"), random fallback otherwise.
    const ffttId = ffttPhaseIdForName(data.name)
    const id = ffttId ? localPhaseId(data.seasonId, ffttId) : nextId('phase')
    const phase: Phase = { ...data, id }
    if (phase.status === 'active') activatePhaseSeason(phase.seasonId)
    setPhases((prev) => [
      ...(phase.status === 'active'
        ? demoteActivePhases(prev, id, phaseOrderKey(phase.seasonId, phase.name))
        : prev),
      phase,
    ])
    if (persist) api('/phases', { method: 'POST', body: JSON.stringify(phase) })
    return phase
  }, [persist, activatePhaseSeason])

  const archivePhase = useCallback((id: string) => {
    setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'archived' } : p)))
    if (persist) api(`/phases/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) })
  }, [persist])

  const deletePhase = useCallback((id: string) => {
    // Cascade: divisions → groups → teams, match days → games → availabilities → selections
    const phaseDivIds = divisions.filter((d) => d.phaseId === id).map((d) => d.id)
    const phaseGroupIds = groups.filter((g) => phaseDivIds.includes(g.divisionId)).map((g) => g.id)
    const phaseMatchDayIds = matchDays.filter((md) => phaseGroupIds.includes(md.groupId)).map((md) => md.id)
    const phaseTeamIds = teams.filter((t) => t.phaseId === id).map((t) => t.id)
    const phaseGameIds = games.filter(
      (g) => phaseMatchDayIds.includes(g.matchDayId) || phaseTeamIds.includes(g.homeTeamId) || phaseTeamIds.includes(g.awayTeamId)
    ).map((g) => g.id)

    setGameSelections((prev) => prev.filter((s) => !phaseGameIds.includes(s.gameId)))
    setGameAvailabilities((prev) => prev.filter((a) => !phaseGameIds.includes(a.gameId)))
    setGames((prev) => prev.filter((g) => !phaseGameIds.includes(g.id)))
    setMatchDays((prev) => prev.filter((md) => !phaseMatchDayIds.includes(md.id)))
    setTeams((prev) => prev.filter((t) => !phaseTeamIds.includes(t.id)))
    setGroups((prev) => prev.filter((g) => !phaseGroupIds.includes(g.id)))
    setDivisions((prev) => prev.filter((d) => !phaseDivIds.includes(d.id)))
    setPhases((prev) => prev.filter((p) => p.id !== id))
    if (persist) api(`/phases/${id}`, { method: 'DELETE' })
  }, [persist, divisions, groups, matchDays, teams, games])

  // --- Divisions ---
  const updateDivision = useCallback((id: string, patch: Partial<Division>) => {
    setDivisions((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    if (persist) api(`/divisions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  const addDivision = useCallback((data: Omit<Division, 'id'>) => {
    const id = nextId('div')
    const division: Division = { ...data, id }
    setDivisions((prev) => [...prev, division])
    if (persist) api('/divisions', { method: 'POST', body: JSON.stringify(division) })
    return division
  }, [persist])

  // --- Competitions (#482) ---
  const addCompetition = useCallback((data: Omit<Competition, 'id'>) => {
    const id = nextId('comp')
    const competition: Competition = { ...data, id }
    setCompetitions((prev) => [...prev, competition])
    if (persist) api('/competitions', { method: 'POST', body: JSON.stringify(competition) })
    return competition
  }, [persist])

  const updateCompetition = useCallback((id: string, patch: Partial<Competition>) => {
    setCompetitions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    if (persist) api(`/competitions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  // Mirrors the API's cascade: the divisions survive, detached; the club
  // amendments do not, since they name a competition that is gone.
  const deleteCompetition = useCallback((id: string) => {
    setCompetitions((prev) => prev.filter((c) => c.id !== id))
    setDivisions((prev) => prev.map((d) => (d.competitionId === id ? { ...d, competitionId: undefined } : d)))
    setCompetitionEligibilities((prev) => prev.filter((e) => e.competitionId !== id))
    if (persist) api(`/competitions/${id}`, { method: 'DELETE' })
  }, [persist])

  /**
   * Not optimistic, unlike everything around it: the API refuses an addition to
   * a locked competition, and a screen that showed the player as added and then
   * silently disagreed with the next reload would be worse than a short wait.
   */
  const setCompetitionEligibility = useCallback(async (
    clubId: string,
    competitionId: string,
    playerId: string,
    effect: EligibilityEffect | 'default',
  ): Promise<boolean> => {
    const apply = () => setCompetitionEligibilities((prev) => {
      const others = prev.filter(
        (e) => !(e.competitionId === competitionId && e.playerId === playerId),
      )
      return effect === 'default' ? others : [...others, { clubId, competitionId, playerId, effect }]
    })
    if (!persist) { apply(); return true }
    const res = await fetch(
      `/api/clubs/${clubId}/competitions/${competitionId}/eligibility`,
      { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ playerId, effect }) },
    ).catch(() => null)
    if (!res?.ok) return false
    apply()
    return true
  }, [persist])

  const moveDivisionUp = useCallback((divisionId: string) => {
    setDivisions((prev) => {
      const div = prev.find((d) => d.id === divisionId)
      if (!div) return prev
      const inPhase = prev.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
      const idx = inPhase.findIndex((d) => d.id === divisionId)
      if (idx <= 0) return prev
      const other = inPhase[idx - 1]
      if (persist) {
        api(`/divisions/${divisionId}/move`, {
          method: 'POST',
          body: JSON.stringify({ otherId: other.id, myNewRank: other.rank, otherNewRank: div.rank }),
        })
      }
      return prev.map((d) =>
        d.id === div.id ? { ...d, rank: other.rank } : d.id === other.id ? { ...d, rank: div.rank } : d
      )
    })
  }, [persist])

  const moveDivisionDown = useCallback((divisionId: string) => {
    setDivisions((prev) => {
      const div = prev.find((d) => d.id === divisionId)
      if (!div) return prev
      const inPhase = prev.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
      const idx = inPhase.findIndex((d) => d.id === divisionId)
      if (idx < 0 || idx >= inPhase.length - 1) return prev
      const other = inPhase[idx + 1]
      if (persist) {
        api(`/divisions/${divisionId}/move`, {
          method: 'POST',
          body: JSON.stringify({ otherId: other.id, myNewRank: other.rank, otherNewRank: div.rank }),
        })
      }
      return prev.map((d) =>
        d.id === div.id ? { ...d, rank: other.rank } : d.id === other.id ? { ...d, rank: div.rank } : d
      )
    })
  }, [persist])

  const archiveDivision = useCallback((id: string) => {
    setDivisions((prev) => prev.map((d) => (d.id === id ? { ...d, isArchived: true } : d)))
    if (persist) api(`/divisions/${id}`, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) })
  }, [persist])

  const deleteDivision = useCallback((id: string) => {
    // Cascade: groups → teams → match days → games → availabilities → selections
    const divGroupIds = groups.filter((g) => g.divisionId === id).map((g) => g.id)
    const divTeamIds = teams.filter((t) => divGroupIds.includes(t.groupId)).map((t) => t.id)
    const divMatchDayIds = matchDays.filter((md) => divGroupIds.includes(md.groupId)).map((md) => md.id)
    const divGameIds = games.filter((g) => divMatchDayIds.includes(g.matchDayId)).map((g) => g.id)

    setGameSelections((prev) => prev.filter((s) => !divGameIds.includes(s.gameId)))
    setGameAvailabilities((prev) => prev.filter((a) => !divGameIds.includes(a.gameId)))
    setGames((prev) => prev.filter((g) => !divGameIds.includes(g.id)))
    setMatchDays((prev) => prev.filter((md) => !divMatchDayIds.includes(md.id)))
    setTeams((prev) => prev.filter((t) => !divTeamIds.includes(t.id)))
    setGroups((prev) => prev.filter((g) => !divGroupIds.includes(g.id)))
    setDivisions((prev) => prev.filter((d) => d.id !== id))

    if (persist) api(`/divisions/${id}`, { method: 'DELETE' })
  }, [persist, groups, teams, matchDays, games])

  // --- Clubs ---
  const updateClub = useCallback((id: string, patch: Partial<Club>) => {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    if (persist) api(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  // Clubs are keyed on their FFTT affiliation number (#275) — same id space as
  // the clubs the games/schedule imports auto-create — so the FFTT club import
  // and manual creation stop producing ids that a later migration has to clean
  // up. Falls back to a generated id when there is no usable number, or when
  // the FFTT-aligned one is already taken (the caller is expected to have
  // offered the existing club instead; a duplicate id would just fail to save).
  const addClub = useCallback((data: Omit<Club, 'id'>) => {
    const preferred = clubIdFromAffiliation(data.affiliationNumber)
    const id = preferred && !clubs.some((c) => c.id === preferred) ? preferred : nextId('club')
    const club: Club = { ...data, id }
    setClubs((prev) => [...prev, club])
    if (persist) api('/clubs', { method: 'POST', body: JSON.stringify(club) })
    return club
  }, [persist, clubs])

  const archiveClub = useCallback((id: string) => {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, isArchived: true } : c)))
    if (persist) api(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) })
  }, [persist])

  // No cascade: the UI only offers this once it's confirmed the club has no
  // teams/players left (a club with dependents can be archived, not deleted).
  const deleteClub = useCallback((id: string) => {
    setClubs((prev) => prev.filter((c) => c.id !== id))
    if (persist) api(`/clubs/${id}`, { method: 'DELETE' })
  }, [persist])

  const addClubAddress = useCallback((clubId: string, data: Omit<Address, 'id'>) => {
    const id = nextId('addr')
    const address: Address = { ...data, id }
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        const addresses = c.addresses ?? []
        const newAddresses = data.isDefault
          ? [...addresses.map((a) => ({ ...a, isDefault: false })), address]
          : addresses.length === 0
            ? [{ ...address, isDefault: true }]
            : [...addresses, address]
        return { ...c, addresses: newAddresses }
      })
    )
    if (persist) api(`/clubs/${clubId}/addresses`, { method: 'POST', body: JSON.stringify(address) })
    return address
  }, [persist])

  const updateClubAddress = useCallback(
    (clubId: string, addressId: string, patch: Partial<Address>) => {
      setClubs((prev) =>
        prev.map((c) => {
          if (c.id !== clubId) return c
          const addresses = (c.addresses ?? []).map((a) =>
            a.id === addressId ? { ...a, ...patch } : patch.isDefault === true ? { ...a, isDefault: false } : a
          )
          return { ...c, addresses }
        })
      )
      if (persist) api(`/clubs/${clubId}/addresses/${addressId}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },
    [persist]
  )

  const deleteClubAddress = useCallback((clubId: string, addressId: string) => {
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        let addresses = (c.addresses ?? []).filter((a) => a.id !== addressId)
        const deletedWasDefault = (c.addresses ?? []).find((a) => a.id === addressId)?.isDefault
        if (deletedWasDefault && addresses.length > 0 && !addresses.some((a) => a.isDefault)) {
          addresses = [{ ...addresses[0], isDefault: true }, ...addresses.slice(1)]
        }
        return { ...c, addresses }
      })
    )
    if (persist) api(`/clubs/${clubId}/addresses/${addressId}`, { method: 'DELETE' })
  }, [persist])

  // --- Club logo (#135) ---
  const setClubLogo = useCallback((clubId: string, base64: string, contentType: string) => {
    const updatedAt = new Date().toISOString()
    setClubs((prev) => prev.map((c) => (c.id === clubId ? { ...c, logoUpdatedAt: updatedAt } : c)))
    if (persist) api(`/clubs/${clubId}/logo`, { method: 'PUT', body: JSON.stringify({ data: base64, contentType }) })
  }, [persist])

  const removeClubLogo = useCallback((clubId: string) => {
    setClubs((prev) => prev.map((c) => (c.id === clubId ? { ...c, logoUpdatedAt: undefined } : c)))
    if (persist) api(`/clubs/${clubId}/logo`, { method: 'DELETE' })
  }, [persist])

  // --- Club communication channels (#135) ---
  const addClubChannel = useCallback((clubId: string, data: Omit<ClubChannel, 'id' | 'sortOrder'>) => {
    const id = nextId('chan')
    let sortOrder = 0
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        const channels = c.channels ?? []
        sortOrder = channels.length
        return { ...c, channels: [...channels, { ...data, id, sortOrder }] }
      })
    )
    const channel: ClubChannel = { ...data, id, sortOrder }
    if (persist) api(`/clubs/${clubId}/channels`, { method: 'POST', body: JSON.stringify(channel) })
    return channel
  }, [persist])

  const updateClubChannel = useCallback(
    (clubId: string, channelId: string, patch: Partial<Omit<ClubChannel, 'id'>>) => {
      setClubs((prev) =>
        prev.map((c) => {
          if (c.id !== clubId) return c
          const channels = (c.channels ?? []).map((ch) => (ch.id === channelId ? { ...ch, ...patch } : ch))
          return { ...c, channels }
        })
      )
      if (persist) api(`/clubs/${clubId}/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(patch) })
    },
    [persist]
  )

  const deleteClubChannel = useCallback((clubId: string, channelId: string) => {
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        return { ...c, channels: (c.channels ?? []).filter((ch) => ch.id !== channelId) }
      })
    )
    if (persist) api(`/clubs/${clubId}/channels/${channelId}`, { method: 'DELETE' })
  }, [persist])

  const reorderClubChannels = useCallback((clubId: string, orderedIds: string[]) => {
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        const byId = new Map((c.channels ?? []).map((ch) => [ch.id, ch]))
        const channels = orderedIds
          .map((id, i) => { const ch = byId.get(id); return ch ? { ...ch, sortOrder: i } : null })
          .filter(Boolean) as ClubChannel[]
        return { ...c, channels }
      })
    )
    if (persist) api(`/clubs/${clubId}/channels/reorder`, { method: 'PUT', body: JSON.stringify({ ids: orderedIds }) })
  }, [persist])

  // --- Groups ---
  const updateGroup = useCallback((id: string, patch: Partial<Group>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    if (persist) api(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  const addGroup = useCallback((data: Omit<Group, 'id'>) => {
    const id = nextId('group')
    const group: Group = { ...data, id }
    setGroups((prev) => [...prev, group])
    if (persist) api('/groups', { method: 'POST', body: JSON.stringify(group) })
    return group
  }, [persist])

  const archiveGroup = useCallback((id: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, isArchived: true } : g)))
    if (persist) api(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) })
  }, [persist])

  const deleteGroup = useCallback((id: string) => {
    // Cascade: remove teams in this group and their games/availabilities/selections
    const groupTeamIds = teams.filter((t) => t.groupId === id).map((t) => t.id)
    const groupMatchDayIds = matchDays.filter((md) => md.groupId === id).map((md) => md.id)
    const affectedGameIds = games
      .filter(
        (g) =>
          groupMatchDayIds.includes(g.matchDayId) ||
          groupTeamIds.includes(g.homeTeamId) ||
          groupTeamIds.includes(g.awayTeamId)
      )
      .map((g) => g.id)
    if (affectedGameIds.length > 0) {
      setGames((prev) => prev.filter((g) => !affectedGameIds.includes(g.id)))
      setGameAvailabilities((prev) => prev.filter((a) => !affectedGameIds.includes(a.gameId)))
      setGameSelections((prev) => prev.filter((s) => !affectedGameIds.includes(s.gameId)))
    }
    if (groupMatchDayIds.length > 0) {
      setMatchDays((prev) => prev.filter((md) => !groupMatchDayIds.includes(md.id)))
    }
    if (groupTeamIds.length > 0) {
      setTeams((prev) => prev.filter((t) => !groupTeamIds.includes(t.id)))
    }
    setGroups((prev) => prev.filter((g) => g.id !== id))
    if (persist) api(`/groups/${id}`, { method: 'DELETE' })
  }, [persist, teams, matchDays, games])

  // Same match-day/game/availability/selection cascade as deleteGroup above,
  // minus the group and team removal (#270) — for starting a group's
  // calendar over, e.g. after a bad FFTT/file import.
  const resetGroupGames = useCallback((id: string) => {
    const groupMatchDayIds = matchDays.filter((md) => md.groupId === id).map((md) => md.id)
    const affectedGameIds = games.filter((g) => groupMatchDayIds.includes(g.matchDayId)).map((g) => g.id)
    if (affectedGameIds.length > 0) {
      setGames((prev) => prev.filter((g) => !affectedGameIds.includes(g.id)))
      setGameAvailabilities((prev) => prev.filter((a) => !affectedGameIds.includes(a.gameId)))
      setGameSelections((prev) => prev.filter((s) => !affectedGameIds.includes(s.gameId)))
    }
    if (groupMatchDayIds.length > 0) {
      setMatchDays((prev) => prev.filter((md) => !groupMatchDayIds.includes(md.id)))
    }
    if (persist) api(`/groups/${id}/games`, { method: 'DELETE' })
  }, [persist, matchDays, games])

  // --- Teams ---
  const updateTeam = useCallback((id: string, patch: Partial<Team>) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === id)
      if (!team) return prev
      const nextPlayerIds = patch.playerIds ?? team.playerIds ?? []
      const phaseId = patch.phaseId ?? team.phaseId
      const otherTeamsInPhase = prev.filter(
        (t) => t.phaseId === phaseId && t.id !== id
      )
      // A player belongs to one team per phase: joining this one removes them
      // from the others. Their points are untouched — since #384 those hang off
      // (phase, player) and do not move with the roster.
      const batchUpdates: Array<{ id: string; playerIds: string[] }> = []
      for (const other of otherTeamsInPhase) {
        const otherIds = other.playerIds ?? []
        if (otherIds.some((pid) => nextPlayerIds.includes(pid))) {
          batchUpdates.push({
            id: other.id,
            playerIds: otherIds.filter((pid) => !nextPlayerIds.includes(pid)),
          })
        }
      }
      if (persist) {
        api(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
        if (batchUpdates.length) {
          api('/teams/batch', { method: 'POST', body: JSON.stringify({ updates: batchUpdates }) })
        }
      }
      return prev.map((t) => {
        if (t.id === id) return { ...t, ...patch }
        const u = batchUpdates.find((upd) => upd.id === t.id)
        if (u) return { ...t, playerIds: u.playerIds }
        return t
      })
    })
  }, [persist])

  /**
   * Move a team to another poule (#422) — what a repêchage does. The team keeps
   * its roster, its captain and its history; what it loses is the calendar of
   * the poule it leaves, which the API removes (with the availabilities and
   * compositions hanging off it) and reports back, so local state follows the
   * deletion instead of guessing at it.
   */
  const moveTeamToGroup = useCallback(async (teamId: string, groupId: string) => {
    const target = groups.find((g) => g.id === groupId)
    setTeams((prev) => prev.map((t) =>
      t.id === teamId ? { ...t, groupId, divisionId: target?.divisionId ?? t.divisionId } : t))
    setGroups((prev) => prev.map((g) => {
      if (g.id === groupId) {
        return g.teamIds.includes(teamId) ? g : { ...g, teamIds: [...g.teamIds, teamId] }
      }
      return g.teamIds.includes(teamId) ? { ...g, teamIds: g.teamIds.filter((id) => id !== teamId) } : g
    }))
    if (!persist) return
    const r = await api(`/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify({ groupId }) })
    if (!r?.ok) return
    const moved = await r.json().catch(() => null) as
      { deletedGames?: string[]; deletedMatchDays?: string[] } | null
    applyImportDeletions(moved?.deletedGames, moved?.deletedMatchDays)
  }, [persist, groups, applyImportDeletions])

  const addTeam = useCallback((data: Omit<Team, 'id'>) => {
    // Derived from (club, phase, number) (#282) so a team created here and the
    // same team imported later land on one row instead of two.
    const id = teamIdFor(data.clubId, data.phaseId, data.number)
    const team: Team = { ...data, id }
    setTeams((prev) => {
      const phaseId = team.phaseId
      const newPlayerIds = team.playerIds ?? []
      const otherTeamsInPhase = prev.filter((t) => t.phaseId === phaseId)
      const batchUpdates: Array<{ id: string; playerIds: string[] }> = []
      const updated = prev.map((t) => {
        if (!otherTeamsInPhase.includes(t)) return t
        const otherIds = t.playerIds ?? []
        if (!otherIds.some((pid) => newPlayerIds.includes(pid))) return t
        const nextIds = otherIds.filter((pid) => !newPlayerIds.includes(pid))
        batchUpdates.push({ id: t.id, playerIds: nextIds })
        return { ...t, playerIds: nextIds }
      })
      if (persist) {
        api('/teams', { method: 'POST', body: JSON.stringify(team) })
        if (batchUpdates.length) {
          api('/teams/batch', { method: 'POST', body: JSON.stringify({ updates: batchUpdates }) })
        }
      }
      return [...updated, team]
    })
    return team
  }, [persist])

  const archiveTeam = useCallback((id: string) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, isArchived: true } : t)))
    if (persist) api(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) })
  }, [persist])

  const deleteTeam = useCallback((id: string) => {
    const team = teams.find((t) => t.id === id)
    // Remove team from group teamIds
    if (team) {
      const group = groups.find((g) => g.id === team.groupId)
      if (group) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === group.id ? { ...g, teamIds: g.teamIds.filter((tid) => tid !== id) } : g
          )
        )
      }
    }
    // Remove games involving this team + their availabilities/selections
    const teamGameIds = games.filter((g) => g.homeTeamId === id || g.awayTeamId === id).map((g) => g.id)
    if (teamGameIds.length > 0) {
      setGames((prev) => prev.filter((g) => !teamGameIds.includes(g.id)))
      setGameAvailabilities((prev) => prev.filter((a) => !teamGameIds.includes(a.gameId)))
      setGameSelections((prev) => prev.filter((s) => !teamGameIds.includes(s.gameId)))
    }
    setTeams((prev) => prev.filter((t) => t.id !== id))
    if (persist) api(`/teams/${id}`, { method: 'DELETE' })
  }, [persist, teams, groups, games])

  // --- Players ---
  const updatePlayer = useCallback((id: string, patch: Partial<Player>) => {
    const local = withoutEmptyEmail(patch)
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...local } : p)))
    // The request keeps the empty key: PATCH only touches the columns it sees.
    if (persist) api(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  const addPlayer = useCallback((data: Omit<Player, 'id'>) => {
    const id = nextId('player')
    const player: Player = { ...withoutEmptyEmail(data), id }
    setPlayers((prev) => [...prev, player])
    if (persist) api('/players', { method: 'POST', body: JSON.stringify(player) })
    return player
  }, [persist])

  // --- Club admins (#474) ---
  // Unlike every other mutation here, these wait for the API and report back:
  // the cap of 5 and the never-zero rule are enforced server-side, so an
  // optimistic update would show an appointment the club never got. The
  // refusal arrives already worded in French — the same sentence the screens
  // would have built, so there is one place it can be wrong.
  const clubAdminRequest = useCallback(
    async (path: string, options: RequestInit): Promise<ClubAdminResult> => {
      if (!persist) return { ok: true }
      try {
        const res = await fetch(`/api${path}`, { headers: authHeaders(), ...options })
        if (res.ok) return { ok: true }
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        return { ok: false, message: body?.message ?? "L'opération a échoué." }
      } catch {
        return { ok: false, message: 'Connexion indisponible. Réessayez plus tard.' }
      }
    },
    [persist],
  )

  const addClubAdmin = useCallback(
    async (clubId: string, target: ClubAdminTarget): Promise<ClubAdminResult> => {
      const result = await clubAdminRequest(`/clubs/${encodeURIComponent(clubId)}/admins`, {
        method: 'POST',
        body: JSON.stringify(target),
      })
      if (!result.ok) return result
      setUsers((prev) => {
        if ('userId' in target) {
          return prev.map((u) =>
            u.id === target.userId ? { ...u, role: 'club_admin', clubId } : u,
          )
        }
        // The invited member is not a player, so they belong here and nowhere
        // else — no roster, no availabilities, nothing to add to `players`.
        return [
          ...prev,
          {
            id: nextId('user'), role: 'club_admin', isPlayer: false, clubId,
            firstName: target.firstName, lastName: target.lastName,
            email: target.email, phone: target.phone ?? '', status: 'active',
          },
        ]
      })
      return result
    },
    [clubAdminRequest],
  )

  const removeClubAdmin = useCallback(
    async (clubId: string, adminId: string): Promise<ClubAdminResult> => {
      const result = await clubAdminRequest(
        `/clubs/${encodeURIComponent(clubId)}/admins/${encodeURIComponent(adminId)}`,
        { method: 'DELETE' },
      )
      if (!result.ok) return result
      // Only the role goes: they stay a member of the club, and a player if
      // that is what they were.
      setUsers((prev) => prev.map((u) => (u.id === adminId ? { ...u, role: 'player' } : u)))
      return result
    },
    [clubAdminRequest],
  )

  // --- Player phase points (#384) ---
  // Written in one call because the FFTT import is their only writer, and it
  // lands a whole club at once. Upsert semantics on (phaseId, playerId), same
  // as the API's ON CONFLICT.
  const setPlayerPhasePoints = useCallback((updates: PlayerPhasePoints[]) => {
    if (!updates.length) return
    setPlayerPhasePointsState((prev) => {
      const next = prev.filter(
        (p) => !updates.some((u) => u.phaseId === p.phaseId && u.playerId === p.playerId),
      )
      return [...next, ...updates]
    })
    if (persist) {
      api('/player-phase-points/batch', { method: 'POST', body: JSON.stringify({ updates }) })
    }
  }, [persist])

  // Avatars are stored base64 in D1 behind PUT/DELETE /users/:id/avatar; the
  // players list only carries avatarUpdatedAt for cache-busting, so we bump it
  // optimistically and the Avatar component refetches.
  const setAvatar = useCallback(async (id: string, base64: string, contentType: string) => {
    const now = new Date().toISOString()
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, avatarUpdatedAt: now } : p)))
    if (!persist) return
    const res = await fetch(`/api/users/${id}/avatar`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ data: base64, contentType }),
    })
    if (res.ok) {
      const { avatarUpdatedAt } = (await res.json()) as { avatarUpdatedAt?: string }
      if (avatarUpdatedAt) {
        setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, avatarUpdatedAt } : p)))
      }
    }
  }, [persist])

  const removeAvatar = useCallback(async (id: string) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, avatarUpdatedAt: undefined } : p)))
    if (persist) await fetch(`/api/users/${id}/avatar`, { method: 'DELETE', headers: authHeaders() })
  }, [persist])

  // --- Match Days ---
  const updateMatchDay = useCallback((id: string, patch: Partial<MatchDay>) => {
    setMatchDays((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    if (persist) api(`/match-days/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  const addMatchDay = useCallback((data: Omit<MatchDay, 'id'>) => {
    const id = nextId('md')
    const matchDay: MatchDay = { ...data, id }
    setMatchDays((prev) => [...prev, matchDay])
    if (persist) api('/match-days', { method: 'POST', body: JSON.stringify(matchDay) })
    return matchDay
  }, [persist])

  // --- Games ---
  // A game's own date (#271) also shifts its match day's derived date (the
  // MIN of its games' dates). The API recomputes this server-side, but
  // these two actions are fire-and-forget (not awaited), so the optimistic
  // local matchDays state needs its own mirror of that derivation —
  // otherwise the grid/header would show a stale date until the next
  // refetch. See deriveMatchDayDate in lib/matchdays.ts.
  const syncMatchDayDate = (matchDayId: string, gamesForMatchDay: Game[]) => {
    setMatchDays((prev) => prev.map((md) =>
      md.id === matchDayId ? { ...md, date: deriveMatchDayDate(gamesForMatchDay, md.date) } : md))
  }

  const updateGame = useCallback((id: string, patch: Partial<Game>) => {
    setGames((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
      if ('date' in patch) {
        const game = next.find((g) => g.id === id)
        if (game) syncMatchDayDate(game.matchDayId, next.filter((g) => g.matchDayId === game.matchDayId))
      }
      return next
    })
    if (persist) api(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }, [persist])

  const addGame = useCallback((data: Omit<Game, 'id'>) => {
    const id = gameIdFor(data.matchDayId, data.homeTeamId, data.awayTeamId)
    const game: Game = { ...data, id }
    setGames((prev) => {
      const next = [...prev, game]
      if (game.date) syncMatchDayDate(game.matchDayId, next.filter((g) => g.matchDayId === game.matchDayId))
      return next
    })
    if (persist) api('/games', { method: 'POST', body: JSON.stringify(game) })
    return game
  }, [persist])

  // --- Game Availabilities ---
  const setGameAvailability = useCallback(
    (
      gameId: string,
      playerId: string,
      status: AvailabilityStatus,
      overriddenBy?: AvailabilityOverriddenBy
    ) => {
      setGameAvailabilities((prev) => {
        const existing = prev.find(
          (a) => a.gameId === gameId && a.playerId === playerId
        )
        if (existing) {
          if (persist) {
            api('/game-availabilities/set', {
              method: 'POST',
              body: JSON.stringify({ gameId, playerId, status, overriddenBy }),
            })
          }
          return prev.map((a) =>
            a.gameId === gameId && a.playerId === playerId ? { ...a, status, overriddenBy } : a
          )
        }
        if (persist) {
          api('/game-availabilities/set', {
            method: 'POST',
            body: JSON.stringify({ gameId, playerId, status, overriddenBy }),
          })
        }
        return [...prev, { gameId, playerId, status, overriddenBy }]
      })
    },
    [persist]
  )

  const clearGameAvailability = useCallback((gameId: string, playerId: string) => {
    setGameAvailabilities((prev) =>
      prev.filter((a) => !(a.gameId === gameId && a.playerId === playerId))
    )
    if (persist) api('/game-availabilities/clear', { method: 'POST', body: JSON.stringify({ gameId, playerId }) })
  }, [persist])

  // --- Game Selections ---
  const getGameSelectionPlayerIds = useCallback((gameId: string, teamId: string) => {
    return (
      gameSelections.find((s) => s.gameId === gameId && s.teamId === teamId)?.playerIds ?? []
    )
  }, [gameSelections])

  const setGameSelection = useCallback((gameId: string, teamId: string, playerIds: string[]) => {
    setGameSelections((prev) => {
      const rest = prev.filter((s) => !(s.gameId === gameId && s.teamId === teamId))
      if (playerIds.length === 0) {
        if (persist) api('/game-selections/set', { method: 'POST', body: JSON.stringify({ gameId, teamId, playerIds: [] }) })
        return rest
      }
      const existing = prev.find((s) => s.gameId === gameId && s.teamId === teamId)
      if (persist) api('/game-selections/set', { method: 'POST', body: JSON.stringify({ gameId, teamId, playerIds }) })
      return [
        ...rest,
        existing ? { ...existing, playerIds } : { gameId, teamId, playerIds },
      ]
    })
  }, [persist])

  const setGameSelectionBatch = useCallback(
    (updates: Array<{ gameId: string; teamId: string; playerIds: string[] }>) => {
      setGameSelections((prev) => {
        let next = prev
        const apiUpdates: Array<{ gameId: string; teamId: string; playerIds: string[] }> = []
        for (const { gameId, teamId, playerIds } of updates) {
          next = next.filter((s) => !(s.gameId === gameId && s.teamId === teamId))
          if (playerIds.length > 0) {
            const existing = prev.find((s) => s.gameId === gameId && s.teamId === teamId)
            next = [
              ...next,
              existing ? { ...existing, playerIds } : { gameId, teamId, playerIds },
            ]
            apiUpdates.push({ gameId, teamId, playerIds })
          } else {
            apiUpdates.push({ gameId, teamId, playerIds: [] })
          }
        }
        if (persist) api('/game-selections/batch', { method: 'POST', body: JSON.stringify({ updates: apiUpdates }) })
        return next
      })
    },
    [persist]
  )

  const value = useMemo<DataContextValue>(
    () => ({
      staleSince,
      divisions,
      competitions,
      competitionEligibilities,
      clubs,
      seasons,
      phases,
      groups,
      teams,
      players,
      playerPhasePoints,
      matchDays,
      games,
      updateDivision,
      archiveDivision,
      deleteDivision,
      addCompetition,
      updateCompetition,
      deleteCompetition,
      setCompetitionEligibility,
      updateClub,
      archiveClub,
      deleteClub,
      addClubAddress,
      updateClubAddress,
      deleteClubAddress,
      setClubLogo,
      removeClubLogo,
      addClubChannel,
      updateClubChannel,
      deleteClubChannel,
      reorderClubChannels,
      updateSeason,
      archiveSeason,
      deleteSeason,
      checkFfttSeason,
      importFfttSeason,
      fetchOrganizations,
      fetchCompetitionsPreview,
      importFfttCompetitions,
      fetchDivisionsPreview,
      importFfttDivisions,
      fetchTeamsPreview,
      importFfttTeams,
      fetchGamesPreview,
      importFfttGames,
      fetchGroupsPreview,
      importFfttGroups,
      importScheduleDocuments,
      updatePhase,
      archivePhase,
      deletePhase,
      updateGroup,
      archiveGroup,
      deleteGroup,
      resetGroupGames,
      updateTeam,
      moveTeamToGroup,
      archiveTeam,
      deleteTeam,
      addClub,
      addSeason,
      addPhase,
      addDivision,
      addGroup,
      addTeam,
      moveDivisionUp,
      moveDivisionDown,
      users,
      updatePlayer,
      addPlayer,
      addClubAdmin,
      removeClubAdmin,
      setPlayerPhasePoints,
      setAvatar,
      removeAvatar,
      updateMatchDay,
      addMatchDay,
      updateGame,
      addGame,
      gameAvailabilities,
      setGameAvailability,
      clearGameAvailability,
      gameSelections,
      getGameSelectionPlayerIds,
      setGameSelection,
      setGameSelectionBatch,
    }),
    [
      staleSince,
      divisions, competitions, competitionEligibilities,
      clubs, seasons, phases, groups, teams, players, playerPhasePoints,
      matchDays, games,
      updateDivision, archiveDivision, deleteDivision,
      addCompetition, updateCompetition, deleteCompetition, setCompetitionEligibility,
      updateClub, archiveClub, deleteClub, addClubAddress, updateClubAddress, deleteClubAddress,
      setClubLogo, removeClubLogo, addClubChannel, updateClubChannel, deleteClubChannel, reorderClubChannels,
      updateSeason, archiveSeason, deleteSeason, checkFfttSeason, importFfttSeason,
      fetchOrganizations, fetchCompetitionsPreview, importFfttCompetitions, fetchDivisionsPreview, importFfttDivisions, fetchTeamsPreview, importFfttTeams, fetchGamesPreview, importFfttGames, fetchGroupsPreview, importFfttGroups, importScheduleDocuments, updatePhase, archivePhase, deletePhase, updateGroup, archiveGroup, deleteGroup, resetGroupGames, updateTeam, moveTeamToGroup, archiveTeam, deleteTeam,
      addClub, addSeason, addPhase, addDivision, addGroup, addTeam,
      moveDivisionUp, moveDivisionDown,
      users, updatePlayer, addPlayer, addClubAdmin, removeClubAdmin,
      setPlayerPhasePoints, setAvatar, removeAvatar,
      updateMatchDay, addMatchDay, updateGame, addGame,
      gameAvailabilities, setGameAvailability, clearGameAvailability,
      gameSelections, getGameSelectionPlayerIds, setGameSelection, setGameSelectionBatch,
    ]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen px-6 text-center">
        <p className="text-gray-600">{error}</p>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium"
        >
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within DataProvider')
  return ctx
}
