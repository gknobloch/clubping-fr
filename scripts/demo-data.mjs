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
/** The team it captains — the one whose next match the Accueil screen shows. */
export const DEMO_TEAM = 'demo-team-1'

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
    `SELECT id, captain_id, player_ids FROM teams WHERE id = ${sqlStr(DEMO_TEAM)}`,
  )[0]
  if (!team) throw new Error(`${DEMO_TEAM} introuvable.`)

  assertDemoOnly([
    ...games.map((g) => g.id),
    ...matchDays.map((m) => m.id),
    team.id,
    DEMO_USER,
  ])

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
          `UPDATE games SET date = ${sqlStr(dates[g.journee])}, time = '20h00' WHERE id = ${sqlStr(g.id)}`,
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
  ]

  console.log(`Aujourd'hui : ${today}`)
  for (const [journee, date] of Object.entries(dates)) {
    const when = date < today ? 'passée' : 'à venir'
    console.log(`  journée ${journee} → ${date}  (${when})`)
  }
  console.log(
    `  ${DEMO_USER} → capitaine de ${DEMO_TEAM}` +
      (roster.includes(DEMO_USER) ? ' (déjà dans l’effectif)' : ', ajouté à l’effectif'),
  )
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
