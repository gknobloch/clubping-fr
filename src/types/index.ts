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
export interface Player {
  id: string
  firstName: string
  lastName: string
  licenseNumber: string
  email: string
  phone: string
  birthDate?: string
  birthPlace?: string
  status: PlayerStatus
  clubId: string
  /** ISO timestamp of the player's avatar, or undefined if none. The image
   *  itself is fetched separately via GET /api/players/:id/avatar; this acts as
   *  a cache-busting version. */
  avatarUpdatedAt?: string
}

export interface Team {
  id: string
  clubId: string
  phaseId: string
  number: number
  divisionId: string
  groupId: string
  gameLocationId: string
  defaultDay: string
  defaultTime: string
  captainId: string
  isArchived: boolean
  /** Roster for this team (phase). Used for availability and game selection. */
  playerIds: string[]
  /** Initial points per player at the start of the phase (Club Admin sets when defining roster). */
  rosterInitialPoints?: Record<string, string>
  /** Optional hex color for table/header display (e.g. #374151). */
  color?: string
  whatsappLink?: string
}

export type AvailabilityStatus = 'available' | 'maybe' | 'unavailable'

export type AvailabilityOverriddenBy = 'captain' | 'club_admin'

export interface GameAvailability {
  id: string
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
  id: string
  matchDayId: string
  homeTeamId: string
  awayTeamId: string
  /** Optional time (e.g. "20h00"). */
  time?: string
  /** This game's own date (#271); falls back to its match day's (derived) date when unset. */
  date?: string
}

/** Per game, per team: which players are selected to play (captain/club admin). */
export interface GameSelection {
  id: string
  gameId: string
  teamId: string
  playerIds: string[]
}

/**
 * A person in the system. Every player is a user (isPlayer = true); some users
 * (admins) are not players. Person fields are populated when isPlayer is true.
 */
export interface User {
  id: string
  email: string
  role: Role
  isPlayer: boolean
  firstName?: string
  lastName?: string
  licenseNumber?: string
  phone?: string
  birthDate?: string
  birthPlace?: string
  status?: PlayerStatus
  /** The person's club (players have one; club_admins administer it). */
  clubId?: string
}
