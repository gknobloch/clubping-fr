import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Player — Team detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/equipes/team-1')
  })

  test('shows identity, roster with play-counts, and a renfort tag', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'PPA Rixheim 1' })).toBeVisible()
    await expect(page.getByText('GE 1')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Joueurs' })).toBeVisible()

    const renfortRow = page.locator('li').filter({ hasText: 'Cédric Cunin' })
    await expect(renfortRow.getByText('Renfort')).toBeVisible()
    await expect(renfortRow.getByText('1/8')).toBeVisible()
  })

  test('phase switcher is disabled with a single phase', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Phase précédente' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Phase suivante' })).toBeDisabled()
  })

  test('opens the game info modal from the games list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Matchs' })).toBeVisible()
    await page.getByRole('button', { name: 'Détails du match' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('clicking a player in the game modal opens their profile and closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Détails du match' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('link', { name: /Joris Szulc/ }).click()
    await expect(page).toHaveURL('/joueurs/p2-player-5')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
