import type { PlayerCategory } from '../lib/playerCategories'

// Captaincy is per-team (see Team.captainId), so it is NOT a role — it's derived.
export type Role = 'general_admin' | 'club_admin' | 'player'

export type PlayerStatus = 'active' | 'archived'

export interface Address {
  id: string
  label: string
  street: string
  postalCode: string
  city: string
  isDefault: boolean
}

export type ClubChannelType = 'website' | 'whatsapp' | 'facebook' | 'other'

export interface ClubChannel {
  id: string
  type: ClubChannelType
  link: string
  /** Optional label; when blank, the channel's type label is shown instead. */
  displayName?: string
  /** Admin-defined ordering within the club's channel list. */
  sortOrder: number
}

export interface Club {
  id: string
  affiliationNumber: string
  displayName: string
  isArchived: boolean
  addresses: Address[]
  channels: ClubChannel[]
  /** ISO timestamp of the last logo change; used to cache-bust the logo URL. Absent when no logo. */
  logoUpdatedAt?: string
}

/**
 * FFTT organization (federation, zone, league or committee), cached locally
 * for the divisions import (#219). `id` is the FFTT numeric id as text.
 */
export interface Organization {
  id: string
  /** FFTT @type: 'Federation' | 'Zone' | 'League' | 'Committee'. */
  type: string
  /** FFTT short code, e.g. "L06" (league) or "D68" (committee). */
  identifier: string
  name: string
}

/** Shared 3-state lifecycle used by seasons and phases (#227). */
export type LifecycleStatus = 'active' | 'upcoming' | 'archived'
export type SeasonStatus = LifecycleStatus

export interface Season {
  /** FFTT-aligned numeric id as text: endYear − 2000 (e.g. "26" for 2025/2026). */
  id: string
  displayName: string
  /** At most one season is 'active' at a time. */
  status: SeasonStatus
}

export interface Phase {
  /** "phase-{seasonId}-{ffttPhaseId}", e.g. "phase-27-1" (2026/2027 Phase 1). */
  id: string
  seasonId: string
  name: string
  displayName: string
  /** At most one phase is 'active' at a time, across seasons. */
  status: LifecycleStatus
}

export interface Division {
  id: string
  phaseId: string
  displayName: string
  rank: number
  playersPerGame: number
  isArchived: boolean
  /** FFTT identifier, e.g. "GE3P1" (#275); absent for divisions created by hand. */
  identifier?: string
  /** FFTT id of the division directly above this one (#236); absent for a top-level division. */
  parentId?: string
  /**
   * The competition this division belongs to (#482); absent for a division
   * that belongs to none — which restricts nobody, and is what every division
   * is until a general admin says otherwise.
   */
  competitionId?: string
}

/**
 * A competition — a championship a division belongs to (#482).
 *
 * The rattachement runs division → competition rather than team → competition
 * on purpose: a team already declares a division, a division already declares
 * its level, and a championship is what a set of divisions IS. Asking a club
 * to restate it per team would be a third place for the same fact to be wrong.
 */
export interface Competition {
  id: string
  displayName: string
  /**
   * The categories admitted by default. **Empty means every category** — the
   * senior championship does not enumerate seventeen codes to say "anyone".
   */
  categories: PlayerCategory[]
  /**
   * When true a club may only ever exclude, never add: the competition is
   * reserved to its categories, and no club decides otherwise. This is what
   * keeps a veteran out of a youth championship.
   */
  isCategoryLocked: boolean
  sortOrder: number
  isArchived: boolean
}

/** A club's amendment to a competition's default mapping (#482). */
export type EligibilityEffect = 'included' | 'excluded'

/**
 * One licensee a club has added to, or removed from, one competition.
 *
 * Keyed on (clubId, competitionId, playerId) — the table's primary key. The
 * club is carried rather than derived from the player because it is the scope
 * the API authorizes against: a club admin writes rows bearing their own club
 * and no others.
 */
export interface CompetitionEligibility {
  clubId: string
  competitionId: string
  playerId: string
  effect: EligibilityEffect
}

export interface Group {
  /** Opaque generated local id; never carries meaning (#278). */
  id: string
  divisionId: string
  number: number
  teamIds: string[]
  isArchived: boolean
  /**
   * FFTT pool id, when this group came from FFTT (#278). Absent for groups
   * created by hand or read off a PDF calendar. Note the name collision:
   * Team.groupId and MatchDay.groupId point AT Group.id — this one is the
   * FFTT identity of the group itself.
   */
  groupId?: string
}

/**
 * Player = the "person" projection of a User where isPlayer is true. These
 * fields are guaranteed populated for players, so player-facing UI can rely on
 * them. Derived from `users` by the data contexts.
 */
/**
 * A member seen through the sporting lens.
 *
 * Since migration 0007 there is one `users` table and no `players` table, so
 * this is the same row as `User` (declared further down) and the shared fields
 * are derived rather than restated — they cannot drift apart (#318). Making
 * `email` optional in #315 had to be done twice, which is what prompted this.
 *
 * The difference from `User` is strictness, not shape: a player always has a
 * name, a licence, a phone, a club and a status, where a `User` — a general
 * admin, say — need not.
 */
export type Player = Omit<User, 'role' | 'isPlayer'> &
  Required<Pick<User, 'firstName' | 'lastName' | 'licenseNumber' | 'phone' | 'status' | 'clubId'>> & {
    /** ISO timestamp of the player's avatar, or undefined if none. The image
     *  itself is fetched separately via GET /api/users/:id/avatar; this acts as
     *  a cache-busting version. */
    avatarUpdatedAt?: string
  }

export interface Team {
  /** Derived at creation from (club, phase, number) (#282); opaque thereafter. */
  id: string
  clubId: string
  phaseId: string
  number: number
  /**
   * Division of this team's group. Derived by the API, not stored: the column
   * was dropped in migration 0031 because the group already holds it (#282).
   */
  divisionId: string
  groupId: string
  gameLocationId: string
  defaultDay: string
  defaultTime: string
  captainId: string
  isArchived: boolean
  /** Roster for this team (phase). Used for availability and game selection. */
  playerIds: string[]
  /** Optional hex color for table/header display (e.g. #374151). */
  color?: string
  whatsappLink?: string
  /** FFTT team id, when this team came from FFTT (#282). */
  teamId?: string
}

/**
 * A player's official points for a phase (#384).
 *
 * Keyed on (phaseId, playerId) — the table's primary key. Points used to hang
 * off the team (`Team.rosterInitialPoints`), which left a licensee with no team
 * nowhere to put them even though the value is the same: it belongs to the
 * phase, not to the squad. The FFTT import is the only writer, so one player
 * has one value per phase by construction.
 */
export interface PlayerPhasePoints {
  phaseId: string
  playerId: string
  /** Points as text, the way FFTT states them ("1731"). */
  points: string
}

export type AvailabilityStatus = 'available' | 'maybe' | 'unavailable'

export type AvailabilityOverriddenBy = 'captain' | 'club_admin'

export interface GameAvailability {
  /** Keyed on (gameId, playerId) — the table's primary key since 0033 (#282). */
  gameId: string
  playerId: string
  status: AvailabilityStatus
  /** Set when captain or club admin overrides the player's choice */
  overriddenBy?: AvailabilityOverriddenBy
}

export interface MatchDay {
  id: string
  groupId: string
  number: number
  date: string
}

export interface Game {
  /** Derived at creation from (journée, home, away) (#282); opaque thereafter. */
  id: string
  matchDayId: string
  homeTeamId: string
  awayTeamId: string
  /** Optional time (e.g. "20h00"). */
  time?: string
  /** This game's own date (#271); falls back to its match day's (derived) date when unset. */
  date?: string
  /**
   * Where this game's date and time come from (#294): 'fftt' or 'document'
   * for an import, 'manual' once a human set the slot — which no import then
   * overwrites. Absent for games predating the field.
   */
  source?: 'fftt' | 'document' | 'manual'
  /** FFTT match id, when this game came from FFTT (#282). */
  gameId?: string
}

/** Per game, per team: which players are selected to play (captain/club admin). */
export interface GameSelection {
  /** Keyed on (gameId, teamId) — the table's primary key since 0033 (#282). */
  gameId: string
  teamId: string
  playerIds: string[]
}

/**
 * The whole dataset the app holds — and, byte for byte, the body of
 * GET /api/data.
 *
 * It lives here rather than inside DataContext (#285) so both ends of that
 * request are checked against the same declaration: the API annotates its
 * response with it, the client asserts the response is it. Before, the server
 * built anonymous object literals and the client asserted a shape it could not
 * see, so a field could be renamed or dropped on one side with nothing to
 * notice. Note the limit: a field that is optional here (Game.date, say) can
 * still go missing from the payload without a type error — see #292.
 */
export interface DataState {
  divisions: Division[]
  competitions: Competition[]
  competitionEligibilities: CompetitionEligibility[]
  clubs: Club[]
  seasons: Season[]
  phases: Phase[]
  groups: Group[]
  teams: Team[]
  players: Player[]
  playerPhasePoints: PlayerPhasePoints[]
  matchDays: MatchDay[]
  games: Game[]
  gameAvailabilities: GameAvailability[]
  gameSelections: GameSelection[]
  users: User[]
}

/**
 * A person in the system. Every player is a user (isPlayer = true); some users
 * (admins) are not players. Person fields are populated when isPlayer is true.
 */
export interface User {
  id: string
  /**
   * Absent when the member has no address on file (#315). E-mail is also the
   * sign-in identifier, so such a member cannot log in — which was already
   * true of the `@ppclub.invalid` placeholders this replaced.
   */
  email?: string
  role: Role
  isPlayer: boolean
  firstName?: string
  lastName?: string
  licenseNumber?: string
  phone?: string
  birthDate?: string
  birthPlace?: string
  /**
   * Age category, as the FFTT's <cat> states it — "S", "V45", sometimes "B2"
   * (#482). Stored verbatim and normalized on read (see
   * `src/lib/playerCategories.ts`), so a code we have never met costs nothing.
   */
  category?: string
  status?: PlayerStatus
  /** The person's club (players have one; club_admins administer it). */
  clubId?: string
  /**
   * ISO timestamp of the member's last visit — absent when they have never
   * signed in, and absent for every row when the reader is not entitled to it
   * (#406).
   *
   * The distinction matters when reading this field: `GET /api/data` only
   * fills it in for members the caller administers, so `undefined` means
   * "never opened the app" *or* "none of your business", and the two are not
   * distinguishable client-side. Only screens already restricted to admins
   * should read it — everywhere else it is uniformly absent, by design.
   */
  lastSeenAt?: string
}

/**
 * A user as listed by the preview-only dev-login picker (#313). Anonymisation
 * leaves every member with a pseudonym, so the picker needs the two things that
 * still tell them apart (#345): which club they belong to, and which teams they
 * captain — captaincy is derived from `Team.captainId` and so cannot be read
 * from the user row alone.
 */
export interface DevUser extends User {
  clubName?: string
  /** Numbers of the teams this member captains, ascending. Absent if none. */
  captainOf?: number[]
}
