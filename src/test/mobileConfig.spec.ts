import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compareVersions, parseVersion } from '@/lib/clientVersion'

// #497 — nothing else in CI reads mobile/app.json.
//
// `build`, `lint` and both test suites walk straight past it, and so does every
// type checker: it is data, consumed only by `expo prebuild`, which CI never
// runs. A mistake in it therefore merges green and surfaces as a native binary
// that installs, launches, asks for permission and then quietly does nothing —
// which is precisely how #495 spent an evening being debugged from the wrong
// end, twice.
//
// These are the checks a human cannot make reliably by eye: that the paths
// point at files that exist, and that the Android package agrees with itself
// across two files written by two different tools.

const MOBILE = resolve(process.cwd(), 'mobile')
const app = JSON.parse(readFileSync(resolve(MOBILE, 'app.json'), 'utf8')).expo as {
  version?: string
  android?: { package?: string; googleServicesFile?: string }
  plugins?: unknown[]
}

/** Every "./…" string anywhere in the config — assets, plugins, key files. */
function referencedPaths(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (node.startsWith('./')) out.push(node)
  } else if (Array.isArray(node)) {
    for (const child of node) referencedPaths(child, out)
  } else if (node && typeof node === 'object') {
    for (const child of Object.values(node)) referencedPaths(child, out)
  }
  return out
}

/** A local config plugin is written without its extension. */
const resolves = (relative: string) => {
  const path = resolve(MOBILE, relative)
  return existsSync(path) || existsSync(`${path}.js`) || existsSync(`${path}.ts`)
}

const usesPlugin = (name: string) =>
  (app.plugins ?? []).some((p) => (Array.isArray(p) ? p[0] : p) === name)

describe('mobile/app.json — every path it names exists (#497)', () => {
  const paths = referencedPaths(app)

  it('names at least the icons, so the walk is actually walking', () => {
    expect(paths).toContain('./assets/icon.png')
  })

  it.each(paths)('%s exists', (relative) => {
    expect(resolves(relative)).toBe(true)
  })
})

describe('mobile/app.json — Android push is wired or absent (#497)', () => {
  it('declares googleServicesFile whenever expo-notifications is used', () => {
    // Android has no FCM sender configuration without it, so the device never
    // obtains a token. iOS is unaffected, which is what makes the half-working
    // build easy to ship: it works on the phone in your hand.
    if (!usesPlugin('expo-notifications')) return
    expect(app.android?.googleServicesFile).toBeTruthy()
  })

  it('agrees with google-services.json about the package name', () => {
    // Firebase asks for the package by hand, and reverse-DNS invites exactly
    // one typo: app.clubping.fr for fr.clubping.app. FCM routes on this, so a
    // mismatch registers the app under an identity nothing can reach — with no
    // error on either side.
    const relative = app.android?.googleServicesFile
    if (!relative) return
    const services = JSON.parse(readFileSync(resolve(MOBILE, relative), 'utf8')) as {
      client?: { client_info: { android_client_info: { package_name: string } } }[]
    }
    const packages = (services.client ?? []).map(
      (c) => c.client_info.android_client_info.package_name,
    )
    expect(packages).toContain(app.android?.package)
  })
})

// ---------------------------------------------------------------------------
// The version floor against the version that exists (#508)
//
// Same failure shape as the rest of this file: nothing in CI compares
// wrangler.toml to app.json, so a floor naming a version nobody can install
// merges green and is only visible on a member's phone — as a nag with no
// cure, or, for CLIENT_MIN_VERSION, as a wall in front of everybody including
// whoever is holding the newest build.
//
// Only "ahead of app.json" is an error. Trailing behind is the normal state:
// the bump PR merges before EAS has built anything, and a stale
// CLIENT_LATEST_VERSION simply stops nudging, which costs nothing.
// ---------------------------------------------------------------------------
describe('wrangler.toml — the floor never outruns the app (#508)', () => {
  const toml = readFileSync(resolve(process.cwd(), 'wrangler.toml'), 'utf8')

  /** A [vars] assignment, or undefined when the line is absent or commented. */
  const varValue = (name: string): string | undefined =>
    new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(toml)?.[1]

  const shipped = parseVersion(app.version)
  const latest = varValue('CLIENT_LATEST_VERSION')
  const min = varValue('CLIENT_MIN_VERSION')

  it('knows what version the app declares', () => {
    expect(shipped).not.toBeNull()
  })

  it('never advertises a version that does not exist yet', () => {
    if (!latest) return
    expect(parseVersion(latest)).not.toBeNull()
    expect(compareVersions(parseVersion(latest)!, shipped!)).toBeLessThanOrEqual(0)
  })

  // The one that locks everybody out, newest build included.
  it('never refuses every build there is', () => {
    if (!min) return
    expect(parseVersion(min)).not.toBeNull()
    expect(compareVersions(parseVersion(min)!, shipped!)).toBeLessThanOrEqual(0)
  })

  it('never demands a minimum above the version it points people at', () => {
    if (!min || !latest) return
    expect(compareVersions(parseVersion(min)!, parseVersion(latest)!)).toBeLessThanOrEqual(0)
  })
})
