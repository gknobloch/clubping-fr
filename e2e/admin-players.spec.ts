import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Club admin — Joueurs list', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/joueurs')
  })

  test('shows a club header and Ajouter un joueur inside it, defaults to Actif filter', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Joueurs' })).toBeVisible()
    await expect(page.getByRole('main').getByText('PPA Rixheim')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ajouter un joueur' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Statut' })).toHaveValue('active')
    await expect(page.getByRole('columnheader', { name: 'Statut' })).toHaveCount(0)
  })

  test('a non-active player is hidden by default and shows a status badge under "Tous"', async ({ page }) => {
    await page.getByRole('button', { name: 'Ajouter un joueur' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Prénom').fill('Test')
    await dialog.getByLabel('Nom', { exact: true }).fill('Archivedplayer')
    await dialog.getByLabel('Email').fill('test.archived@example.com')
    await dialog.getByLabel('Statut').selectOption('archived')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    await page.getByPlaceholder(/Rechercher par nom/i).fill('Archivedplayer')
    await expect(page.getByText('Test Archivedplayer')).toHaveCount(0)

    await page.getByRole('combobox', { name: 'Statut' }).selectOption('all')
    const row = page.getByRole('row', { name: /Test Archivedplayer/ })
    await expect(row).toBeVisible()
    await expect(row.getByText('Archivé')).toBeVisible()

    await page.getByRole('combobox', { name: 'Statut' }).selectOption('active')
    await expect(page.getByText('Test Archivedplayer')).toHaveCount(0)
  })

  // #315 — e-mail became optional, but the modal kept refusing to save without
  // one, so an address could be typed in and never taken back out.
  test('an e-mail can be removed and the member added without one', async ({ page }) => {
    const row = page.getByRole('row', { name: /Joris Szulc/ })
    await expect(row).toContainText('joris.szulc@example.com')
    await row.getByRole('button', { name: 'Modifier' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill('')
    const save = dialog.getByRole('button', { name: 'Enregistrer' })
    await expect(save).toBeEnabled()
    await save.click()

    await expect(dialog).toBeHidden()
    await expect(row).not.toContainText('joris.szulc@example.com')

    // And it stays gone when the modal is reopened.
    await row.getByRole('button', { name: 'Modifier' }).click()
    await expect(page.getByRole('dialog').getByLabel('Email')).toHaveValue('')
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()

    await page.getByRole('button', { name: 'Ajouter un joueur' }).click()
    const create = page.getByRole('dialog')
    await create.getByLabel('Prénom').fill('Sans')
    await create.getByLabel('Nom', { exact: true }).fill('Adresse')
    await create.getByRole('button', { name: 'Enregistrer' }).click()

    await page.getByPlaceholder(/Rechercher par nom/i).fill('Adresse')
    const added = page.getByRole('row', { name: /Sans Adresse/ })
    await expect(added).toBeVisible()
    await expect(added).not.toContainText('@')
  })
})
