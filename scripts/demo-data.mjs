// ---------------------------------------------------------------------------
// The demo club's calendar, re-anchored on today (#520)
//
// `clubping.demo@leskno.fr` is the account App Store and Play reviewers sign
// in with, and the one scripts/store-screenshots.mjs drives. Its club exists
// for those two jobs alone — nobody plays in it.
//
// Its fixtures were written once, with fixed dates, and a calendar with fixed
// dates goes stale by definition. It already had: journée 1 yesterday,
// journée 2 four weeks out, and journée 3 on 18 May 2030 — a date somebody
// picked to keep "prochaines journées" from emptying, which is the same
// problem being patched rather than solved. An App Store reviewer opening the
// app in November should not find a season that ended in September.
//
// So the dates are not data here; the OFFSETS are. One journée just played,
// one this coming week, the rest of the phase a fortnight apart — recomputed from today's date
// every time this runs, which is before a screenshot session and before a
// store review.
//
// It also settles who the account IS: a player (not merely a club_admin, which
// gets a different Accueil entirely — see #522), captain of demo-team-1, and
// named like a person rather than "Démo App Store".
//
// It writes to PRODUCTION, so it refuses to touch anything that is not the
// demo club: see assertDemoOnly. And it prints its plan and changes nothing
// unless given --apply.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB = 'clubping-fr-prod'

/** The review account, and the only user row this may touch. */
export const DEMO_USER = 'user-appstore-demo'
/**
 * Who the review account is, on screen.
 *
 * It was "Démo App Store", which is a label rather than a person: it appeared
 * as the member's own name on the Accueil card, in the line-up, and beside
 * every availability — and a store listing showing a user called "Démo App
 * Store" advertises test data. Its ten team-mates were always real-looking
 * names (Alex Martin, Léa Moreau, Hugo Girard…); this one was the odd one out.
 *
 * Invented, and deliberately ordinary: it must not name anybody who plays in
 * this league. The licence number continues the demo club's own 9999xxxx
 * series, which no federation issues.
 */
export const DEMO_IDENTITY = {
  firstName: 'Julien',
  lastName: 'Mercier',
  licenseNumber: '99990011',
  /**
   * His classement. Every one of the ten demo players carries one (905 to
   * 1520) and the review account carried none — so the member reading his own
   * Accueil, and the captain at the head of his own squad, were the one line
   * on screen with a blank where a number goes.
   *
   * Points are stated per PHASE (#482's sibling rule, migration 0038), so the
   * row is keyed on the phase demo-team-1 actually plays in, read off the team
   * rather than assumed. Stored as text, as the column is: FFTT sends a string
   * and nothing here does arithmetic on it.
   */
  points: '1491',
}

/** The team it captains — the one whose next match the Accueil screen shows. */
export const DEMO_TEAM = 'demo-team-1'

/**
 * How the squad answered for the match that is coming up.
 *
 * An empty availability panel — "0 disponibles · 6 sans réponse" — is what the
 * screen looks like when nobody has used the feature, which is the opposite of
 * what a store listing should show. A spread is also the only way to see the
 * three states side by side, and the counts the captain actually reads.
 *
 * The sixth member of the squad is deliberately missing from this map:
 * "sans réponse" is a real state, it is the ABSENCE of a row rather than a
 * value, and the screen has to show it alongside the rest. It is also what
 * makes the count on the card mean something.
 */
export const DEMO_AVAILABILITY = {
  'user-appstore-demo': 'available', // the captain answers for himself first
  'demo-player-1': 'available',
  'demo-player-2': 'available',
  'demo-player-3': 'maybe',
  'demo-player-4': 'unavailable',
  // demo-player-5: rien — sans réponse
}

/**
 * Kick-off. Late afternoon reads better on a screenshot than late evening.
 *
 * Written to the GAMES and to the teams' declared slot both. They are two
 * different facts — a team says when it normally receives, a game says when it
 * is actually played — and the team detail screen shows the *declared* one
 * ("Calendrier : Samedi 17h00"). Setting only the games left that card
 * contradicting every fixture under it.
 */
export const KICK_OFF = '16h00'

/** The day that slot falls on, stated for the same reason as the hour. */
export const KICK_OFF_DAY = 'Samedi'

/**
 * The line-up the captain has already made for the coming match.
 *
 * The three who said yes, plus one borrowed from the second team — which is
 * what "Autres joueurs du club" is for, and the only way a screenshot shows
 * that the picker reaches beyond one squad.
 *
 * Camille Durand is the point of the fourth name being hers rather than
 * anyone's: she also played journée 1, and two games across the club's teams
 * is what `computeBrulage` counts as burned. Her player screens therefore
 * carry the brûlage badge, which is a rule no other app in this niche
 * explains, and worth a screenshot of its own.
 */
export const DEMO_LINEUP = [
  'user-appstore-demo', // Julien Mercier — oui
  'demo-player-1', //      Alex Martin — oui
  'demo-player-2', //      Camille Durand — oui, et brûlée par la journée 1
  'demo-player-7', //      Hugo Girard — équipe 2, monté en équipe 1
]

/**
 * What screen 07 says about Camille Durand beyond her name.
 *
 * Her profile is one of the eight store screenshots, and an empty fiche does
 * not demonstrate a fiche. The category is the field
 * #482's whole eligibility rule hangs off, and it is what makes the profile
 * print "Vétéran 40" instead of nothing; the phone number is what puts
 * `PhoneRow` on the screen at all — copy button and WhatsApp both (#503), two
 * affordances that are invisible on a licensee who has no number.
 *
 * The number is in ARCEP's range reserved for fiction (07 99 98 xx xx, the
 * French equivalent of 555-0100): this image goes on a public store listing,
 * and an invented-looking number is not the same thing as an unallocated one.
 * Written with the spaces it should be read with — `PhoneRow` prints the
 * string verbatim and strips non-digits itself for the wa.me link.
 *
 * A category belongs to a SEASON, not to a licensee (#482, migration 0050), so
 * the row is keyed on the active season — looked up here rather than written
 * down, since "27" is this August's answer and not next August's.
 */
export const DEMO_PROFILE = {
  'demo-player-2': { category: 'V40', phone: '+33 7 99 98 12 34' },
}

/**
 * When each demo member last opened the app, in DAYS AGO.
 *
 * Offsets, like the calendar and for the same reason — a stored timestamp is
 * stale the week after it is written, and "Jamais connecté" is what an absent
 * one renders as.
 *
 * Which was the whole problem: every licensee but the review account carried
 * no visit, so the Joueurs list read as eleven people who have never opened
 * the app — an advertisement for a club that does not use it. The spread is
 * what a live club looks like: somebody today, somebody yesterday, somebody a
 * fortnight ago.
 *
 * Under 28 days on purpose. Past that `src/lib/lastSeen.ts` stops saying
 * "il y a N semaines" and prints a bare date, which reads as a record rather
 * than as activity.
 */
export const DEMO_LAST_SEEN = {
  'user-appstore-demo': 0, //  Julien Mercier — aujourd'hui
  'demo-player-1': 0, //       Alex Martin
  'demo-player-2': 1, //       Camille Durand — hier
  'demo-player-3': 2, //       Sam Petit
  'demo-player-4': 3, //       Léa Moreau
  'demo-player-5': 6, //       Noah Fontaine
  'demo-player-6': 8, //       Jade Robert — « il y a 1 semaine »
  'demo-player-7': 1, //       Hugo Girard
  'demo-player-8': 4, //       Manon Bonnet
  'demo-player-9': 11, //      Louis Dupont
  'demo-player-10': 16, //     Emma Lambert — « il y a 2 semaines »
}

/** The journée whose match the Accueil hero card shows: the one coming up. */
export const UPCOMING_JOURNEE = 2

/**
 * The journée already played — the club's past, and the other half of the
 * matrix a store screenshot shows.
 *
 * Declared rather than inherited, for the reason the dates are (#520): what
 * this script does not state drifts, and nobody notices, because four names
 * and five names look alike. `seed-demo.sql` puts four players on
 * `demo-g-1-1`; production had five, so the journées matrix printed
 * « Résumé — Compo 5/4 » in red onto both store listings — the impossible
 * line-up that #583 added that row to catch (#598).
 */
export const PLAYED_JOURNEE = 1

/**
 * Who played it. Four, because that is what the division asks for.
 *
 * Two of these names are load-bearing and must not be swapped out:
 *
 * - **Camille Durand** is what makes her brûlée — this match plus the coming
 *   one, across two of the club's teams, is exactly what `computeBrulage`
 *   counts. Her badge is the subject of screenshot 07, and
 *   `DEMO_LINEUP` names her for the same reason.
 * - **The review account** keeps « Matchs joués 1/1 » true on the first screen
 *   of the listing. Drop him and his own card reads 0/1: a captain who played
 *   none of his matches.
 */
export const DEMO_PLAYED_LINEUP = [
  'user-appstore-demo', //  Julien Mercier — capitaine, et « 1/1 » sur sa carte
  'demo-player-2', //       Camille Durand — et brûlée par la journée à venir
  'demo-player-3', //       Sam Petit
  'demo-player-4', //       Léa Moreau
]

/** The demo club itself — the key every club-wide statement below is pinned to. */
export const DEMO_CLUB = 'demo-club'

/**
 * How many journées the demo phase holds (#634).
 *
 * Three was enough for the Accueil card and the journées matrix, which only
 * ever look at a handful around today. The planning de la phase (#623) reads
 * the WHOLE phase for one team, and three columns read as a stub rather than
 * as a season — screenshot 09 is that grid. Six is what a poule of four plays:
 * each opponent twice, aller then retour.
 */
export const JOURNEES = 6

/**
 * The two poules the demo club plays in, and who it meets.
 *
 * The fixtures are DERIVED from this rather than read back from the database:
 * journées 4 to 6 did not exist until #634, and a calendar that is only
 * updated can never grow. The opponent of journée n is `opponents[(n-1) % 3]`,
 * and the club receives on odd journées — which is exactly the aller the
 * database already held (demo-team-1 at home to Alpha, away at Bravo, at home
 * to Charlie), followed by its retour.
 */
export const DEMO_POULES = [
  {
    key: '1',
    groupId: 'demo-grp-1',
    teamId: 'demo-team-1',
    opponents: ['demo-opp-a1', 'demo-opp-b1', 'demo-opp-c1'],
  },
  {
    key: '2',
    groupId: 'demo-grp-2',
    teamId: 'demo-team-2',
    opponents: ['demo-opp-a2', 'demo-opp-b2', 'demo-opp-c2'],
  },
]

/**
 * Every journée of the phase for demo-team-1, beyond the two above: how the
 * squad answered (#634).
 *
 * This is what the planning de la phase prints, row by row, so it is written
 * the way a real squad answers: nearly everybody for the next fortnight,
 * fewer the further out, and nobody yet for the last one but the captain and
 * one hesitant player. A grid of six full columns would read as invented; a
 * grid of four empty ones would read as unused.
 *
 * Journée 1 states its two non-players as well. Leaving them without a row
 * made the played match print « sans réponse » for two of its six — on a
 * fixture already played, which reads as a squad nobody asked.
 */
export const PHASE_AVAILABILITY = {
  1: {
    'demo-player-1': 'unavailable', // Alex Martin — absent ce jour-là
    'demo-player-5': 'available', //   Noah Fontaine — disponible, pas retenu
  },
  3: {
    'user-appstore-demo': 'available',
    'demo-player-1': 'available',
    'demo-player-2': 'maybe',
    'demo-player-3': 'available',
    'demo-player-4': 'available',
    'demo-player-5': 'available', // …and lent to team 2 that day, see LENT
  },
  4: {
    'user-appstore-demo': 'available',
    'demo-player-1': 'unavailable',
    'demo-player-2': 'available',
    'demo-player-3': 'available',
    'demo-player-4': 'maybe',
  },
  5: {
    'user-appstore-demo': 'available',
    'demo-player-1': 'available',
    'demo-player-2': 'available',
    'demo-player-3': 'unavailable',
  },
  6: {
    'user-appstore-demo': 'available',
    'demo-player-2': 'maybe',
  },
}

/**
 * A team-1 player that team 2 fields, so the planning shows its hatched
 * « En renfort » cell (#623) — with its yes still under the hatching.
 *
 * Noah Fontaine, because he has not played for team 1 at all: lending him down
 * burns nothing, which keeps `computeBrulage` saying about Camille Durand
 * exactly what screen 07 is there to show, and about nobody else.
 *
 * And lent for a reason (#636): Hugo Girard, of team 2's own four, said no
 * for that journée — an answer somebody once entered by hand, kept, and now
 * stated. The first version of this line-up named him anyway, which put a
 * « non » inside a composition. Everybody fielded answers yes, Noah on team
 * 2's match as well as on his own team's: the match screen of either reads
 * the answer filed on its own fixture.
 */
export const LENT = {
  journee: 3,
  teamId: 'demo-team-2',
  lineup: ['demo-player-5', 'demo-player-6', 'demo-player-8', 'demo-player-9'],
  absent: 'demo-player-7',
}

/**
 * Team 2's journée already played (#636) — four, what its division asks for.
 *
 * Never stated until now, and production held three: the journées matrix,
 * which is screenshot 08 on a tablet, prints a line-up short of its division
 * as « Compo 3/4 » in red — the error #598 corrected for team 1, still there
 * for its neighbour. Its whole roster, since all four played; all of them
 * answered yes, the only story a finished fixture tells.
 *
 * Hugo Girard is in it, and also played up in team 1 the journée after:
 * one match in a higher team burns nobody, so the brûlage stays Camille
 * Durand's alone.
 */
export const TEAM2_PLAYED_LINEUP = ['demo-player-6', 'demo-player-7', 'demo-player-8', 'demo-player-9']

/**
 * The halls (#611, #613).
 *
 * The coming match is AWAY — at Démo TT Bravo — and the Accueil card and the
 * match screen show where it is played: the home club's address. The demo
 * opponents had none, so both screens fell back to a town read out of
 * « Démo TT Bravo », which is no town. Each opponent gets the hall an import
 * would have filled from FFTT.
 *
 * The demo club's own hall was entered by hand once; it is stated here like
 * everything else, so it cannot drift away from what the screenshots assume.
 *
 * A town that does not exist, on purpose — the same reason Camille Durand's
 * number is in ARCEP's fiction range: a tap on the address opens a map, and
 * these go on a public listing. A real street in a real town is somebody's
 * front door.
 */
export const DEMO_ADDRESSES = [
  { id: 'demo-addr-1', clubId: 'demo-club', label: 'Gymnase Démo', street: '1 rue de la Démonstration' },
  { id: 'demo-addr-adv-a', clubId: 'demo-club-adv-a', label: 'Salle Alpha', street: '14 rue du Stade' },
  { id: 'demo-addr-adv-b', clubId: 'demo-club-adv-b', label: 'Gymnase Bravo', street: '8 avenue des Sports' },
  { id: 'demo-addr-adv-c', clubId: 'demo-club-adv-c', label: 'Complexe Charlie', street: '3 allée des Tilleuls' },
].map((a) => ({ ...a, postalCode: '68000', city: 'Démoville' }))

/**
 * The club's trainings (#608, #634) — the subject of screenshot 10, and of the
 * carousel the Accueil grows under the matches.
 *
 * Both kinds, because the list's whole point is that they read differently: a
 * free slot that simply holds every Tuesday, and a coached series whose
 * sessions are dated, answered, and sometimes called off.
 *
 * The audience is the whole club (`[]`, #602's rule), not one of the groups
 * somebody created by hand: the review account has to be expected, or the
 * guided card has no « Ma disponibilité » on it, and a group's membership is
 * not something this script states.
 *
 * Alex Martin runs the coached series — a coach is rarely an admin, which is
 * why `managerIds` exists at all.
 */
export const DEMO_TRAININGS = [
  {
    id: 'demo-training-libre',
    kind: 'regular',
    displayName: 'Entraînement libre',
    weekday: 2, // mardi
    startTime: '20:00',
    endTime: '22:00',
    managerIds: [],
  },
  {
    id: 'demo-training-dirige',
    kind: 'guided',
    displayName: 'Entraînement dirigé',
    weekday: null,
    startTime: '18:30',
    endTime: '20:00',
    managerIds: ['demo-player-1'],
  },
]

/** The coached series' day — a Thursday, two days before the matches. */
export const GUIDED_WEEKDAY = 4

/** How many Thursdays ahead the coached series is dated. */
export const GUIDED_SESSIONS = 8

/**
 * Which of those sessions is called off, and why (#608: cancelled is not
 * deleted — it stays listed, struck through, with its reason).
 *
 * The second, so it sits inside the first screen of the list rather than below
 * the fold, and is not the very next one, whose card carries the answers.
 */
export const CANCELLED_SESSION = { index: 1, note: 'Salle prise pour le tournoi du club' }

/**
 * Who answered for the next two sessions held. « Sans réponse » is the absence
 * of a row here as for a match, and the tally only counts the expected — so a
 * few answers out of a club is what a real Thursday looks like.
 */
export const GUIDED_ANSWERS = [
  {
    'user-appstore-demo': 'available',
    'demo-player-1': 'available',
    'demo-player-2': 'maybe',
    'demo-player-3': 'available',
    'demo-player-8': 'unavailable',
  },
  {
    'user-appstore-demo': 'available',
    'demo-player-4': 'available',
  },
]

// ---------------------------------------------------------------------------
// Pure — the offsets, which are the actual subject
// ---------------------------------------------------------------------------

/**
 * Today on the HOST's calendar, not in UTC.
 *
 * `toISOString()` converts first, so a run between midnight and 2 a.m. in
 * France anchored everything on yesterday — the same mistake `todayIso()`
 * exists to avoid in the app (#561). Run on a Saturday night, that is the
 * difference between this week's match and next week's.
 */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** ISO date `days` away from `from`, in UTC so no timezone can shift the day. */
export function shiftDate(from, days) {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The next Saturday strictly after `today` — 1 to 7 days out.
 *
 * Saturday because that is when this league plays, and "strictly after" so
 * running this ON a Saturday anchors the coming one rather than declaring
 * today's match still to come.
 */
export function nextSaturday(today) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = Sunday, 6 = Saturday
  return shiftDate(today, ((6 - dow + 7) % 7) || 7)
}

/**
 * What date each journée should carry, given today.
 *
 * Journée 2 is the one everything is arranged around: inside the coming week,
 * so the Accueil screen shows its hero card, the availability prompts mean
 * something, and a captain has a line-up worth composing. One journée behind
 * it so the season has a past, and the rest of the phase a fortnight apart
 * after it, so it has a future.
 */
export function journeeDates(today) {
  const j2 = nextSaturday(today)
  const dates = {}
  for (let n = 1; n <= JOURNEES; n++) dates[n] = shiftDate(j2, 14 * (n - 2))
  return dates
}

/**
 * Every fixture of the demo phase, both poules — see DEMO_POULES.
 *
 * Ids follow what the database already holds (`demo-md-1-2`, `demo-g-1-2`),
 * so journées 1 to 3 are upserted onto themselves and 4 to 6 are new rows.
 */
export function demoFixtures() {
  return DEMO_POULES.flatMap((p) =>
    Array.from({ length: JOURNEES }, (_, i) => {
      const number = i + 1
      const opponent = p.opponents[i % p.opponents.length]
      const home = number % 2 === 1
      return {
        poule: p.key,
        number,
        groupId: p.groupId,
        matchDayId: `demo-md-${p.key}-${number}`,
        gameId: `demo-g-${p.key}-${number}`,
        homeTeamId: home ? p.teamId : opponent,
        awayTeamId: home ? opponent : p.teamId,
      }
    }),
  )
}

/**
 * The coached series' dates: the next GUIDED_SESSIONS Thursdays strictly
 * after today. Strictly, for the reason `nextSaturday` is: a session dated
 * today is half over by the time anybody looks.
 */
export function guidedDates(today) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() || 7 // ISO: 1 = lundi … 7 = dimanche
  const first = shiftDate(today, ((GUIDED_WEEKDAY - dow + 7) % 7) || 7)
  return Array.from({ length: GUIDED_SESSIONS }, (_, i) => shiftDate(first, 7 * i))
}

/** Nothing outside the demo club is this script's business. */
export function isDemoId(id) {
  return typeof id === 'string' && (id.startsWith('demo-') || id === DEMO_USER)
}

/**
 * Throws unless every id a statement names belongs to the demo club.
 *
 * This runs against production. The guard is not a formality: a mistyped
 * prefix here rewrites a real club's calendar, and the people it would
 * confuse are playing actual matches.
 */
export function assertDemoOnly(ids) {
  const foreign = ids.filter((id) => !isDemoId(id))
  if (foreign.length) {
    throw new Error(`Refus d'écrire hors du club de démo : ${foreign.join(', ')}`)
  }
}

// ---------------------------------------------------------------------------
// D1
// ---------------------------------------------------------------------------

function query(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  // wrangler prints a banner before the JSON.
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '[') continue
    try {
      return new JSONDecoderShim().decode(out.slice(i))[0].results
    } catch {
      /* keep looking */
    }
  }
  throw new Error(`Réponse D1 illisible :\n${out.slice(-600)}`)
}

/** JSON.parse cannot stop at the end of a value; this finds where it ends. */
class JSONDecoderShim {
  decode(text) {
    for (let end = text.length; end > 0; end--) {
      try {
        return JSON.parse(text.slice(0, end))
      } catch {
        /* shrink */
      }
    }
    throw new Error('no JSON')
  }
}

const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`

function main(argv) {
  const apply = argv.includes('--apply')
  const today = localToday()
  const dates = journeeDates(today)
  const fixtures = demoFixtures()
  const sessionDates = guidedDates(today)
  const guided = DEMO_TRAININGS.find((t) => t.kind === 'guided')

  // What the club holds that this script does not name — trainings created by
  // hand while trying a feature out. Read to be SAID, not to be trusted: the
  // statements below replace them, and the plan has to show what goes.
  const strayTrainings = query(
    `SELECT id, display_name FROM trainings WHERE club_id = ${sqlStr(DEMO_CLUB)} ` +
      `AND id NOT IN (${DEMO_TRAININGS.map((t) => sqlStr(t.id)).join(', ')})`,
  )
  const team = query(
    `SELECT id, phase_id, captain_id, player_ids FROM teams WHERE id = ${sqlStr(DEMO_TEAM)}`,
  )[0]
  if (!team) throw new Error(`${DEMO_TEAM} introuvable.`)

  // A category is stated per season (#482), and everything unqualified in the
  // app means the ACTIVE one. Read it: hard-coding the id would file next
  // season's demo data under a season nobody is looking at.
  const season = query("SELECT id FROM seasons WHERE status = 'active'")[0]
  if (!season) throw new Error('Aucune saison active — la catégorie n’a pas de saison où aller.')

  assertDemoOnly([
    ...fixtures.flatMap((f) => [f.gameId, f.matchDayId, f.groupId, f.homeTeamId, f.awayTeamId]),
    ...Object.keys(DEMO_AVAILABILITY),
    ...Object.values(PHASE_AVAILABILITY).flatMap((answers) => Object.keys(answers)),
    ...Object.keys(DEMO_PROFILE),
    ...Object.keys(DEMO_LAST_SEEN),
    ...DEMO_LINEUP,
    ...DEMO_PLAYED_LINEUP,
    ...LENT.lineup,
    LENT.absent,
    LENT.teamId,
    ...TEAM2_PLAYED_LINEUP,
    ...DEMO_ADDRESSES.flatMap((a) => [a.id, a.clubId]),
    ...DEMO_TRAININGS.flatMap((t) => [t.id, ...t.managerIds]),
    ...GUIDED_ANSWERS.flatMap((answers) => Object.keys(answers)),
    DEMO_CLUB,
    team.id,
    DEMO_USER,
  ])

  // demo-team-1's fixture of a given journée.
  const teamGame = (journee) => {
    const f = fixtures.find((x) => x.poule === '1' && x.number === journee)
    if (!f) throw new Error(`Aucun match de ${DEMO_TEAM} en journée ${journee}.`)
    return { id: f.gameId }
  }
  // The upcoming one is the one the hero card shows; the played one is the
  // club's past.
  const upcoming = teamGame(UPCOMING_JOURNEE)
  const played = teamGame(PLAYED_JOURNEE)
  const lentGame = fixtures.find(
    (f) => f.number === LENT.journee && (f.homeTeamId === LENT.teamId || f.awayTeamId === LENT.teamId),
  )
  if (!lentGame) throw new Error(`Aucun match de ${LENT.teamId} en journée ${LENT.journee}.`)
  const team2Played = fixtures.find(
    (f) => f.number === PLAYED_JOURNEE && (f.homeTeamId === LENT.teamId || f.awayTeamId === LENT.teamId),
  )
  if (!team2Played) throw new Error(`Aucun match de ${LENT.teamId} en journée ${PLAYED_JOURNEE}.`)

  // The journées nobody has played or composed yet, whose answers are what
  // the planning de la phase reads.
  const laterJournees = Object.keys(PHASE_AVAILABILITY)
    .map(Number)
    .filter((n) => n !== PLAYED_JOURNEE && n !== UPCOMING_JOURNEE)

  // The coached series' sessions held — the ones an answer can attach to.
  const heldDates = sessionDates.filter((_, i) => i !== CANCELLED_SESSION.index)

  const roster = JSON.parse(team.player_ids)
  const newRoster = roster.includes(DEMO_USER) ? roster : [...roster, DEMO_USER]

  const statements = [
    // Upserted, not updated: journées 4 to 6 did not exist before #634, and a
    // calendar that is only ever updated can never grow.
    ...fixtures.map(
      (f) =>
        `INSERT INTO match_days (id, group_id, number, date) ` +
        `VALUES (${sqlStr(f.matchDayId)}, ${sqlStr(f.groupId)}, ${f.number}, ${sqlStr(dates[f.number])}) ` +
        `ON CONFLICT(id) DO UPDATE SET group_id = excluded.group_id, number = excluded.number, date = excluded.date`,
    ),
    ...fixtures.map(
      (f) =>
        `INSERT INTO games (id, match_day_id, home_team_id, away_team_id, time, date) ` +
        `VALUES (${sqlStr(f.gameId)}, ${sqlStr(f.matchDayId)}, ${sqlStr(f.homeTeamId)}, ` +
        `${sqlStr(f.awayTeamId)}, ${sqlStr(KICK_OFF)}, ${sqlStr(dates[f.number])}) ` +
        `ON CONFLICT(id) DO UPDATE SET match_day_id = excluded.match_day_id, ` +
        `home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, ` +
        `time = excluded.time, date = excluded.date`,
    ),
    // The reviewer's account is a club_admin with no team, so the Accueil
    // screen had no match to show and no line-up to compose. Being captain of
    // demo-team-1 is what puts the hero card on the first screen they see.
    `UPDATE teams SET player_ids = ${sqlStr(JSON.stringify(newRoster))}, captain_id = ${sqlStr(DEMO_USER)} WHERE id = ${sqlStr(DEMO_TEAM)}`,
    // …and being a PLAYER is what decides which Accueil they get at all.
    // `isPlayer` gates the whole hero-card view (app/(tabs)/index.tsx); with
    // is_player = 0 the account fell through to the generic non-player screen,
    // which lists upcoming journées from every club in the database — so the
    // first screenshot showed four other clubs' fixtures. See #522.
    `UPDATE users SET is_player = 1 WHERE id = ${sqlStr(DEMO_USER)}`,
    // A name, not a label — see DEMO_IDENTITY. The licence is the profile's…
    `UPDATE users SET license_number = ${sqlStr(DEMO_IDENTITY.licenseNumber)} WHERE id = ${sqlStr(DEMO_USER)}`,
    // …and the name the PERSON's (#655): `users` has carried none since 0067.
    `UPDATE people SET first_name = ${sqlStr(DEMO_IDENTITY.firstName)}, ` +
      `last_name = ${sqlStr(DEMO_IDENTITY.lastName)} ` +
      `WHERE id = (SELECT person_id FROM users WHERE id = ${sqlStr(DEMO_USER)})`,
    // Keyed (phase_id, player_id) since 0038 — the team's own phase, not the
    // active one: they are the same today and need not be forever.
    `INSERT INTO player_phase_points (phase_id, player_id, points) ` +
      `VALUES (${sqlStr(team.phase_id)}, ${sqlStr(DEMO_USER)}, ${sqlStr(DEMO_IDENTITY.points)}) ` +
      `ON CONFLICT(phase_id, player_id) DO UPDATE SET points = excluded.points`,
    // Rewritten rather than merged, so re-running cannot accumulate a state
    // nobody chose — and so the member left silent stays silent.
    `DELETE FROM game_availabilities WHERE game_id = ${sqlStr(upcoming.id)}`,
    ...Object.entries(DEMO_AVAILABILITY).map(
      ([playerId, status]) =>
        `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
        `VALUES (${sqlStr(upcoming.id)}, ${sqlStr(playerId)}, ${sqlStr(status)}, NULL)`,
    ),
    // Upserted on (game_id, team_id), the table's own key since 0033.
    `INSERT INTO game_selections (game_id, team_id, player_ids) ` +
      `VALUES (${sqlStr(upcoming.id)}, ${sqlStr(DEMO_TEAM)}, ${sqlStr(JSON.stringify(DEMO_LINEUP))}) ` +
      `ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`,
    // The journée already played, stated for the same reason (#598). Upserted
    // like the one above rather than left alone: an inherited line-up is how
    // the matrix came to print « Compo 5/4 » onto two store listings.
    `INSERT INTO game_selections (game_id, team_id, player_ids) ` +
      `VALUES (${sqlStr(played.id)}, ${sqlStr(DEMO_TEAM)}, ${sqlStr(JSON.stringify(DEMO_PLAYED_LINEUP))}) ` +
      `ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`,
    // …and its availabilities, so the played journée reads as settled rather
    // than as a match nobody answered for. Everyone who played said yes, which
    // is the only story a finished fixture tells. Rewritten, not merged, for
    // the reason the upcoming one is.
    //
    // No « sans réponse » here, deliberately: the absent row is the point on
    // the COMING journée, where the captain is still waiting on somebody. On a
    // match already played it would read as a fixture fielded without a squad.
    `DELETE FROM game_availabilities WHERE game_id = ${sqlStr(played.id)}`,
    ...DEMO_PLAYED_LINEUP.map(
      (playerId) =>
        `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
        `VALUES (${sqlStr(played.id)}, ${sqlStr(playerId)}, 'available', NULL)`,
    ),
    // …and the two who did not play, who still answered — see
    // PHASE_AVAILABILITY.
    ...Object.entries(PHASE_AVAILABILITY[PLAYED_JOURNEE] ?? {}).map(
      ([playerId, status]) =>
        `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
        `VALUES (${sqlStr(played.id)}, ${sqlStr(playerId)}, ${sqlStr(status)}, NULL)`,
    ),
    // The rest of the phase (#634): answers, rewritten like the two above, and
    // no line-up yet — stated as none, so a composition somebody tried out by
    // hand does not survive into a screenshot.
    ...laterJournees.flatMap((n) => {
      const game = teamGame(n)
      return [
        `DELETE FROM game_availabilities WHERE game_id = ${sqlStr(game.id)}`,
        `DELETE FROM game_selections WHERE game_id = ${sqlStr(game.id)} AND team_id = ${sqlStr(DEMO_TEAM)}`,
        ...Object.entries(PHASE_AVAILABILITY[n]).map(
          ([playerId, status]) =>
            `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
            `VALUES (${sqlStr(game.id)}, ${sqlStr(playerId)}, ${sqlStr(status)}, NULL)`,
        ),
      ]
    }),
    // Team 2's line-up on the lent journée — the only one this script states
    // for team 2, because it is the one that puts a hatched cell in team 1's
    // planning. See LENT.
    `INSERT INTO game_selections (game_id, team_id, player_ids) ` +
      `VALUES (${sqlStr(lentGame.gameId)}, ${sqlStr(LENT.teamId)}, ${sqlStr(JSON.stringify(LENT.lineup))}) ` +
      `ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`,
    // …and the answers on that match, rewritten: the four fielded say yes,
    // and the one they replace says no — see LENT.
    `DELETE FROM game_availabilities WHERE game_id = ${sqlStr(lentGame.gameId)}`,
    ...[
      ...LENT.lineup.map((playerId) => [playerId, 'available']),
      [LENT.absent, 'unavailable'],
    ].map(
      ([playerId, status]) =>
        `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
        `VALUES (${sqlStr(lentGame.gameId)}, ${sqlStr(playerId)}, ${sqlStr(status)}, NULL)`,
    ),
    // Team 2's played journée — see TEAM2_PLAYED_LINEUP.
    `INSERT INTO game_selections (game_id, team_id, player_ids) ` +
      `VALUES (${sqlStr(team2Played.gameId)}, ${sqlStr(LENT.teamId)}, ${sqlStr(JSON.stringify(TEAM2_PLAYED_LINEUP))}) ` +
      `ON CONFLICT(game_id, team_id) DO UPDATE SET player_ids = excluded.player_ids`,
    `DELETE FROM game_availabilities WHERE game_id = ${sqlStr(team2Played.gameId)}`,
    ...TEAM2_PLAYED_LINEUP.map(
      (playerId) =>
        `INSERT INTO game_availabilities (game_id, player_id, status, overridden_by) ` +
        `VALUES (${sqlStr(team2Played.gameId)}, ${sqlStr(playerId)}, 'available', NULL)`,
    ),
    // The halls — see DEMO_ADDRESSES. One per club, so each is its default.
    ...DEMO_ADDRESSES.map(
      (a) =>
        `INSERT INTO club_addresses (id, club_id, label, street, postal_code, city, is_default) ` +
        `VALUES (${sqlStr(a.id)}, ${sqlStr(a.clubId)}, ${sqlStr(a.label)}, ${sqlStr(a.street)}, ` +
        `${sqlStr(a.postalCode)}, ${sqlStr(a.city)}, 1) ` +
        `ON CONFLICT(id) DO UPDATE SET club_id = excluded.club_id, label = excluded.label, ` +
        `street = excluded.street, postal_code = excluded.postal_code, city = excluded.city, ` +
        `is_default = excluded.is_default`,
    ),
    // The trainings — see DEMO_TRAININGS. The club's whole set is stated, so
    // whatever else it holds goes: sessions and answers first, explicitly,
    // rather than trusting the cascade to be switched on. Pinned to the demo
    // club by its id in every WHERE, which is what assertDemoOnly checked.
    `DELETE FROM training_availabilities WHERE training_id IN ` +
      `(SELECT id FROM trainings WHERE club_id = ${sqlStr(DEMO_CLUB)})`,
    `DELETE FROM training_sessions WHERE training_id IN ` +
      `(SELECT id FROM trainings WHERE club_id = ${sqlStr(DEMO_CLUB)})`,
    `DELETE FROM trainings WHERE club_id = ${sqlStr(DEMO_CLUB)} ` +
      `AND id NOT IN (${DEMO_TRAININGS.map((t) => sqlStr(t.id)).join(', ')})`,
    // Upserted, and the calendar key is minted once: rotating it on every run
    // would break the « toute la série » link of anybody who subscribed.
    ...DEMO_TRAININGS.map(
      (t) =>
        `INSERT INTO trainings (id, club_id, kind, display_name, weekday, start_time, end_time, ` +
        `address_id, member_group_ids, valid_from, valid_until, notes, manager_ids, calendar_token) ` +
        `VALUES (${sqlStr(t.id)}, ${sqlStr(DEMO_CLUB)}, ${sqlStr(t.kind)}, ${sqlStr(t.displayName)}, ` +
        `${t.weekday ?? 'NULL'}, ${sqlStr(t.startTime)}, ${sqlStr(t.endTime)}, NULL, '[]', NULL, NULL, NULL, ` +
        `${sqlStr(JSON.stringify(t.managerIds))}, ${sqlStr(randomBytes(16).toString('hex'))}) ` +
        `ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, display_name = excluded.display_name, ` +
        `weekday = excluded.weekday, start_time = excluded.start_time, end_time = excluded.end_time, ` +
        `address_id = excluded.address_id, member_group_ids = excluded.member_group_ids, ` +
        `valid_from = excluded.valid_from, valid_until = excluded.valid_until, notes = excluded.notes, ` +
        `manager_ids = excluded.manager_ids`,
    ),
    ...sessionDates.map((date, i) => {
      const cancelled = i === CANCELLED_SESSION.index
      return (
        `INSERT INTO training_sessions (training_id, date, cancelled, note) ` +
        `VALUES (${sqlStr(guided.id)}, ${sqlStr(date)}, ${cancelled ? 1 : 0}, ` +
        `${cancelled ? sqlStr(CANCELLED_SESSION.note) : 'NULL'})`
      )
    }),
    ...GUIDED_ANSWERS.flatMap((answers, i) =>
      Object.entries(answers).map(
        ([playerId, status]) =>
          `INSERT INTO training_availabilities (training_id, date, player_id, status) ` +
          `VALUES (${sqlStr(guided.id)}, ${sqlStr(heldDates[i])}, ${sqlStr(playerId)}, ${sqlStr(status)})`,
      ),
    ),
    // The slot the team declares, which the team screen prints under
    // « Calendrier » — see KICK_OFF.
    `UPDATE teams SET default_day = ${sqlStr(KICK_OFF_DAY)}, default_time = ${sqlStr(KICK_OFF)} ` +
      `WHERE id IN (${['demo-team-1', 'demo-team-2'].map(sqlStr).join(', ')})`,
    // Visits, computed from today — see DEMO_LAST_SEEN. Stored as epoch ms
    // (migration 0039); the API hands the client an ISO string.
    ...Object.entries(DEMO_LAST_SEEN).map(
      ([playerId, daysAgo]) =>
        `UPDATE users SET last_seen_at = ${Date.parse(`${shiftDate(today, -daysAgo)}T19:00:00Z`)} ` +
        `WHERE id = ${sqlStr(playerId)}`,
    ),
    // What the player screens show — see DEMO_PROFILE.
    ...Object.entries(DEMO_PROFILE).flatMap(([playerId, { category, phone }]) => [
      `UPDATE people SET phone = ${sqlStr(phone)} WHERE id = (SELECT person_id FROM users WHERE id = ${sqlStr(playerId)})`,
      // Keyed (season_id, player_id) since 0050 — upserted, so re-running is
      // a no-op rather than a duplicate the PRIMARY KEY would reject.
      `INSERT INTO player_season_categories (season_id, player_id, category) ` +
        `VALUES (${sqlStr(season.id)}, ${sqlStr(playerId)}, ${sqlStr(category)}) ` +
        `ON CONFLICT(season_id, player_id) DO UPDATE SET category = excluded.category`,
    ]),
  ]

  console.log(`Aujourd'hui : ${today}`)
  for (const [journee, date] of Object.entries(dates)) {
    const when = date < today ? 'passée' : 'à venir'
    console.log(`  journée ${journee} → ${date}  (${when})`)
  }
  console.log(
    `  ${DEMO_USER} → ${DEMO_IDENTITY.firstName} ${DEMO_IDENTITY.lastName}, joueur et ` +
      `capitaine de ${DEMO_TEAM}, ${DEMO_IDENTITY.points} points (${team.phase_id})` +
      (roster.includes(DEMO_USER) ? ' (déjà dans l’effectif)' : ', ajouté à l’effectif'),
  )
  const counts = Object.values(DEMO_AVAILABILITY).reduce(
    (acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }),
    /** @type {Record<string, number>} */ ({}),
  )
  const silent = roster.length + (roster.includes(DEMO_USER) ? 0 : 1) -
    Object.keys(DEMO_AVAILABILITY).length
  console.log(
    `  dispos sur ${upcoming.id} → ${counts.available ?? 0} oui, ${counts.maybe ?? 0} ` +
      `peut-être, ${counts.unavailable ?? 0} non, ${silent} sans réponse`,
  )
  console.log(`  composition → ${DEMO_LINEUP.length} joueurs, coup d'envoi ${KICK_OFF}`)
  // Stated, because this is the line that was wrong on two store listings and
  // nobody could see it: the plan has to say what it writes (#598).
  console.log(
    `  journée ${PLAYED_JOURNEE} (${played.id}) → composition de ${DEMO_PLAYED_LINEUP.length} ` +
      `joueurs, tous disponibles`,
  )
  console.log(
    `  créneau déclaré des équipes → ${KICK_OFF_DAY} ${KICK_OFF} ` +
      `(le même que les matchs, sinon la fiche équipe les contredit)`,
  )
  const seen = Object.values(DEMO_LAST_SEEN)
  console.log(
    `  dernières visites → ${seen.length} membres, de ${Math.min(...seen)} ` +
      `à ${Math.max(...seen)} jours (plus personne « Jamais connecté »)`,
  )
  for (const [playerId, { category, phone }] of Object.entries(DEMO_PROFILE)) {
    console.log(`  ${playerId} → catégorie ${category} (saison ${season.id}), ${phone}`)
  }
  const later = laterJournees
    .map((n) => `J${n} ${Object.keys(PHASE_AVAILABILITY[n]).length}`)
    .join(', ')
  console.log(`  reste de la phase → réponses (${later}), sans composition`)
  console.log(
    `  prêt → ${LENT.lineup[0]} aligné par ${LENT.teamId} en journée ${LENT.journee} ` +
      `(${lentGame.gameId}), à la place de ${LENT.absent}, absent`,
  )
  console.log(
    `  ${LENT.teamId}, journée ${PLAYED_JOURNEE} (${team2Played.gameId}) → composition de ` +
      `${TEAM2_PLAYED_LINEUP.length} joueurs, tous disponibles`,
  )
  for (const a of DEMO_ADDRESSES) {
    console.log(`  ${a.clubId} → ${a.label}, ${a.street}, ${a.postalCode} ${a.city}`)
  }
  console.log(
    `  entraînements → ${DEMO_TRAININGS.map((t) => t.displayName).join(' et ')} ; ` +
      `séances dirigées ${sessionDates[0]} → ${sessionDates[sessionDates.length - 1]}, ` +
      `annulée ${sessionDates[CANCELLED_SESSION.index]} (« ${CANCELLED_SESSION.note} »)`,
  )
  if (strayTrainings.length) {
    console.log(
      `  ⚠ supprimés, créés hors de ce script : ` +
        strayTrainings.map((t) => `« ${t.display_name} » (${t.id})`).join(', '),
    )
  }
  console.log(`\n${statements.length} instructions.`)

  if (!apply) {
    console.log('\nRien écrit. Relancez avec --apply pour appliquer.')
    statements.forEach((s) => console.log(`  ${s}`))
    return
  }

  for (const sql of statements) {
    execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--command', sql], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
    })
  }
  console.log('\n✓ Club de démo réancré sur aujourd’hui.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
