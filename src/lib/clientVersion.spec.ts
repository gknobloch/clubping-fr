import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  isUsableVersion,
  parseVersion,
  versionVerdict,
} from './clientVersion'

describe('parseVersion (#508)', () => {
  it('reads a dotted numeric version', () => {
    expect(parseVersion('1.3.0')).toEqual([1, 3, 0])
    expect(parseVersion('2')).toEqual([2])
    expect(parseVersion(' 1.3.0 ')).toEqual([1, 3, 0])
    expect(parseVersion('10.0.12')).toEqual([10, 0, 12])
  })

  // Every one of these has to come back null rather than guessed at: an
  // unparseable version is ignored and the build is allowed through, while a
  // wrong guess would lock somebody out of the app.
  it('refuses anything it would have to interpret', () => {
    for (const value of ['', 'v1.3.0', '1.3.0-beta.1', '1.3.x', '1..3', '1.3.0.0.1', 'latest']) {
      expect(parseVersion(value)).toBeNull()
    }
  })

  it('refuses an absent version', () => {
    expect(parseVersion(undefined)).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })

  it('is what isUsableVersion reports, so the server drops exactly what clients ignore', () => {
    expect(isUsableVersion('1.3.0')).toBe(true)
    expect(isUsableVersion('1.3.x')).toBe(false)
  })
})

describe('compareVersions (#508)', () => {
  it('orders by each part in turn', () => {
    expect(compareVersions([1, 3, 0], [1, 4, 0])).toBe(-1)
    expect(compareVersions([2, 0, 0], [1, 9, 9])).toBe(1)
    expect(compareVersions([1, 3, 1], [1, 3, 0])).toBe(1)
  })

  // "1.3" typed into wrangler.toml must mean the same as app.json's "1.3.0",
  // or a floor set by hand quietly excludes the build it was meant to admit.
  it('treats a missing trailing part as zero', () => {
    expect(compareVersions([1, 3], [1, 3, 0])).toBe(0)
    expect(compareVersions([1, 3], [1, 3, 1])).toBe(-1)
  })

  it('compares numerically, not as text', () => {
    expect(compareVersions([1, 10, 0], [1, 9, 0])).toBe(1)
  })
})

describe('versionVerdict — the floor (#508)', () => {
  it('blocks a build below the minimum', () => {
    expect(versionVerdict('1.2.0', { minSupported: '1.3.0' })).toBe('unsupported')
  })

  it('admits the minimum itself', () => {
    expect(versionVerdict('1.3.0', { minSupported: '1.3.0' })).toBe('ok')
  })

  it('nudges a build behind the latest', () => {
    expect(versionVerdict('1.2.0', { latest: '1.3.0' })).toBe('update-available')
  })

  it('says nothing to a build at or beyond the latest', () => {
    expect(versionVerdict('1.3.0', { latest: '1.3.0' })).toBe('ok')
    // A TestFlight build ahead of what is published must not be told to
    // downgrade.
    expect(versionVerdict('1.4.0', { latest: '1.3.0' })).toBe('ok')
  })

  // Being refused is the stronger statement; hearing "a newer one exists"
  // instead would send someone to the store expecting a nicety.
  it('prefers unsupported when both apply', () => {
    expect(versionVerdict('1.0.0', { minSupported: '1.2.0', latest: '1.3.0' })).toBe('unsupported')
  })

  it('reads the two halves independently', () => {
    // A typo'd `latest` must not cost us a `minSupported` that reads fine…
    expect(versionVerdict('1.0.0', { minSupported: '1.2.0', latest: 'nonsense' })).toBe(
      'unsupported',
    )
    // …nor the other way round.
    expect(versionVerdict('1.0.0', { minSupported: 'nonsense', latest: '1.3.0' })).toBe(
      'update-available',
    )
  })
})

// The rule the whole feature rests on: silence never blocks anyone. A gymnasium
// basement has no signal (#387), and that is exactly where the app is opened.
describe('versionVerdict — failing open (#508)', () => {
  for (const [label, floor] of [
    ['no floor was received', null],
    ['the floor is undefined', undefined],
    ['the floor is empty', {}],
    ['both values are unparseable', { minSupported: 'x', latest: 'y' }],
  ] as const) {
    it(`allows the build when ${label}`, () => {
      expect(versionVerdict('1.3.0', floor)).toBe('ok')
    })
  }

  it('allows a build whose own version it cannot read', () => {
    expect(versionVerdict(undefined, { minSupported: '9.0.0' })).toBe('ok')
    expect(versionVerdict('', { minSupported: '9.0.0' })).toBe('ok')
    expect(versionVerdict('dev', { minSupported: '9.0.0' })).toBe('ok')
  })
})
