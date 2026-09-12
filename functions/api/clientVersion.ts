import { Hono } from 'hono'
import type { Env } from './auth'
import { isUsableVersion, type VersionFloor } from '../../src/lib/clientVersion'

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

clientVersionApp.get('/', (c) => {
  const minSupported = floorValue('CLIENT_MIN_VERSION', c.env.CLIENT_MIN_VERSION)
  const latest = floorValue('CLIENT_LATEST_VERSION', c.env.CLIENT_LATEST_VERSION)
  const floor: VersionFloor = {
    ...(minSupported ? { minSupported } : {}),
    ...(latest ? { latest } : {}),
  }
  return c.json(floor)
})
