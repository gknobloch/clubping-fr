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
// Play's app signing key first (what the store installs), then EAS's upload
// key (what an internal build installed from EAS is signed with).
const assetLinks = JSON.parse(readFileSync(resolve(process.cwd(), 'public/.well-known/assetlinks.json'), 'utf8')) as Array<{
  relation: string[]
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] }
}>
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

  it('names this app in assetlinks.json, by its signing certificates', () => {
    expect(assetLinks).toHaveLength(1)
    const [link] = assetLinks
    expect(link.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(link.target.namespace).toBe('android_app')
    expect(link.target.package_name).toBe(app.android.package)
    expect(link.target.sha256_cert_fingerprints.length).toBeGreaterThan(0)
    for (const fp of link.target.sha256_cert_fingerprints) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    }
  })
})
