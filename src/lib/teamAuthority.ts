// Who may answer for a player, compose a line-up, and run a team (#569).
//
// Shared domain logic — imported by the web app (@/lib/teamAuthority), by the
// mobile app (@shared/lib/teamAuthority) and by the API, so keep it free of any
// browser/RN/Node deps. The type imports below are type-only, so they carry no
// runtime dependency.
//
// One rule, one place, for the same reason as src/lib/competitionEligibility.ts
// and src/lib/clubAdmins.ts: the matrix greys a cell, the app hides a control,
// and the API refuses a write. Before this module there were four copies —
// `useMatchDayEditing`, a second set inline in `MatchDaysPage`, `mobile/utils/
// roles.ts`, and nothing at all on the server, which is what #569 was about.

import type { AvailabilityOverriddenBy, Role } from '../types'

/** The caller, reduced to what these rules read. */
export interface AuthorityViewer {
  id: string
  role: Role
  /** The club they administer or play for; undefined for a general admin. */
  clubId?: string
}

/** A team, reduced to what these rules read. */
export interface AuthorityTeam {
  id: string
  clubId: string
  captainId: string
}

/**
 * The licensee being answered for.
 *
 * `clubId` is required, not optional: it is the conjunct the screens leave
 * implicit (they only ever offer players of the club) and the one the API
 * cannot do without — see `mayAnswerFor`.
 */
export interface AuthorityPlayer {
  id: string
  clubId: string
}

/**
 * Who runs a team: its captain, its club's administrator, or a general admin.
 *
 * This is the line-up rule *and* the team-settings rule — the roster, the
 * captaincy, the WhatsApp link, the colour. Deliberately **not** the
 * availability rule below. The two look alike and differ where it counts: a
 * general administrator composes any team but answers for nobody, because an
 * availability is a personal declaration and someone administering every club
 * in the country is not in that loop.
 *
 * This is the app's rule (`canManageTeam`), not the web's narrower
 * `canEditGameSelection`, which omitted the general admin — the two had
 * drifted, and the documented intent is this one.
 */
export function mayManageTeam(viewer: AuthorityViewer, team: AuthorityTeam): boolean {
  if (viewer.role === 'general_admin') return true
  if (viewer.role === 'club_admin') return viewer.clubId === team.clubId
  return team.captainId === viewer.id
}

/**
 * Whether `viewer` may set `player`'s availability for a game `team` is playing
 * (#462): the player themselves, their captain, or their club's administrator —
 * and nobody else.
 *
 * The player need not be on the team's roster. "Autres joueurs du club" is
 * exactly that: a club records the availability of someone it has not yet put
 * in a squad, and that is how they get picked as a renfort.
 *
 * **They must, however, belong to the team's club**, and that conjunct is the
 * one thing this module adds rather than moves. The screens never had to state
 * it — they only ever list the club's own licensees — but with the rule on the
 * server the call site no longer constrains anything, and without it a club
 * admin could answer for the opposing club's players on their own fixtures,
 * which is most of what #569 set out to close.
 */
export function mayAnswerFor(
  viewer: AuthorityViewer,
  team: AuthorityTeam,
  player: AuthorityPlayer,
): boolean {
  // Answering for oneself is allowed wherever one plays, and needs no team.
  if (viewer.id === player.id) return true
  if (player.clubId !== team.clubId) return false
  if (team.captainId === viewer.id) return true
  return viewer.role === 'club_admin' && viewer.clubId === team.clubId
}

/**
 * What `game_availabilities.overridden_by` should record — `undefined` when the
 * player answers for themselves, which is also what clears a previous override.
 *
 * Derived, never accepted from the request: it is an assertion the caller makes
 * about themselves, and it is what makes a screen say "répondu par le
 * capitaine". The screens still compute it to render that label; the API
 * computes it again and writes its own answer.
 */
export function answerOverride(
  viewer: AuthorityViewer,
  team: AuthorityTeam,
  player: AuthorityPlayer,
): AvailabilityOverriddenBy | undefined {
  if (viewer.id === player.id) return undefined
  if (player.clubId !== team.clubId) return undefined
  if (team.captainId === viewer.id) return 'captain'
  if (viewer.role === 'club_admin' && viewer.clubId === team.clubId) return 'club_admin'
  return undefined
}

/**
 * Whether `viewer` may answer for `player` on a fixture between `teams` — the
 * question the API asks, where no team id travels in the request.
 *
 * Either side of the fixture may admit it, and which one does is not a detail
 * to resolve first: an away captain answers through their own team, a home club
 * admin through theirs, and a player answering for themselves through neither.
 * Resolving "the" team by roster membership (the way #495's notification does)
 * would be wrong here, since the licensee may be on no roster at all.
 */
export function mayAnswerOnFixture(
  viewer: AuthorityViewer,
  teams: AuthorityTeam[],
  player: AuthorityPlayer,
): boolean {
  return teams.some((team) => mayAnswerFor(viewer, team, player))
}

/**
 * The override to record for a fixture, from whichever side grants it.
 *
 * A captain's answer outranks a club admin's, so the sides are read in that
 * order rather than taking the first that says anything: a club admin who also
 * captains a team must be recorded as the captain they are.
 */
export function fixtureOverride(
  viewer: AuthorityViewer,
  teams: AuthorityTeam[],
  player: AuthorityPlayer,
): AvailabilityOverriddenBy | undefined {
  if (viewer.id === player.id) return undefined
  const answers = teams.map((team) => answerOverride(viewer, team, player))
  return answers.find((a) => a === 'captain') ?? answers.find((a) => a === 'club_admin')
}
