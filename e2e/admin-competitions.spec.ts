import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #482 — the global mapping and the club's amendments to it, end to end.
//
// Matches the mock data: PPA Rixheim's licensees carry FFTT categories, team 6
// is the young squad, and three competitions exist — the senior championship
// (no category listed, so open to everyone), a locked youth championship, and
// an unlocked veterans one.
test.describe('General admin — Competitions (#482)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('lists the competitions with their default mapping', async ({ page }) => {
    await page.goto('/competitions')
    const seniors = page.getByRole('row', { name: /Championnat par équipes/ })
    await expect(seniors).toContainText('Toutes les catégories')
    // Created by the divisions import, which reads one FFTT contest (#482).
    await expect(seniors).toContainText('FFTT')
    // Every mock division is filed under it.
    await expect(seniors).toContainText('7')

    const youth = page.getByRole('row', { name: /Championnat jeunes/ })
    await expect(youth).toContainText('Verrouillée')
    await expect(youth).toContainText('P, B, M, C, J')
  })

  test('creates one, locks it, and attaches a division to it', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('button', { name: 'Ajouter une compétition' }).click()
    await page.getByLabel('Nom').fill('Championnat féminin')
    await page.getByRole('checkbox', { name: 'Cadet' }).check()
    await page.getByRole('checkbox', { name: 'Junior' }).check()
    await page.getByRole('checkbox', { name: /Réservée à ces catégories/ }).check()
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    const row = page.getByRole('row', { name: /Championnat féminin/ })
    await expect(row).toContainText('C, J')
    await expect(row).toContainText('Verrouillée')
    await expect(row).toContainText('0')

    // A division belongs to a competition, and the list says so. Navigated
    // through the app rather than reloaded: without a backend the E2E run keeps
    // its data in memory, and a full page load would lose the competition just
    // created.
    await page.getByRole('link', { name: 'Divisions' }).click()
    await expect(page).toHaveURL('/divisions')
    await page.getByRole('row', { name: /GE 7/ }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Compétition').selectOption({ label: 'Championnat féminin' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('row', { name: /GE 7/ })).toContainText('Championnat féminin')
  })

  test('a division can belong to no competition, which restricts nobody', async ({ page }) => {
    await page.goto('/divisions')
    await page.getByRole('row', { name: /GE 6/ }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Compétition').selectOption({ label: 'Aucune (aucune restriction de catégorie)' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('row', { name: /GE 6/ })).toContainText('—')
  })
})

test.describe('Player detail — which competitions (#482)', () => {
  test('a cadet is eligible to his category and to the adults', async ({ page }) => {
    await loginAs(page, 'admin')
    // Samuel Canemolla, C1 in the mock — team 6.
    await page.goto('/joueurs/p2-player-39')
    await expect(page.getByText('Cadet (C1)')).toBeVisible()

    const competitions = page.getByRole('heading', { name: 'Compétitions' })
      .locator('xpath=..')
    await expect(competitions).toContainText('Championnat par équipes')
    await expect(competitions).toContainText('Championnat jeunes')
    await expect(competitions).not.toContainText('Championnat vétérans')
  })

  test('a veteran is eligible to the veterans and not to the youth', async ({ page }) => {
    await loginAs(page, 'admin')
    // Hervé Ceroni, V55 in the mock.
    await page.goto('/joueurs/p2-player-7')
    await expect(page.getByText('Vétéran 55')).toBeVisible()

    const competitions = page.getByRole('heading', { name: 'Compétitions' })
      .locator('xpath=..')
    await expect(competitions).toContainText('Championnat vétérans')
    await expect(competitions).not.toContainText('Championnat jeunes')
  })
})

test.describe('Club admin — amending the default mapping (#482)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'canaque')
    await page.goto('/club')
  })

  const section = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: 'Compétitions' })

  test('offers no way into a competition reserved to its categories', async ({ page }) => {
    const club = section(page)
    await club.getByLabel('Compétition').selectOption({ label: 'Championnat jeunes' })
    await expect(club).toContainText('Réservée à ces catégories')
    await expect(club.getByRole('button', { name: 'Ajouter' })).toHaveCount(0)
    // Excluding one of its own stays possible.
    await expect(club.getByRole('button', { name: 'Exclure' }).first()).toBeVisible()
  })

  test('adds a licensee the default turns away, then puts them back', async ({ page }) => {
    const club = section(page)
    await club.getByLabel('Compétition').selectOption({ label: 'Championnat vétérans' })

    // Joris Szulc is a senior: out of category, but the competition is open.
    const before = club.locator('li').filter({ hasText: 'Joris Szulc' })
    await expect(before).toContainText('Hors catégorie')
    await before.getByRole('button', { name: 'Ajouter' }).click()

    const after = club.locator('li').filter({ hasText: 'Joris Szulc' })
    await expect(after).toContainText('Ajouté par le club')
    await after.getByRole('button', { name: 'Rétablir le défaut' }).click()
    await expect(club.locator('li').filter({ hasText: 'Joris Szulc' }))
      .toContainText('Hors catégorie')
  })
})
