import { test, expect, type Page } from '@playwright/test'
import { acceptConfirm, loginAs } from './helpers'

// #602 — a club's own groups of members. The mock club (Rixheim) starts with
// two overlapping groups: Bureau (the secretary, Joris, Grégory, Quentin) and
// Entraîneurs (Grégory, Quentin, Enzo) — so OU and ET give different lists.

/** The Groupes section of the club page. */
const groupsSection = (page: Page) => page.getByRole('region', { name: 'Groupes' })

/** The filter chips on /joueurs. */
const filter = (page: Page) => page.getByRole('group', { name: 'Filtrer par groupe' })

/** The desktop table's player links — the card list is hidden at this width. */
const listedNames = (page: Page) => page.getByRole('table').getByRole('link')

test.describe('Groupes — filtrer les joueurs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'lotz')
  })

  test('a player filters the club list by one group, then two in OU and in ET', async ({ page }) => {
    await page.goto('/joueurs')
    await filter(page).getByRole('button', { name: 'Bureau' }).click()
    await expect(listedNames(page)).toHaveCount(3)
    await expect(page.getByText('3 joueurs', { exact: true })).toBeVisible()

    await filter(page).getByRole('button', { name: 'Entraîneurs' }).click()
    await expect(listedNames(page)).toHaveCount(4)

    await page.getByRole('checkbox', { name: 'Au moins un groupe' }).click()
    await expect(page.getByRole('checkbox', { name: 'Tous les groupes' })).toBeChecked()
    await expect(listedNames(page)).toHaveCount(2)
    await expect(page.getByRole('table').getByText('Grégory Canaque')).toBeVisible()
    await expect(page.getByRole('table').getByText('Quentin Colle')).toBeVisible()
    await expect(page).toHaveURL(/groupes=.*&mode=tous/)
  })

  test('a fiche says which groups the player is in, and leads back to the list', async ({ page }) => {
    await page.goto('/joueurs/p2-player-1')
    const section = page.getByRole('region', { name: 'Groupes' })
    await expect(section.getByRole('link', { name: 'Bureau' })).toBeVisible()
    await section.getByRole('link', { name: 'Entraîneurs' }).click()

    await expect(page).toHaveURL(/\/joueurs\?groupes=mgroup-entraineurs/)
    await expect(listedNames(page)).toHaveCount(3)
  })

  test('a player sees the groups on the club page but cannot change them', async ({ page }) => {
    await page.goto('/club')
    await expect(groupsSection(page).getByText('Bureau')).toBeVisible()
    await expect(groupsSection(page).getByRole('button', { name: '+ Nouveau groupe' })).toHaveCount(0)
  })
})

test.describe('Groupes — un administrateur de club les gère', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/club')
  })

  test('creates a group, fills it, and finds it in the player filter', async ({ page }) => {
    // A group is made with its people, in one dialog — the captain's sheet.
    await groupsSection(page).getByRole('button', { name: '+ Nouveau groupe' }).click()
    const editor = page.getByRole('dialog', { name: /Nouveau groupe/ })
    await editor.getByLabel('Nom').fill('Loisirs')
    await editor.getByPlaceholder('Rechercher un joueur').fill('cunin')
    await editor.getByRole('button', { name: /Cédric Cunin/ }).click()
    await editor.getByPlaceholder('Rechercher un joueur').fill('ceroni')
    await editor.getByRole('button', { name: /Hervé Ceroni/ }).click()
    await expect(editor.getByRole('heading')).toHaveText('Nouveau groupe (2)')
    await editor.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(editor).toBeHidden()

    const row = groupsSection(page).getByRole('listitem').filter({ hasText: 'Loisirs' })
    await expect(row.getByText('2 membres')).toBeVisible()

    await row.getByRole('link').click()
    await expect(page).toHaveURL(/\/joueurs\?groupes=/)
    await expect(listedNames(page)).toHaveCount(2)
  })

  test('refuses a second group under a name the club already uses', async ({ page }) => {
    await groupsSection(page).getByRole('button', { name: '+ Nouveau groupe' }).click()
    const editor = page.getByRole('dialog', { name: /Nouveau groupe/ })
    await editor.getByLabel('Nom').fill('  bureau ')
    await editor.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(editor.getByRole('alert')).toHaveText('Le club a déjà un groupe de ce nom.')
  })

  test('files a player into a group from their fiche', async ({ page }) => {
    await page.goto('/joueurs/p2-player-8')
    const section = page.getByRole('region', { name: 'Groupes' })
    await expect(section.getByText('Dans aucun groupe.')).toBeVisible()
    await section.getByRole('button', { name: 'Modifier' }).click()

    const dialog = page.getByRole('dialog', { name: /Groupes — Cédric Cunin/ })
    await dialog.getByRole('button', { name: 'Entraîneurs' }).click()
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(section.getByRole('link', { name: 'Entraîneurs' })).toBeVisible()
  })

  test('deletes a group, and nobody leaves the club', async ({ page }) => {
    const row = groupsSection(page).getByRole('listitem').filter({ hasText: 'Entraîneurs' })
    await row.getByRole('button', { name: 'Supprimer' }).click()
    await acceptConfirm(page, 'Supprimer')
    await expect(groupsSection(page).getByText('Entraîneurs')).toHaveCount(0)

    await page.goto('/joueurs')
    await expect(page.getByRole('table').getByText('Enzo Lotz')).toBeVisible()
  })
})
