import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// #313 — dev login ("sign in as anyone, no password") is enabled on preview
// deployments. That is only defensible because the preview database is
// anonymised on refresh; on production, with real member data, it would be a
// full authentication bypass.
//
// Nothing in the app can catch that mistake: VITE_DEV_LOGIN is read at build
// time, so a stray line in deploy.yml would ship a production bundle with the
// bypass baked in and every test still green. Hence a check on the workflow
// files themselves.
const read = (name: string) =>
  readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8')

describe('workflows — dev login gating (#313)', () => {
  it('never enables dev login on the production deploy', () => {
    expect(read('deploy.yml')).not.toContain('VITE_DEV_LOGIN')
  })

  it('enables dev login on previews', () => {
    // Exactly 'true': AuthContext compares the string, so VITE_DEV_LOGIN=1
    // would silently leave previews on the real Resend flow.
    expect(read('preview.yml')).toMatch(/VITE_DEV_LOGIN:\s*'true'/)
  })
})

describe('workflows — database targets (#296, #313)', () => {
  it('runs preview migrations against the dev database, never production', () => {
    const preview = read('preview.yml')
    expect(preview).toContain('clubping-fr-dev')
    expect(preview).not.toContain('clubping-fr-prod')
  })

  it('runs the production deploy against the production database', () => {
    expect(read('deploy.yml')).toContain('clubping-fr-prod')
  })
})
