import { test, expect } from '@playwright/test'
import { loginAs, runRowAction } from './helpers'

// #422: a repêchage moves a team to another poule mid-season. Division and
// groupe used to be create-only, so following the change meant deleting the
// team and recreating it — losing its roster, its captain and its history.
test.describe('General admin — moving a team to another pool', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/equipes')
  })

  const card = (page: import('@playwright/test').Page) =>
    page.locator('div').filter({ hasText: 'PPA Rixheim 1' }).filter({ hasText: 'Quentin Colle' }).last()

  /** The confirmation, which opens on top of the team dialog — hence named
   *  rather than taken through the shared helpers, which assume only one. */
  const moveConfirm = (page: import('@playwright/test').Page) =>
    page.getByRole('dialog', { name: /Déplacer l’équipe|Déplacer l'équipe/ })

  test('moves the team, after saying what it costs', async ({ page }) => {
    await expect(card(page).getByText('GE 1')).toBeVisible()
    await runRowAction(page, card(page), 'Modifier')

    const dialog = page.getByRole('dialog')
    // The phase does not move with it: a team's identity is derived from
    // (club, phase, number).
    await expect(dialog.getByLabel('Phase')).toBeDisabled()
    await dialog.getByLabel('Division').selectOption({ label: 'GE 2' })
    // Picking a division without a poule leaves the move half-stated.
    await expect(dialog.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await dialog.getByLabel('Groupe', { exact: true }).selectOption({ label: 'Groupe 1' })
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    const confirm = moveConfirm(page)
    await expect(confirm.getByText(/Les matchs de son ancienne poule.*seront supprimés/)).toBeVisible()
    await expect(confirm.getByText(/effectif, son capitaine et ses réglages sont conservés/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Déplacer' }).click()

    await expect(card(page).getByText('GE 2')).toBeVisible()
    // Its roster travels with it — the captain is still on the card.
    await expect(card(page).getByText('Quentin Colle')).toBeVisible()
  })

  test('leaves the team where it is when the move is declined', async ({ page }) => {
    await runRowAction(page, card(page), 'Modifier')
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Division').selectOption({ label: 'GE 2' })
    await dialog.getByLabel('Groupe', { exact: true }).selectOption({ label: 'Groupe 1' })
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await moveConfirm(page).getByRole('button', { name: 'Annuler' }).click()

    await expect(card(page).getByText('GE 1')).toBeVisible()
  })
})
