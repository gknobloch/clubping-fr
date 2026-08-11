import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PrivacyPage } from './PrivacyPage'

// #356 — Google Play and the App Store both refuse a listing without a public
// policy URL. These tests pin the claims the stores' data-safety forms are
// answered against, so the page and the forms can't silently drift apart.
describe('PrivacyPage', () => {
  it('renders the policy heading', () => {
    render(<PrivacyPage />)
    expect(
      screen.getByRole('heading', { name: /Politique de confidentialité/i }),
    ).toBeInTheDocument()
  })

  it('declares every category of personal data the app actually collects', () => {
    render(<PrivacyPage />)
    const page = document.body.textContent ?? ''

    // Mirrors the User model in src/types and the avatar picker in the mobile app.
    for (const claim of [
      /nom, prénom/i,
      /date et lieu de naissance/i,
      /licence FFTT/i,
      /adresse e-mail/i,
      /téléphone/i,
      /Photo de profil/i,
    ]) {
      expect(page).toMatch(claim)
    }
  })

  it('states the absence of trackers, advertising and audience measurement', () => {
    render(<PrivacyPage />)
    const page = document.body.textContent ?? ''

    expect(page).toMatch(/aucun outil de mesure d'audience/i)
    expect(page).toMatch(/aucune régie publicitaire/i)
    expect(page).toMatch(/aucun traceur tiers/i)
  })

  it('covers the GDPR rights and names the supervisory authority', () => {
    render(<PrivacyPage />)
    const page = document.body.textContent ?? ''

    expect(page).toMatch(/RGPD/)
    expect(page).toMatch(/effacement/i)
    expect(page).toMatch(/portabilité/i)
    expect(page).toMatch(/CNIL/)
  })

  it('offers a contact address for exercising those rights', () => {
    render(<PrivacyPage />)
    const [mailto] = screen.getAllByRole('link', { name: /@/ })
    expect(mailto).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })
})
