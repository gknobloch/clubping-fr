import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  pngDimensions,
  isPlausibleScreenshot,
  missingRequiredScreens,
  screensFor,
  javaMajorFromRelease,
  gradleInstallationPaths,
  parseDevVars,
  withGradleMemory,
  androidPackage,
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
    const dropScreens = ['04-equipes', '06-joueur-apercu']
    const set = screensFor({ id: 'ipad', dropScreens })
    expect(set).toEqual(REQUIRED_SCREENS.filter((s: string) => !dropScreens.includes(s)))
    expect(set[set.length - 1]).toBe('08-journees')
  })

  it('measures a run against that target’s set, not the full one', () => {
    const set = screensFor({ id: 'ipad', dropScreens: ['04-equipes', '06-joueur-apercu'] })
    expect(missingRequiredScreens(set, set)).toEqual([])
    // …while the same capture is short two screens for a target that wants
    // them, which is what stops a tablet run from passing as a phone one.
    expect(missingRequiredScreens(set)).toEqual(['04-equipes', '06-joueur-apercu'])
  })
})

describe('finding the JDK the Android build needs', () => {
  // With no JDK 17 in sight Gradle tries to DOWNLOAD one, and the foojay
  // resolver React Native pins at 0.5.0 dies on a field Gradle 9 removed. The
  // operator gets "NoSuchFieldError: … IBM_SEMERU", which names neither Java
  // nor a version. Hence a check that runs before the build, not after it.

  it('reads a modern JDK’s major version', () => {
    expect(javaMajorFromRelease('JAVA_VERSION="17.0.20.1"\nOS_ARCH="aarch64"')).toBe(17)
    expect(javaMajorFromRelease('JAVA_VERSION="21.0.12"')).toBe(21)
  })

  it('reads Java 8, which states itself as 1.8', () => {
    expect(javaMajorFromRelease('JAVA_VERSION="1.8.0_292"')).toBe(8)
  })

  it('says nothing rather than guessing', () => {
    expect(javaMajorFromRelease('')).toBeNull()
    expect(javaMajorFromRelease('OS_NAME="Darwin"')).toBeNull()
  })

  it('lists the installations gradle.properties names', () => {
    // Homebrew's openjdk@17 is keg-only: it lands nowhere Gradle looks by
    // itself, so this line is the whole reason the build can find it.
    const props = [
      '# a comment',
      'org.gradle.jvmargs=-Xmx2g',
      'org.gradle.java.installations.paths=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home, /other',
    ].join('\n')
    expect(gradleInstallationPaths(props)).toEqual([
      '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
      '/other',
    ])
  })

  it('is empty when nothing names one', () => {
    expect(gradleInstallationPaths('org.gradle.jvmargs=-Xmx2g')).toEqual([])
    expect(gradleInstallationPaths('')).toEqual([])
  })
})

describe('reading the review credentials out of .dev.vars', () => {
  // Not a new place to keep a secret — the one that already exists. The two
  // are Cloudflare Pages secrets, so `wrangler pages dev` reads them from this
  // very file, and it is gitignored.

  it('reads plain and quoted values', () => {
    expect(parseDevVars('REVIEW_LOGIN_EMAIL=a@b.fr\nREVIEW_LOGIN_CODE="123456"')).toEqual({
      REVIEW_LOGIN_EMAIL: 'a@b.fr',
      REVIEW_LOGIN_CODE: '123456',
    })
  })

  it('splits on the first = only, so a value may contain one', () => {
    expect(parseDevVars("K='x=y=z'")).toEqual({ K: 'x=y=z' })
  })

  it('skips comments and blank lines', () => {
    expect(parseDevVars('# secret\n\n  \nA=1')).toEqual({ A: '1' })
  })

  it('never expands anything', () => {
    // A value is what the file says. Interpolating would turn a literal into
    // something nobody wrote, in a file holding credentials.
    expect(parseDevVars('A=${B}')).toEqual({ A: '${B}' })
  })

  it('ignores a line that is not KEY=value', () => {
    expect(parseDevVars('not a variable\n=novalue\nBAD KEY=1')).toEqual({})
  })
})

describe('the Android build’s Gradle memory', () => {
  // KSP exhausts the 512m metaspace the generated file asks for, and the build
  // dies four minutes in on the single word "Metaspace" — nothing about a
  // limit, nothing to act on.

  it('replaces the line the template wrote', () => {
    const out = withGradleMemory(
      'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m\nnewArch=true',
      '-Xmx6g -XX:MaxMetaspaceSize=2g',
    )
    expect(out).toContain('org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g')
    expect(out).not.toContain('512m')
    // The rest of the file is untouched — it carries the whole Expo config.
    expect(out).toContain('android.useAndroidX=true')
    expect(out).toContain('newArch=true')
  })

  it('appends when there is no line to replace', () => {
    expect(withGradleMemory('a=1', '-Xmx6g')).toBe('a=1\norg.gradle.jvmargs=-Xmx6g\n')
  })

  it('leaves exactly one such line', () => {
    const once = withGradleMemory('org.gradle.jvmargs=-Xmx1g', '-Xmx6g')
    const twice = withGradleMemory(once, '-Xmx6g')
    expect(twice).toBe(once)
    expect(twice.match(/org\.gradle\.jvmargs/g)).toHaveLength(1)
  })
})

describe('the app id the emulator installs', () => {
  // Read from app.json rather than repeated here: EAS owns the versionCode
  // (`appVersionSource: "remote"`), so a local prebuild produces versionCode 1
  // and Android refuses to install it over an EAS build —
  // INSTALL_FAILED_VERSION_DOWNGRADE. The old app has to come off by name
  // first, and a name written twice is a name that can disagree with itself.

  it('reads expo.android.package', () => {
    expect(androidPackage('{"expo":{"android":{"package":"fr.clubping.app"}}}')).toBe(
      'fr.clubping.app',
    )
  })

  it('refuses to guess when app.json does not say', () => {
    expect(() => androidPackage('{"expo":{}}')).toThrow('expo.android.package')
  })
})
