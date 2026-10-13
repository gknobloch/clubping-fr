import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  appStoreVersion,
  releaseVersion,
  trackVersion,
  playPublicVersion,
  upsertSql,
  compareDotted,
} from './store-versions.mjs'

// ---------------------------------------------------------------------------
// What each store serves (#708)
//
// The rows this writes decide whether every member sees "une mise à jour est
// disponible". What matters is the direction of every doubt: a staged rollout,
// a track with nothing on it, a name that is not a version — each must read
// as "not served", never as a version somebody cannot install.
// ---------------------------------------------------------------------------

describe('appStoreVersion', () => {
  it('reads the version off the lookup', () => {
    expect(appStoreVersion({ resultCount: 1, results: [{ version: '1.7.0' }] })).toBe('1.7.0')
  })

  it('names nothing for an app the lookup does not list', () => {
    expect(appStoreVersion({ resultCount: 0, results: [] })).toBeNull()
  })

  it('refuses what is not a dotted version', () => {
    expect(appStoreVersion({ results: [{ version: '1.8.0-beta' }] })).toBeNull()
  })
})

describe('releaseVersion', () => {
  it('reads the name Play gives an unnamed upload', () => {
    expect(releaseVersion('1.7.0')).toBe('1.7.0')
  })

  it("reads the console's own default", () => {
    expect(releaseVersion('18 (1.7.0)')).toBe('1.7.0')
  })

  it('never takes a bare versionCode for a version', () => {
    expect(releaseVersion('18')).toBeNull()
    expect(releaseVersion(undefined)).toBeNull()
  })
})

describe('trackVersion', () => {
  it('ignores a staged rollout, which most members cannot install', () => {
    expect(
      trackVersion({
        releases: [
          { name: '1.7.0', status: 'completed' },
          { name: '1.8.0', status: 'inProgress', userFraction: 0.2 },
        ],
      }),
    ).toBe('1.7.0')
  })

  it('ignores drafts and halted releases', () => {
    expect(
      trackVersion({
        releases: [
          { name: '1.8.0', status: 'draft' },
          { name: '1.8.0', status: 'halted' },
        ],
      }),
    ).toBeNull()
  })

  it('takes the newest completed release', () => {
    expect(
      trackVersion({
        releases: [
          { name: '1.7.0', status: 'completed' },
          { name: '1.10.0', status: 'completed' },
        ],
      }),
    ).toBe('1.10.0')
  })
})

describe('playPublicVersion', () => {
  // What the API answered for fr.clubping.app on 13 October 2026.
  const today = {
    tracks: [
      { track: 'production' },
      { track: 'beta' },
      { track: 'alpha', releases: [{ name: '1.7.0', status: 'completed', versionCodes: ['18'] }] },
      { track: 'internal', releases: [{ name: '1.7.0', status: 'completed', versionCodes: ['18'] }] },
    ],
  }

  it('reads closed testing while production holds nothing', () => {
    expect(playPublicVersion(today)).toEqual({ track: 'alpha', version: '1.7.0' })
  })

  it('reads production once it has a release, whatever testing is ahead', () => {
    const live = {
      tracks: [
        { track: 'production', releases: [{ name: '1.7.0', status: 'completed' }] },
        { track: 'alpha', releases: [{ name: '1.8.0', status: 'completed' }] },
      ],
    }
    expect(playPublicVersion(live)).toEqual({ track: 'production', version: '1.7.0' })
  })

  // Every build lands there first: reading it would advertise each build the
  // moment EAS uploads it, which is the bug this replaces.
  it('never reads the internal track', () => {
    const onlyInternal = { tracks: [{ track: 'internal', releases: [{ name: '1.8.0', status: 'completed' }] }] }
    expect(playPublicVersion(onlyInternal)).toBeNull()
  })
})

describe('upsertSql', () => {
  const at = '2026-10-13T04:38:29.088Z'

  it('writes one row per store read', () => {
    expect(upsertSql({ ios: '1.7.0', android: '1.7.0' }, at)).toBe(
      "INSERT INTO store_releases (platform, version, checked_at) VALUES ('ios', '1.7.0', '2026-10-13T04:38:29.088Z'), ('android', '1.7.0', '2026-10-13T04:38:29.088Z') ON CONFLICT(platform) DO UPDATE SET version = excluded.version, checked_at = excluded.checked_at",
    )
  })

  // A store that failed keeps its last known row.
  it('leaves out the store it could not read', () => {
    expect(upsertSql({ ios: '1.7.0' }, at)).not.toContain('android')
  })

  it('writes nothing when nothing was read', () => {
    expect(upsertSql({}, at)).toBeNull()
  })

  // The SQL is built from these values, so nothing else gets through.
  it('never builds SQL from anything but a dotted version', () => {
    expect(upsertSql({ ios: "1.7.0'); DROP TABLE users; --" }, at)).toBeNull()
    expect(() => upsertSql({ web: '1.7.0' }, at)).toThrow()
    expect(() => upsertSql({ ios: '1.7.0' }, "now'")).toThrow()
  })
})

describe('compareDotted', () => {
  it('orders like compareVersions, missing parts as 0', () => {
    expect(compareDotted('1.10.0', '1.9.0')).toBe(1)
    expect(compareDotted('1.7', '1.7.0')).toBe(0)
  })
})
