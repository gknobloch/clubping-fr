import { Hono } from 'hono'
import type { Env } from './auth'
import {
  compareVersions,
  isUsableVersion,
  parseVersion,
  type StorePlatform,
  type VersionFloor,
} from '../../src/lib/clientVersion'

/**
 * `GET /api/client-version` — the floor the store clients check themselves
 * against (#508).
 *
 * It answers a floor, not a verdict. The server never sees a version and
 * replies "you are out"; it states what it supports, and the client compares.
 * That keeps one endpoint answering the same thing to every caller, cacheable
 * and dull, and it means a client too old to be trusted with a decision is
 * also too old to be asked for one.
 *
 * Both values come from wrangler.toml's [vars], so raising the floor is a
 * one-line change and a deploy — no app release, no store review, which is the
 * entire point. Unset means "no floor": a local server, and any environment
 * nobody has configured, allows everything.
 *
 * `latest` is not the var alone (#708). The var is raised in the release's bump
 * PR, days before either store has approved the build, and advertising it then
 * sent members to a store page with nothing new on it. The var is now a
 * ceiling: what is advertised is the lower of it and what the stores serve
 * (`store_releases`, written hourly by scripts/store-versions.mjs). A store
 * not read yet, or a database that does not answer, advertises nothing for
 * that store — a banner late is a banner that says nothing false.
 *
 * Public (see authGuard): a build below the floor may be exactly the one that
 * cannot sign in, and the check runs at boot, before there is a session to
 * carry. What it reveals is two version numbers already inside every binary.
 */
export const clientVersionApp = new Hono<Env>()

/**
 * Drop a value that no client could parse, and say so in the log.
 *
 * A typo'd floor is the silent-failure case: `versionVerdict` ignores what it
 * cannot read, so "1.3.x" would leave the gate wide open while the var sits
 * there looking set. Better to refuse it here, once, where the line names the
 * variable — nobody is going to notice a blocking screen that never appears.
 */
function floorValue(name: string, value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!isUsableVersion(value)) {
    console.error(`[client-version] ${name} is not a dotted numeric version: ${value} — ignored`)
    return undefined
  }
  return value
}

const PLATFORMS: StorePlatform[] = ['ios', 'android']

/** The lower of two usable versions. */
const lower = (a: string, b: string): string =>
  compareVersions(parseVersion(a)!, parseVersion(b)!) <= 0 ? a : b

/**
 * What each store serves, as the last hourly read found it. Empty when the
 * table holds nothing yet, or the database is absent or fails: unknown is not
 * a version, and this route answers at boot for every build, so it never
 * throws.
 */
async function storeVersions(db: D1Database | undefined): Promise<Partial<Record<StorePlatform, string>>> {
  if (!db) return {}
  try {
    const { results } = await db
      .prepare('SELECT platform, version FROM store_releases')
      .all<{ platform: string; version: string }>()
    const found: Partial<Record<StorePlatform, string>> = {}
    for (const row of results ?? []) {
      if (PLATFORMS.includes(row.platform as StorePlatform) && isUsableVersion(row.version)) {
        found[row.platform as StorePlatform] = row.version
      }
    }
    return found
  } catch (error) {
    console.error(`[client-version] store_releases unreadable — advertising nothing: ${error}`)
    return {}
  }
}

clientVersionApp.get('/', async (c) => {
  const minSupported = floorValue('CLIENT_MIN_VERSION', c.env.CLIENT_MIN_VERSION)
  const ceiling = floorValue('CLIENT_LATEST_VERSION', c.env.CLIENT_LATEST_VERSION)

  const latestByPlatform: Partial<Record<StorePlatform, string>> = {}
  // No ceiling, nothing advertised — the stores are not read at all, so a
  // preview (which sets none) never touches the table.
  if (ceiling) {
    const served = await storeVersions(c.env.DB)
    for (const platform of PLATFORMS) {
      const version = served[platform]
      if (version) latestByPlatform[platform] = lower(ceiling, version)
    }
  }
  // What BOTH serve: the only value builds up to 1.7.0 read, and they cannot
  // tell which store they came from.
  const { ios, android } = latestByPlatform
  const latest = ios && android ? lower(ios, android) : undefined

  const floor: VersionFloor = {
    ...(minSupported ? { minSupported } : {}),
    ...(latest ? { latest } : {}),
    ...(ios || android ? { latestByPlatform } : {}),
  }
  return c.json(floor)
})
