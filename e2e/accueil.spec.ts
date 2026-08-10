import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Player — Accueil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'lotz')
  })

  test('shows welcome, club, and the upcoming match card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Enzo Lotz', level: 1 })).toBeVisible()
    await expect(page.getByRole('main').getByText('PPA Rixheim', { exact: true })).toBeVisible()
    await expect(page.getByText('Prochains matchs')).toBeVisible()
    await expect(page.getByText(/PPA Rixheim 1 – Etival 1/)).toBeVisible()
  })

  test('setting availability updates the "À confirmer" tile', async ({ page }) => {
    await expect(page.getByText('1 match', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'OUI' }).click()
    await expect(page.getByText('0 matchs')).toBeVisible()
  })

  test('Aperçu opens the game modal, whose Détails leads to the round', async ({ page }) => {
    await page.getByRole('button', { name: 'Aperçu' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Disponibilités')).toBeVisible()

    // The way on is a link, not a button, and the destination depends on the
    // viewport (#347) — desktop here, so the deep-linked matrix.
    const details = page.getByRole('dialog').getByRole('link', { name: 'Détails', exact: true })
    await expect(details).toHaveAttribute('href', /^\/journees\?equipe=.+&match=.+/)

    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('shows the "Tous mes matchs" section with a phase card', async ({ page }) => {
    await expect(page.getByText('Tous mes matchs')).toBeVisible()
    await expect(page.getByText('Saison 2025/2026 Phase 1')).toBeVisible()
  })
})

// Cédric Cunin is the seeded renfort/brûlage case: rostered on (and captain
// of) team-2, called up to team-1 for a second game — his full match history
// (shared with the player-detail screen via PlayerPhaseHistory) exercises the
// Cap./Brûlage badges and spans two of the club's teams.
test.describe('Player — Accueil (Tous mes matchs)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'cunin')
  })

  test('shows every game across the club, tagged with the team played for', async ({ page }) => {
    await expect(page.getByText('Tous mes matchs')).toBeVisible()
    await expect(page.getByText('Cap.')).toBeVisible()
    await expect(page.getByText('Brûlage')).toBeVisible()
    await expect(page.getByText('Matchs (2)')).toBeVisible()
    await expect(page.getByText('J1')).toBeVisible()
    await expect(page.getByText('J2')).toBeVisible()
    // 1 game for his own team (team-2) + 1 borrowed for team-1, out of team-2's 7 games.
    await expect(page.getByText('1 + 1 / 7 joués')).toBeVisible()
  })

  test('opens the game modal from the match history', async ({ page }) => {
    await page.getByRole('button', { name: 'Détails du match' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
