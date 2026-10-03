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

  // #623: the whole phase, a ratio per player.
  test('shows every journée of the phase with a ratio per player', async ({ page }) => {
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Planning de la phase' }),
    })
    await expect(section).toBeVisible()
    const row = section.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Szulc/ }) })
    // «Oui» then «Sél.», each out of the phase's eight matches.
    await expect(row.getByText(/^\d+\/8$/)).toHaveCount(2)
    await expect(section.getByRole('rowheader', { name: 'Sélectionnés' })).toBeVisible()

    // Renforts are one row; their names open in a popover.
    await expect(section.getByRole('rowheader', { name: /Cunin/ })).toHaveCount(0)
    await section.getByRole('button', { name: 'Renforts : Cédric Cunin' }).first().click()
    await expect(page.getByRole('dialog', { name: /^Renforts · J/ })).toContainText('Cédric Cunin')
    await page.getByRole('button', { name: 'Fermer' }).click()

    await section.getByRole('button', { name: /^Journée 1,/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('keeps the name in view while the journées scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const section = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Planning de la phase' }),
    })
    await expect(section.getByText('Tournez le téléphone pour voir toute la phase.')).toBeVisible()
    const name = section.getByRole('rowheader', { name: /Szulc/ })
    const before = await name.boundingBox()
    await section.locator('div.overflow-x-auto').evaluate((el) => el.scrollBy({ left: 300 }))
    await expect.poll(async () => (await name.boundingBox())?.x).toBe(before?.x)
  })
})
