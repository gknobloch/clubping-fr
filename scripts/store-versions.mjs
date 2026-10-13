// ---------------------------------------------------------------------------
// What each store actually serves (#708)
//
// `CLIENT_LATEST_VERSION` is raised in the release's bump PR, so it went live
// on the deploy that followed — before EAS had built anything, and days before
// Apple and Google had approved it. Every member saw "une mise à jour est
// disponible", pressed it, and found the version they already had.
//
// So the server no longer advertises a version on the var's word alone: it
// advertises the lower of the var and what the stores publish. This script is
// the "what the stores publish" half. It reads both, and writes one row per
// platform into `store_releases`, which `GET /api/client-version` reads.
//
//   App Store  The public lookup — no credential, and it answers the version
//              on the product page. It lags a release by a few hours (Apple
//              caches it), which is the harmless direction.
//   Play       No public endpoint. The Play Developer API, with the service
//              account EAS Submit already uses: the most public track that
//              holds a release (see PUBLIC_TRACKS). Only a `completed` release
//              counts: a staged rollout cannot be installed by anyone outside
//              its fraction, even by hand.
//
// A store that cannot be read is NOT written: the last known row stays, and the
// script exits non-zero so the run is red. Unknown never becomes a version.
//
// Run by .github/workflows/store-versions.yml every hour. By hand it prints
// what it read and writes nothing without --apply.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DB = 'clubping-fr-prod'

/** Both stores list the app under this id (mobile/app.json). */
export const APP_ID = 'fr.clubping.app'

// The same grammar as src/lib/clientVersion.ts: dotted digits, at most four
// parts. A value outside it is never written — the worker would drop it anyway,
// and SQL is built from it below.
const DOTTED = /^\d+(?:\.\d+){0,3}$/

export const isDotted = (value) => typeof value === 'string' && DOTTED.test(value)

const parts = (v) => v.split('.').map(Number)

/** -1, 0 or 1, missing trailing parts counting as 0 — compareVersions' rule. */
export function compareDotted(a, b) {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/** The version the App Store lookup answers, or null when it names none. */
export function appStoreVersion(lookup) {
  const version = lookup?.results?.[0]?.version
  return isDotted(version) ? version : null
}

/**
 * The version a Play release is named for.
 *
 * Play names a release after its bundle's versionName when the uploader sets
 * no name ("1.7.0"); the console's own default is "<versionCode> (1.7.0)". The
 * dotted part is the version either way — a bare versionCode has no dot, so it
 * cannot be mistaken for one.
 */
export function releaseVersion(name) {
  const match = typeof name === 'string' ? name.match(/\d+(?:\.\d+){1,3}/) : null
  return match ? match[0] : null
}

/**
 * The tracks members can install from, most public first. `internal` is not
 * one: it is the release crew's track, where every build lands before anyone
 * else sees it (eas.json submits there).
 *
 * The app went out on closed testing (`alpha`) and production had no release
 * at all when this was written — so "production" alone read as "nothing
 * published" and the banner never showed on Android. Reading the most public
 * track that holds a release is right on both days: it is closed testing now,
 * and production by itself the day its first release is rolled out.
 */
export const PUBLIC_TRACKS = ['production', 'beta', 'alpha']

/** The newest version a track serves to EVERYONE on it, or null. */
export function trackVersion(track) {
  // During a staged rollout a track holds two releases: the previous one,
  // `completed`, and the new one, `inProgress` with a `userFraction`. Only the
  // first is installable by every member — the others get "no update" from the
  // store however often they press the banner.
  const versions = (track?.releases ?? [])
    .filter((r) => r.status === 'completed')
    .map((r) => releaseVersion(r.name))
    .filter(isDotted)
  if (versions.length === 0) return null
  return versions.reduce((a, b) => (compareDotted(a, b) >= 0 ? a : b))
}

/** What Play serves members: the most public track that has a version. */
export function playPublicVersion(listing) {
  const tracks = listing?.tracks ?? []
  for (const name of PUBLIC_TRACKS) {
    const version = trackVersion(tracks.find((t) => t.track === name))
    if (version) return { track: name, version }
  }
  return null
}

/** One upsert per platform read. Values are checked here, not trusted. */
export function upsertSql(found, checkedAt) {
  const rows = Object.entries(found).filter(([, v]) => isDotted(v))
  if (rows.length === 0) return null
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(checkedAt)) throw new Error(`bad timestamp: ${checkedAt}`)
  const values = rows.map(([platform, v]) => {
    if (platform !== 'ios' && platform !== 'android') throw new Error(`unknown platform: ${platform}`)
    return `('${platform}', '${v}', '${checkedAt}')`
  })
  return (
    'INSERT INTO store_releases (platform, version, checked_at) VALUES ' +
    values.join(', ') +
    ' ON CONFLICT(platform) DO UPDATE SET version = excluded.version, checked_at = excluded.checked_at'
  )
}

// --- Reading the stores ----------------------------------------------------

async function readAppStore() {
  // country=fr: the lookup answers per storefront, and this app is French.
  const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${APP_ID}&country=fr`)
  if (!res.ok) throw new Error(`App Store lookup answered ${res.status}`)
  const version = appStoreVersion(await res.json())
  if (!version) throw new Error('App Store lookup named no version')
  return version
}

const base64url = (data) => Buffer.from(data).toString('base64url')

/** An OAuth access token for the service account, by the JWT-bearer grant. */
async function googleAccessToken(key) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: key.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    }),
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
  const res = await fetch(key.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    // Google's own words: they name the account and what it lacks.
    throw new Error(`Google token refused (${res.status}): ${body.error_description ?? body.error ?? 'no body'}`)
  }
  return body.access_token
}

/**
 * The service account: the CI secret's JSON, or the file EAS Submit and
 * fastlane already read on a release machine.
 */
function playKey() {
  const fromEnv = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT
  if (fromEnv) return JSON.parse(fromEnv)
  const file = path.join(ROOT, 'mobile', 'google-play-service-account.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  throw new Error('no Play service account (GOOGLE_PLAY_SERVICE_ACCOUNT, or mobile/google-play-service-account.json)')
}

async function readPlay() {
  const token = await googleAccessToken(playKey())
  const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/edits`
  const call = async (url, method = 'GET') => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
    const body = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Play answered ${res.status} to ${method} ${url}: ${body?.error?.message ?? ''}`)
    return body
  }
  // Tracks are only readable inside an edit. Nothing is changed in it, and it
  // is deleted rather than committed: an edit left open blocks nothing, but it
  // is somebody else's console state.
  const edit = await call(api, 'POST')
  try {
    const found = playPublicVersion(await call(`${api}/${edit.id}/tracks`))
    if (!found) throw new Error(`no completed release with a version name on ${PUBLIC_TRACKS.join(', ')}`)
    console.log(`  (Play track: ${found.track})`)
    return found.version
  } finally {
    await call(`${api}/${edit.id}`, 'DELETE').catch(() => {})
  }
}

// --- Main ------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes('--apply')
  const found = {}
  const failures = []
  for (const [platform, read] of [
    ['ios', readAppStore],
    ['android', readPlay],
  ]) {
    try {
      found[platform] = await read()
      console.log(`✔ ${platform}: ${found[platform]}`)
    } catch (error) {
      failures.push(platform)
      console.error(`✘ ${platform}: ${error.message} — its last known row is kept`)
    }
  }

  const sql = upsertSql(found, new Date().toISOString())
  if (!sql) {
    console.error('Nothing read, nothing written.')
  } else if (!apply) {
    console.log(`\nWould run on ${DB}:\n  ${sql}\n\nNothing written — pass --apply.`)
  } else {
    execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--command', sql], {
      cwd: ROOT,
      stdio: 'inherit',
    })
  }
  if (failures.length > 0) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
