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

// #406 — after sharing the app with the club, the question is who has actually
// opened it. The fixtures date three members' visits relative to today and
// leave the rest without one, which is the state the page has to make readable.
test.describe('Club admin — who has opened the app', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/joueurs')
  })

  test('dates each visit, and names those who never came', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Dernière visite' })).toBeVisible()

    await expect(page.getByRole('row', { name: /Joris Szulc/ })).toContainText("Aujourd'hui")
    await expect(page.getByRole('row', { name: /Grégory Canaque/ })).toContainText('Il y a 3 jours')
    await expect(page.getByRole('row', { name: /Stéphane Lach/ })).toContainText('Il y a 2 semaines')
    await expect(page.getByRole('row', { name: /Enzo Lotz/ })).toContainText('Jamais')
  })

  test('says how much of the club has arrived', async ({ page }) => {
    await expect(page.getByText(/joueurs? sur \d+ .* déjà ouvert l'application/)).toBeVisible()
  })
})

// The same page, seen by someone who does not administer the club: the API
// sends them nobody's visit, and the page must not imply that means "never".
test.describe('Player — the last visit is not theirs to see', () => {
  test('shows no visit column, badge or tally', async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/joueurs')

    await expect(page.getByRole('heading', { name: 'Joueurs' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Dernière visite' })).toHaveCount(0)
    await expect(page.getByText('Jamais connecté')).toHaveCount(0)
    await expect(page.getByText(/déjà ouvert l'application/)).toHaveCount(0)
  })
})
