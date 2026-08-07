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

// The client flag only decides whether the picker is drawn. DEV_LOGIN_ENABLED
// is the one that matters: it makes /api/auth/dev/* mint a session for any user
// with no credential. In the top-level [vars] — which Cloudflare applies to the
// production deployment — that is a complete authentication bypass against real
// member data.
describe('wrangler.toml — server-side dev login gating (#313)', () => {
  const toml = readFileSync(resolve(process.cwd(), 'wrangler.toml'), 'utf8')
  const [production, preview] = toml.split('[env.preview.vars]')

  it('never enables the dev login endpoints in production', () => {
    expect(production).not.toContain('DEV_LOGIN_ENABLED')
  })

  it('enables them for the preview environment', () => {
    expect(preview).toMatch(/DEV_LOGIN_ENABLED\s*=\s*"true"/)
  })
})

// #321 — the cleanup job deleted only the first page of the deployments list,
// which it shares with production deploys. Previews older than that page
// survived the merge and kept the pr-N alias alive, and since the job ignored
// every response and exited 0, it reported success while doing so. The script
// is shell inside YAML, so nothing else can catch a regression here.
describe('workflows — preview cleanup deletes every deployment (#321)', () => {
  const cleanup = read('preview.yml').split('preview:')[0]

  it('paginates the deployments listing', () => {
    expect(cleanup).toMatch(/per_page=100&page=\$page/)
    expect(cleanup).toContain('page=$((page + 1))')
  })

  it('fails on a delete the API rejected', () => {
    expect(cleanup).toMatch(/failed to delete/)
  })

  it('re-checks that nothing is left, rather than assuming', () => {
    expect(cleanup).toContain('remaining=$(list_branch_deployments)')
    expect(cleanup).toMatch(/deployments still present/)
  })

  it('aborts the whole step on any failure', () => {
    expect(cleanup).toContain('set -euo pipefail')
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
