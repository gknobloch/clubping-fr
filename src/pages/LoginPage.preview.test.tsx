import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// `__PR_NUMBER__` is a compile-time substitution from vite.config.ts, so it
// cannot be stubbed per test — which is why IS_PR_PREVIEW lives in its own
// module. Mocking that module is the only way to exercise the preview branch.
// Kept in a separate file because the mock is module-scoped and the sibling
// LoginPage.test.tsx covers the non-preview default.
vi.mock('@/lib/preview', () => ({
  PR_NUMBER: '42',
  COMMIT_SHA: 'abcdef1234',
  IS_PR_PREVIEW: true,
}))

const { LoginPage } = await import('./LoginPage')

describe('LoginPage — PR preview (#313)', () => {
  it('replaces the OTP flow with the dev login', () => {
    render(<LoginPage />)

    // The whole point: on a preview every address is @example.invalid, so
    // "receive a code" could never deliver one and must not be offered.
    expect(screen.queryByLabelText(/Adresse e-mail/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Recevoir un code/i })).not.toBeInTheDocument()

    expect(screen.getByPlaceholderText(/Nom ou adresse email/i)).toBeInTheDocument()
  })

  it('carries the same brand header as the e-mail form (#351)', () => {
    render(<LoginPage />)

    // The preview's picker replaces the OTP form entirely, so it is the whole
    // login screen here — it must introduce the app just the same.
    expect(screen.getByRole('img', { name: 'Club Ping' })).toBeInTheDocument()
    expect(screen.getByText(/Le tennis de table de club au quotidien/i)).toBeInTheDocument()
  })

  it('says it is a preview rather than showing the dev-mode separator', () => {
    render(<LoginPage />)

    expect(screen.getByText(/Préversion/i)).toBeInTheDocument()
    expect(screen.queryByText(/Mode développement/i)).not.toBeInTheDocument()
  })
})
