import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  pngDimensions,
  isPlausibleScreenshot,
  missingRequiredScreens,
  screensFor,
  REQUIRED_SCREENS,
} from './store-screenshots.mjs'

// ---------------------------------------------------------------------------
// Store screenshots (#520)
//
// The capture itself — Xcode, an Android emulator, Maestro — is proven by
// running it, not by a unit test standing in for a simulator. What is tested
// here is the part that decides whether a run's OUTPUT is trustworthy: a real
// PNG's dimensions read correctly, and a screen missing from the set is
// noticed rather than silently shipped.
// ---------------------------------------------------------------------------

/** A minimal valid PNG signature + IHDR for the given size, no image data —
 *  pngDimensions only ever reads the first 24 bytes. */
function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0) // signature
  buf.writeUInt32BE(13, 8) // IHDR chunk length
  buf.write('IHDR', 12)
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

describe('pngDimensions', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngDimensions(pngHeader(1320, 2868))).toEqual({ width: 1320, height: 2868 })
  })

  it('refuses anything that does not start with the PNG signature', () => {
    expect(() => pngDimensions(Buffer.from('not a png at all, just text'))).toThrow('not a PNG')
  })

  it('refuses a buffer too short to hold IHDR', () => {
    expect(() => pngDimensions(pngHeader(100, 100).subarray(0, 10))).toThrow()
  })
})

describe('isPlausibleScreenshot', () => {
  it('accepts a portrait phone-shaped image', () => {
    expect(isPlausibleScreenshot({ width: 1320, height: 2868 })).toBe(true)
  })

  it('accepts a portrait tablet-shaped image', () => {
    expect(isPlausibleScreenshot({ width: 2064, height: 2752 })).toBe(true)
  })

  it('rejects landscape where portrait was asked for', () => {
    expect(isPlausibleScreenshot({ width: 2868, height: 1320 })).toBe(false)
  })

  it('accepts landscape where landscape was asked for — the iPad set', () => {
    expect(isPlausibleScreenshot({ width: 2752, height: 2064 }, 'LANDSCAPE_LEFT')).toBe(true)
  })

  it('rejects portrait where landscape was asked for', () => {
    // A simulator remembers how it was last left. A target that asked to be
    // turned sideways and came back upright has shot a whole set in the wrong
    // shape, and that has to be loud rather than merely allowed.
    expect(isPlausibleScreenshot({ width: 2064, height: 2752 }, 'LANDSCAPE_LEFT')).toBe(false)
  })

  it('rejects a thumbnail-sized capture — a flow that grabbed the wrong element', () => {
    expect(isPlausibleScreenshot({ width: 120, height: 200 })).toBe(false)
  })
})

describe('missingRequiredScreens', () => {
  it('is empty when every required screen is present', () => {
    expect(missingRequiredScreens(REQUIRED_SCREENS)).toEqual([])
  })

  it('names exactly what a partial run is missing', () => {
    const partial = REQUIRED_SCREENS.filter((s: string) => s !== '02-composition')
    expect(missingRequiredScreens(partial)).toEqual(['02-composition'])
  })

  it('expects the whole set, in order', () => {
    // The numbers are the listing's order on the store page, so a gap is a
    // reordering nobody asked for.
    expect(REQUIRED_SCREENS).toHaveLength(8)
    expect(REQUIRED_SCREENS.map((s: string) => s.slice(0, 2))).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08',
    ])
  })

  it('reports everything missing from an empty capture', () => {
    expect(missingRequiredScreens([])).toEqual(REQUIRED_SCREENS)
  })
})

describe('screensFor', () => {
  it('keeps every screen for a target that drops none', () => {
    expect(screensFor({ id: 'iphone' })).toEqual(REQUIRED_SCREENS)
  })

  it('drops what a target names, and renumbers nothing', () => {
    // The gap is the point: 05-equipe must be the same screen in every set,
    // so an omission reads as an omission rather than a reshuffle.
    const set = screensFor({ id: 'ipad', dropScreens: ['04-equipes'] })
    expect(set).not.toContain('04-equipes')
    expect(set).toEqual(REQUIRED_SCREENS.filter((s: string) => s !== '04-equipes'))
  })

  it('measures a run against that target’s set, not the full one', () => {
    const set = screensFor({ id: 'ipad', dropScreens: ['04-equipes'] })
    expect(missingRequiredScreens(set, set)).toEqual([])
    // …while the same capture is short one screen for a target that wants it.
    expect(missingRequiredScreens(set)).toEqual(['04-equipes'])
  })
})
