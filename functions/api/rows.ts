// Shapes of the D1 rows this API reads (#285).
//
// Why this exists: `db.prepare(...).all()` returns
// `D1Result<Record<string, unknown>>`, so every column access typechecks and
// yields `unknown`. A typo — `r.display_nam` — compiles happily and ships
// `undefined` into the payload, which is how a field silently goes missing
// (see #292, where games.date never reached the client). Naming the columns
// turns that into a compile error.
//
// What these types are NOT: a validation layer. D1 hands back whatever is in
// the database; nothing here checks it at runtime. They describe what the
// schema declares and what this app writes, so that reading a column the
// schema does not have, or spelling one wrong, fails the build.
//
// Conventions, mirroring the migrations:
//   * NOT NULL columns are required; every other column is `| null`, which is
//     what SQLite actually returns for an absent value.
//   * INTEGER booleans stay `number` — they are 0/1 and go through `bool()`.
//   * JSON-encoded array/object columns stay `string`; they go through
//     `jsonParse()`.
//   * Enum-ish columns use the shared domain unions. seasons.status and
//     phases.status carry a real CHECK constraint; the others (users.role,
//     club_channels.type, game_availabilities.status) are documented by
//     comment in the schema and enforced by the app's writes.

import type {
  AvailabilityOverriddenBy,
  AvailabilityStatus,
  ClubChannelType,
  Game,
  LifecycleStatus,
  PlayerStatus,
  Role,
} from '../../src/types'

// ---------------------------------------------------------------------------
// Reading JSON-encoded columns
// ---------------------------------------------------------------------------

/** Decode a JSON column; returns the raw value when it does not parse. */
const jsonParse = (v: unknown): unknown => {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
  return v ?? []
}

/**
 * A JSON array column (team_ids, player_ids) as the list of ids it should be.
 *
 * Checks rather than asserts (#285). These used to be read as
 * `jsonParse(x) as string[]`, which promises something nothing verifies —
 * and migration 0034 had to strip a NULL that had leaked into a team_ids
 * array, so a wrong-shaped element is not hypothetical here. Anything that is
 * not a string is dropped: it was never a usable id.
 */
export const jsonParseIds = (v: unknown): string[] => {
  const parsed = jsonParse(v)
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
}

/** A JSON object column (roster_initial_points) as its string-valued entries. */
export const jsonParseStringMap = (v: unknown): Record<string, string> => {
  const parsed = jsonParse(v)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface SeasonRow {
  id: string
  display_name: string
  /** CHECK (status IN ('active', 'upcoming', 'archived')). */
  status: LifecycleStatus
}

export interface PhaseRow {
  id: string
  season_id: string
  name: string
  display_name: string
  /** CHECK (status IN ('active', 'upcoming', 'archived')). */
  status: LifecycleStatus
}

export interface DivisionRow {
  id: string
  phase_id: string
  display_name: string
  rank: number
  players_per_game: number
  is_archived: number
  /** FFTT id of the division above this one (#236); null at the top level. */
  parent_id: string | null
  /** FFTT identifier, e.g. "GE3P1" (#275); null for hand-made divisions. */
  identifier: string | null
}

export interface ClubRow {
  id: string
  display_name: string
  is_archived: number
  /** Nullable since migration 0019 — a club may legitimately have no number. */
  affiliation_number: string | null
}

export interface ClubAddressRow {
  id: string
  club_id: string
  label: string
  street: string
  postal_code: string
  city: string
  is_default: number
}

export interface ClubChannelRow {
  id: string
  club_id: string
  /** website | whatsapp | facebook | other. */
  type: ClubChannelType
  link: string
  /** Blank falls back to the type's label. */
  display_name: string | null
  sort_order: number
}

export interface GroupRow {
  id: string
  division_id: string
  number: number
  /** JSON array of team ids. */
  team_ids: string
  is_archived: number
  /** FFTT pool id (#278); null for groups created by hand or read off a PDF. */
  group_id: string | null
}

export interface TeamRow {
  id: string
  club_id: string
  phase_id: string
  number: number
  group_id: string
  game_location_id: string
  default_day: string
  default_time: string
  captain_id: string
  /** JSON array of player ids. */
  player_ids: string
  /** JSON object of playerId -> points. */
  roster_initial_points: string | null
  color: string | null
  whatsapp_link: string | null
  is_archived: number
  /** FFTT team id (#282). */
  team_id: string | null
}

export interface MatchDayRow {
  id: string
  group_id: string
  number: number
  date: string
}

export interface GameRow {
  id: string
  match_day_id: string
  home_team_id: string
  away_team_id: string
  time: string | null
  /** The game's own date (#271) — distinct from its journée's. */
  date: string | null
  /** FFTT match id (#282). */
  game_id: string | null
  /** Who set the slot (#294); null for games predating the column. */
  source: NonNullable<Game['source']> | null
}

export interface GameAvailabilityRow {
  game_id: string
  player_id: string
  status: AvailabilityStatus
  overridden_by: AvailabilityOverriddenBy | null
}

export interface GameSelectionRow {
  game_id: string
  team_id: string
  /** JSON array of player ids. */
  player_ids: string
}

export interface UserRow {
  id: string
  /** NULL when the member has no address on file (#315). */
  email: string | null
  /** general_admin | club_admin | player. */
  role: Role
  is_player: number
  first_name: string | null
  last_name: string | null
  license_number: string | null
  phone: string
  birth_date: string | null
  birth_place: string | null
  status: PlayerStatus
  club_id: string | null
}
