import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Player — Player detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'cunin')
  })

  test('navigates to a player profile via Joueurs list search', async ({ page }) => {
    await page.getByRole('link', { name: 'Joueurs' }).click()
    await expect(page).toHaveURL('/joueurs')
    await page.getByPlaceholder('Rechercher un joueur').fill('Cunin')
    await page.getByRole('row', { name: /Cédric Cunin/ }).getByRole('link').click()
    await expect(page).toHaveURL(/\/joueurs\/p2-player-8/)
    await expect(page.getByRole('heading', { name: 'Cédric Cunin' })).toBeVisible()
  })

  test('shows the phase block with captain/brûlage badges and match history', async ({ page }) => {
    await page.goto('/joueurs/p2-player-8')
    await expect(page.getByRole('heading', { name: 'Cédric Cunin' })).toBeVisible()
    await expect(page.getByText('Saison 2025/2026 Phase 1')).toBeVisible()
    await expect(page.getByText('Cap.')).toBeVisible()
    await expect(page.getByText('Brûlage')).toBeVisible()
    await expect(page.getByText('Matchs (2)')).toBeVisible()
  })

  test('opens the game info modal from match history', async ({ page }) => {
    await page.goto('/joueurs/p2-player-8')
    await page.getByRole('button', { name: 'Détails du match' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Disponibilités')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('clicking the team badge in the game modal opens the team page and closes the modal', async ({ page }) => {
    await page.goto('/joueurs/p2-player-8')
    // History is sorted ascending: the 2nd entry is the team-1 renfort game.
    await page.getByRole('button', { name: 'Détails du match' }).nth(1).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('link', { name: 'Équipe 1' }).click()
    await expect(page).toHaveURL('/equipes/team-1')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
