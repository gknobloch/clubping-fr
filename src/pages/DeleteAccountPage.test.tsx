import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DeleteAccountPage } from './DeleteAccountPage'

// #434 — Google Play's data safety form takes a deletion URL and states three
// things it must show: the app or developer name, the procedure to follow, and
// which data is deleted versus retained. These tests pin those three, so the
// page cannot quietly lose what the listing was accepted on.
describe('DeleteAccountPage', () => {
  it('names the app in its heading', () => {
    render(<DeleteAccountPage />)
    expect(
      screen.getByRole('heading', { name: /Supprimer votre compte Club Ping/i }),
    ).toBeInTheDocument()
  })

  it('spells out the procedure and the response time', () => {
    render(<DeleteAccountPage />)
    const page = document.body.textContent ?? ''

    expect(page).toMatch(/depuis l'adresse e-mail associée à votre compte/i)
    expect(page).toMatch(/responsables de votre club/i)
    expect(page).toMatch(/sous 30 jours/i)
  })

  it('offers a prefilled mailto for the request', () => {
    render(<DeleteAccountPage />)
    const [mailto] = screen.getAllByRole('link', { name: /@/ })

    expect(mailto).toHaveAttribute('href', expect.stringContaining('mailto:'))
    expect(mailto).toHaveAttribute('href', expect.stringContaining('subject='))
  })

  // Mirrors the User model in src/types: every identifying field must appear in
  // the deleted list, or the page promises less than the app does.
  it('lists every identifying field as deleted', () => {
    render(<DeleteAccountPage />)
    const page = document.body.textContent ?? ''

    for (const claim of [
      /nom et prénom/i,
      /adresse e-mail/i,
      /téléphone/i,
      /date et.*lieu de naissance/i,
      /licence FFTT/i,
      /photo de profil/i,
      /dernière connexion/i,
      /disponibilités/i,
    ]) {
      expect(page).toMatch(claim)
    }
  })

  // The retained half is the part Play asks about explicitly, and the part a
  // member is most likely to contest: it has to say both what stays and why it
  // no longer identifies them.
  it('says what is retained, in what form, and for how long', () => {
    render(<DeleteAccountPage />)
    const page = document.body.textContent ?? ''

    expect(page).toMatch(/compositions d'équipes et\s*résultats sont conservés/i)
    expect(page).toMatch(/sous une forme anonyme/i)
    expect(page).toMatch(/sans aucune\s*donnée permettant de vous identifier/i)
    expect(page).toMatch(/sauvegardes techniques/i)
  })

  it('points back to the privacy policy for the other GDPR rights', () => {
    render(<DeleteAccountPage />)
    expect(screen.getByRole('link', { name: /politique de confidentialité/i })).toHaveAttribute(
      'href',
      '/confidentialite',
    )
  })
})
