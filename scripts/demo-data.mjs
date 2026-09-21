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
// one this coming week, one a fortnight out — recomputed from today's date
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
 * What screens 06 and 07 say about Camille Durand beyond her name.
 *
 * Her quick view and her full profile are two of the eight store screenshots,
 * and an empty fiche does not demonstrate a fiche. The category is the field
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
 *   counts. Her badge is the subject of two of the eight screenshots, and
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

// ---------------------------------------------------------------------------
// Pure — the offsets, which are the actual subject
// ---------------------------------------------------------------------------

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
 * it so the season has a past, one ahead so it has a future.
 */
export function journeeDates(today) {
  const j2 = nextSaturday(today)
  return { 1: shiftDate(j2, -14), 2: j2, 3: shiftDate(j2, 14) }
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
  const today = new Date().toISOString().slice(0, 10)
  const dates = journeeDates(today)

  const games = query(
    `SELECT g.id, g.match_day_id, md.number AS journee
       FROM games g JOIN match_days md ON md.id = g.match_day_id
      WHERE g.id LIKE 'demo-%'`,
  )
  const matchDays = query("SELECT id, number FROM match_days WHERE id LIKE 'demo-%'")
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
    ...games.map((g) => g.id),
    ...matchDays.map((m) => m.id),
    ...Object.keys(DEMO_AVAILABILITY),
    ...Object.keys(DEMO_PROFILE),
    ...Object.keys(DEMO_LAST_SEEN),
    ...DEMO_LINEUP,
    ...DEMO_PLAYED_LINEUP,
    team.id,
    DEMO_USER,
  ])

  // The demo-team-1 fixture in the upcoming journée — the one the hero card
  // shows, and so the only one whose availabilities are worth arranging.
  const upcoming = games.find(
    (g) => g.journee === UPCOMING_JOURNEE && g.id.startsWith('demo-g-1-'),
  )
  if (!upcoming) throw new Error(`Aucun match de ${DEMO_TEAM} en journée ${UPCOMING_JOURNEE}.`)

  const played = games.find(
    (g) => g.journee === PLAYED_JOURNEE && g.id.startsWith('demo-g-1-'),
  )
  if (!played) throw new Error(`Aucun match de ${DEMO_TEAM} en journée ${PLAYED_JOURNEE}.`)

  const roster = JSON.parse(team.player_ids)
  const newRoster = roster.includes(DEMO_USER) ? roster : [...roster, DEMO_USER]

  const statements = [
    ...matchDays
      .filter((m) => dates[m.number])
      .map((m) => `UPDATE match_days SET date = ${sqlStr(dates[m.number])} WHERE id = ${sqlStr(m.id)}`),
    ...games
      .filter((g) => dates[g.journee])
      .map(
        (g) =>
          `UPDATE games SET date = ${sqlStr(dates[g.journee])}, time = ${sqlStr(KICK_OFF)} WHERE id = ${sqlStr(g.id)}`,
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
    // A name, not a label — see DEMO_IDENTITY.
    `UPDATE users SET first_name = ${sqlStr(DEMO_IDENTITY.firstName)}, ` +
      `last_name = ${sqlStr(DEMO_IDENTITY.lastName)}, ` +
      `license_number = ${sqlStr(DEMO_IDENTITY.licenseNumber)} ` +
      `WHERE id = ${sqlStr(DEMO_USER)}`,
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
      `UPDATE users SET phone = ${sqlStr(phone)} WHERE id = ${sqlStr(playerId)}`,
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
