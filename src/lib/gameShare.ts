// Shared domain logic — sharing a match, and opening a shared one (#747).
// Imported by the web app (@/lib/gameShare) and the mobile app
// (@shared/lib/gameShare). Free of any browser/RN/Node deps, like the rest of
// this folder.
import type { Club, Game, GameSelection, MatchDay, Profile, Team } from '../types'
import { gameSchedule } from './matchdays'
import { getTeamName } from './teamName'

// ---------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------

/**
 * The site a shared link points at. The app shares this one whatever API it
 * talks to: it is the domain the universal links are declared on, and the
 * page that opens when the app is not installed.
 */
export const SHARE_ORIGIN = 'https://clubping.fr'

/**
 * A shared match: the fixture, and the team of whoever shared it.
 *
 * The team is only a hint. A match screen is one team's view of a fixture
 * (#552), and the right team is the recipient's — the side they play on —
 * which the sender cannot know. It decides only when the recipient is on
 * neither side.
 */
export interface SharedGame {
  gameId: string
  teamId?: string
}

/**
 * `/match/<id>?equipe=<team>` — a path of its own, not the web's
 * `/journees/<id>`: opening it is what asks "whose profile is this?", and
 * moving between matches inside the app must never ask that. It is also the
 * only path the universal links claim, so nothing else in the site is
 * captured by the app.
 */
export function gameSharePath({ gameId, teamId }: SharedGame): string {
  const query = teamId ? `?equipe=${encodeURIComponent(teamId)}` : ''
  return `/match/${encodeURIComponent(gameId)}${query}`
}

export function gameShareUrl(game: SharedGame, origin: string = SHARE_ORIGIN): string {
  return `${origin.replace(/\/+$/, '')}${gameSharePath(game)}`
}

/**
 * The shared match a path or URL names, or null when it names none.
 *
 * Accepts whatever reaches an app: the site's URL (a universal link), the
 * app's own scheme (`clubping://match/…`, whose "host" is the first segment),
 * or a bare path.
 */
export function parseGameSharePath(pathOrUrl: string): SharedGame | null {
  let rest = pathOrUrl.trim()
  // Drop a scheme and authority, keeping what follows. A custom scheme puts
  // the first segment where a host would be, hence the optional `//host`.
  const scheme = /^[a-z][a-z0-9+.-]*:(\/\/)?/i.exec(rest)
  if (scheme) {
    rest = rest.slice(scheme[0].length)
    if (/^https?:/i.test(scheme[0])) rest = rest.replace(/^[^/?#]*/, '')
  }
  rest = rest.replace(/^\/+/, '/')
  if (!rest.startsWith('/')) rest = `/${rest}`

  const [pathname, search = ''] = rest.split('#')[0].split('?')
  const m = /^\/match\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  let gameId: string
  try {
    gameId = decodeURIComponent(m[1])
  } catch {
    return null
  }
  if (!gameId) return null
  const teamParam = search
    .split('&')
    .map((pair) => pair.split('='))
    .find(([k]) => k === 'equipe')?.[1]
  let teamId: string | undefined
  try {
    teamId = teamParam ? decodeURIComponent(teamParam.replace(/\+/g, ' ')) : undefined
  } catch {
    teamId = undefined
  }
  return teamId ? { gameId, teamId } : { gameId }
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/**
 * "samedi 17 octobre". Spelled out here rather than through `Intl`: the
 * message is the same text on both platforms, and Hermes' locale data is not
 * the browser's.
 */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`
}

/**
 * What a shared match says before its link: the journée and the fixture, home
 * first as every match header writes it, then when — the date and hour the
 * screen would print, the week when no day is known (#429, #649). Never a
 * venue or a line-up: the link is there for that, and a message pasted into a
 * group should read in one glance.
 */
export function gameShareMessage({
  game, matchDay, teams, clubs, url,
}: {
  game: Game
  matchDay: MatchDay
  teams: Team[]
  clubs: Club[]
  url: string
}): string {
  const home = teams.find((t) => t.id === game.homeTeamId)
  const away = teams.find((t) => t.id === game.awayTeamId)
  const name = (t: Team | undefined) => (t ? getTeamName(t, clubs) : 'Équipe inconnue')
  const slot = gameSchedule(game, matchDay, home)
  const when = slot.date
    ? `${longDate(slot.date)}${slot.time ? ` à ${slot.time}` : ''}`
    : slot.week
      ? `semaine du ${longDate(slot.week.start)}`
      : ''
  return [
    `Journée ${matchDay.number} · ${name(home)} – ${name(away)}`,
    when && when.charAt(0).toUpperCase() + when.slice(1),
    url,
  ].filter(Boolean).join('\n')
}

/** WhatsApp's own share link: it opens the app on "send to…" with the text. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

// ---------------------------------------------------------------------------
// Whose profile opens it
// ---------------------------------------------------------------------------

/** A profile that can open the match, and the side it sees it from. */
export interface SharedGameCandidate {
  profileId: string
  teamId: string
}

export type SharedGameOpening =
  /** Open as this profile — the current one, or one to switch to first. */
  | { kind: 'open'; profileId: string; teamId: string }
  /** Several profiles are in it: the member chooses. Current profile first. */
  | { kind: 'ask'; candidates: SharedGameCandidate[] }

/**
 * Which of the profiles a member reaches should open a shared match (#747).
 *
 * The question is "who plays in it?", asked of every profile the session
 * reaches (#655: the person's own, and those delegated to them) — never of the
 * profile the app happens to be on. Gilles left on his Rixheim profile opens
 * a Landser match as Landser: the club is what decides, and the federation
 * comes with it.
 *
 * In it means on the roster, captain, or named in the line-up — the last for
 * a renfort, whom no roster holds. One such profile opens it. Several — a
 * parent and the child they manage, in the same team — and nothing here can
 * say which one the link was for, so the member is asked. None: a profile of
 * one of the two clubs (an admin, a player off both rosters), the current one
 * first. Still none: the current profile, on the sender's side — the match is
 * readable by anyone, it is just nobody's.
 *
 * `profiles` is what the server named, current profile included; offline it
 * is empty, and the current profile is all there is.
 */
export function sharedGameOpening({
  shared, game, teams, gameSelections, profiles, currentProfile,
}: {
  shared: SharedGame
  game: Game
  teams: Team[]
  gameSelections: GameSelection[]
  profiles: Profile[]
  currentProfile: Pick<Profile, 'id' | 'clubId'>
}): SharedGameOpening {
  const sides = [game.homeTeamId, game.awayTeamId]
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is Team => t != null)

  // The current profile leads every list, so a tie it is part of keeps it on
  // top and "stay" is the first answer offered.
  const reached = [
    currentProfile,
    ...profiles.filter((p) => p.id !== currentProfile.id),
  ]

  const playsFor = (profileId: string): Team | undefined =>
    sides.find((t) =>
      t.captainId === profileId ||
      (t.playerIds ?? []).includes(profileId) ||
      gameSelections.some((s) => s.gameId === game.id && s.teamId === t.id && s.playerIds.includes(profileId)),
    )

  const playing = reached.flatMap((p) => {
    const team = playsFor(p.id)
    return team ? [{ profileId: p.id, teamId: team.id }] : []
  })
  if (playing.length === 1) return { kind: 'open', ...playing[0] }
  if (playing.length > 1) return { kind: 'ask', candidates: playing }

  const ofClub = reached.flatMap((p) => {
    const team = sides.find((t) => p.clubId && t.clubId === p.clubId)
    return team ? [{ profileId: p.id, teamId: team.id }] : []
  })
  // Nobody plays: no reason to move a member already on one of the clubs.
  if (ofClub[0]?.profileId === currentProfile.id) return { kind: 'open', ...ofClub[0] }
  if (ofClub.length === 1) return { kind: 'open', ...ofClub[0] }
  if (ofClub.length > 1) return { kind: 'ask', candidates: ofClub }

  const hinted = sides.find((t) => t.id === shared.teamId) ?? sides[0]
  return { kind: 'open', profileId: currentProfile.id, teamId: hinted?.id ?? game.homeTeamId }
}
