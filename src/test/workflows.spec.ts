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

// #321 — the cleanup job ignored every API response and exited 0, so it
// reported success whether or not it deleted anything. The script is shell
// inside YAML, so nothing else can catch a regression here.
describe('workflows — preview cleanup deletes every deployment (#321)', () => {
  const cleanup = read('preview.yml').split('preview:')[0]
  // Comments stripped: they discuss per_page precisely because it is banned,
  // and an assertion that its own rationale trips is worse than none.
  const script = cleanup
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  it('sends no paging parameters on the deployments listing', () => {
    // The endpoint rejects them (8000024, "Invalid list options provided") and
    // the whole job dies before deleting anything — which is how it shipped
    // once already. Cloudflare's SDK types this listing as a SinglePage.
    expect(script).not.toMatch(/per_page/)
    expect(script).not.toMatch(/[?&]page=/)
  })

  it('fails on a delete the API rejected', () => {
    expect(cleanup).toMatch(/failed to delete/)
  })

  it('re-checks that nothing is left, rather than assuming', () => {
    // This is the safety net that replaces guessing about pagination: whatever
    // the listing did or did not return, a leftover deployment fails the job.
    expect(cleanup).toContain('remaining=$(list_branch_deployments)')
    expect(cleanup).toMatch(/deployments still present/)
  })

  it('aborts the whole step on any failure', () => {
    expect(cleanup).toContain('set -euo pipefail')
  })
})

// #319 — mobile/ has its own tsconfig, so `npm run build` never typechecks it.
// A type error introduced in the SHARED src/types by #282 therefore sat in
// mobile/contexts/DataContext.tsx until someone happened to run tsc by hand.
// The job below is what closes that gap; this pins it in place.
describe('workflows — mobile typecheck runs in CI (#319)', () => {
  const test = read('test.yml')

  it('typechecks mobile/ on every PR', () => {
    expect(test).toContain('mobile-typecheck:')
    expect(test).toMatch(/run: npm run typecheck\n\s+working-directory: mobile/)
  })

  it('installs mobile dependencies first', () => {
    // Without them tsc cannot resolve expo/tsconfig.base and fails for the
    // wrong reason — a red job that says nothing about the code.
    expect(test).toMatch(/run: npm ci\n\s+working-directory: mobile/)
  })

  // #326 — the job shipped with --legacy-peer-deps because the lockfile carried
  // react@19.2.0 alongside react-dom@19.2.7, a pairing React itself forbids.
  // Pinning react-dom removed the need for the flag; putting it back would let
  // the next such drift install quietly instead of failing here.
  it('installs without --legacy-peer-deps (#326)', () => {
    // Comments stripped: they name the flag precisely because it is banned.
    const script = test
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    expect(script).not.toContain('--legacy-peer-deps')
  })
})

// #326 — react and react-dom are released in lockstep and must be the same
// version. react-dom is not imported by this app (it is a web-target peer of
// @expo/metro-runtime) but npm installs it regardless, so leaving it undeclared
// means npm resolves it to whatever is latest — which is exactly how it drifted
// to 19.2.7 against a react pinned at 19.2.0 and broke `npm ci`.
describe('mobile — react and react-dom stay in lockstep (#326)', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), 'mobile/package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> }

  it('declares react-dom explicitly', () => {
    expect(pkg.dependencies['react-dom']).toBeDefined()
  })

  it('pins it to the same version as react', () => {
    // Exact pins, as expo install writes them: a range would let the two drift
    // apart again on the next lockfile regeneration.
    expect(pkg.dependencies['react-dom']).toBe(pkg.dependencies.react)
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
