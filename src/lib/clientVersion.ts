/**
 * Is this build still allowed to talk to the server, and is there anything
 * newer? (#508)
 *
 * The server publishes a **floor**, never a verdict: two version strings, and
 * the client decides what they mean for it. That is what lets the floor be
 * raised without publishing anything — and it keeps this rule testable as what
 * it is, three strings and no network.
 *
 * Everything here fails OPEN. A version it cannot parse, a floor it never
 * received, a floor with nothing in it: all of them mean `ok`. The whole app is
 * built for a gymnasium basement with no signal (#387), so a check that treated
 * silence as a refusal would lock people out of the one screen they came for.
 * Blocking is something the server has to say, explicitly and parseably.
 */

/**
 * - `ok` — nothing to say.
 * - `update-available` — a newer build exists. Dismissible; the app works.
 * - `unsupported` — below the floor. The app stops here and points at the store.
 */
export type ClientVersionVerdict = 'ok' | 'update-available' | 'unsupported'

/** What `GET /api/client-version` answers. Both halves are optional. */
export interface VersionFloor {
  /** Builds below this are refused. Absent = refuse nothing. */
  minSupported?: string
  /** The newest published build. Absent = advertise nothing. */
  latest?: string
}

// Dotted digits, nothing else: "1.3.0", "1.3", "2". A pre-release suffix
// ("1.4.0-beta.1") is deliberately NOT accepted — ordering it would mean
// picking a convention, and picking one wrong here blocks people. Unparseable
// is a safe answer; wrongly ordered is not.
const NUMERIC = /^\d+$/
const MAX_PARTS = 4

/** The version as comparable numbers, or null when it is not one. */
export function parseVersion(value: string | null | undefined): number[] | null {
  if (!value) return null
  const parts = value.trim().split('.')
  if (parts.length > MAX_PARTS) return null
  if (!parts.every((p) => NUMERIC.test(p))) return null
  return parts.map(Number)
}

/**
 * -1, 0 or 1. Missing trailing parts count as 0, so "1.3" and "1.3.0" are the
 * same version — app.json writes three parts, a hand-typed floor may not.
 */
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/** Whether a floor value is usable at all — the server drops the ones that aren't. */
export const isUsableVersion = (value: string | null | undefined): boolean =>
  parseVersion(value) !== null

/**
 * What `current` should do about `floor`.
 *
 * The two halves are read independently: an unparseable `latest` must not cost
 * us a `minSupported` that reads fine, and vice versa. `unsupported` wins when
 * both would apply — being below the floor is the stronger statement.
 */
export function versionVerdict(
  current: string | null | undefined,
  floor: VersionFloor | null | undefined,
): ClientVersionVerdict {
  const now = parseVersion(current)
  if (!now || !floor) return 'ok'

  const min = parseVersion(floor.minSupported)
  if (min && compareVersions(now, min) < 0) return 'unsupported'

  const latest = parseVersion(floor.latest)
  if (latest && compareVersions(now, latest) < 0) return 'update-available'

  return 'ok'
}
