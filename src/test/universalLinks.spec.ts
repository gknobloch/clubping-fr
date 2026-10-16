import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SHARE_ORIGIN, gameSharePath } from '@/lib/gameShare'

// #747 — a shared match opens the app only if three places agree: the app's
// entitlements (app.json), the file the site serves (apple-app-site-association),
// and the path the share builds. Each is data nobody else reads, and a
// disagreement merges green and shows up as a link that opens Safari.

const app = JSON.parse(readFileSync(resolve(process.cwd(), 'mobile/app.json'), 'utf8')).expo as {
  ios: { bundleIdentifier: string; associatedDomains?: string[] }
  android: { package: string; intentFilters?: Array<{ autoVerify?: boolean; data: Array<{ scheme: string; host: string; pathPrefix?: string }> }> }
}
const aasa = JSON.parse(readFileSync(resolve(process.cwd(), 'public/.well-known/apple-app-site-association'), 'utf8')) as {
  applinks: { details: Array<{ appIDs: string[]; components: Array<{ '/': string }> }> }
}
const host = new URL(SHARE_ORIGIN).host
const sharedPath = gameSharePath({ gameId: 'g1', teamId: 't1' }).split('?')[0]

describe('universal links (#747)', () => {
  it('declares the share domain on iOS', () => {
    expect(app.ios.associatedDomains).toContain(`applinks:${host}`)
  })

  it('names this app in the site’s file, under a 10-character team id', () => {
    const ids = aasa.applinks.details.flatMap((d) => d.appIDs)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(new RegExp(`^[A-Z0-9]{10}\\.${app.ios.bundleIdentifier.replace(/\./g, '\\.')}$`))
  })

  it('claims the shared match path, and only it, on both platforms', () => {
    const patterns = aasa.applinks.details.flatMap((d) => d.components.map((c) => c['/']))
    expect(patterns).toEqual(['/match/*'])
    expect(sharedPath.startsWith('/match/')).toBe(true)

    const data = (app.android.intentFilters ?? []).filter((f) => f.autoVerify).flatMap((f) => f.data)
    expect(data).toEqual([{ scheme: 'https', host, pathPrefix: '/match/' }])
  })
})
