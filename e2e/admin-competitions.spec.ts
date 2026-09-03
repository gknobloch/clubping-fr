import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #482 — the global mapping and the club's amendments to it, end to end.
//
// Matches the mock data: PPA Rixheim's licensees carry FFTT categories, team 6
// is the young squad, and three competitions exist — the senior championship
// (no category listed, so open to everyone), a locked youth championship, and
// an unlocked veterans one.
const ORGS = '**/api/fftt/organizations'
const CONTESTS = '**/api/fftt/competitions-preview*'
const IMPORT = '**/api/competitions/import'

const organizations = [{ id: '14', type: 'League', identifier: 'L06', name: 'GRAND-EST' }]

// Every championship FFTT runs for the organisation and season chosen. The
// men's team championship is the one the mock data already holds.
const contests = {
  competitions: [
    { identifier: '1', name: 'FED_Championnat de France par Equipes Masculin', exists: true, localName: 'Championnat par équipes' },
    { identifier: 'CJ', name: 'FED_Championnat Jeunes', exists: false },
  ],
}

const importResult = {
  created: [{
    id: 'comp-cj', displayName: 'FED_Championnat Jeunes', categories: [],
    isCategoryLocked: false, sortOrder: 4, isArchived: false, ffttContestIdentifier: 'CJ',
  }],
  skipped: [],
}

test.describe('General admin — Competitions (#482)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  // A competition is FFTT data like a club or a division: the import is the
  // way in, and the manual add is the fallback for what FFTT does not run.
  test('imports the championships FFTT runs, rather than asking for them to be typed', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(IMPORT, (route) => route.fulfill({ json: importResult }))

    await page.goto('/competitions')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await expect(page.getByRole('heading', { name: 'Importer les compétitions FFTT' })).toBeVisible()

    await page.getByLabel('Organisation').selectOption('14')
    await page.getByRole('button', { name: 'Rechercher les compétitions' }).click()

    // One we hold already, shown under our own name and not tickable again.
    await expect(page.getByRole('checkbox', { name: 'FED_Championnat de France par Equipes Masculin' })).toBeDisabled()
    await expect(page.getByText('Déjà présente')).toBeVisible()

    // Nothing ticked by default: FFTT lists everything an organisation runs,
    // most of it individual tournaments, so importing is opt-in.
    const youth = page.getByRole('checkbox', { name: 'FED_Championnat Jeunes' })
    await expect(youth).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Aucune sélection' })).toBeDisabled()
    await youth.check()

    // And the name is the admin's to choose — FFTT's are export labels.
    await page.getByLabel('Nom de « FED_Championnat Jeunes »').fill('Championnat jeunes')
    await page.getByRole('button', { name: 'Importer 1 compétition' }).click()
    await expect(page.getByText(/1 compétition importée, ouverte à toutes les catégories/)).toBeVisible()

    await page.getByRole('button', { name: 'Fermer' }).click()
    // Imported open to everyone: an import never starts restricting anyone.
    const row = page.getByRole('row', { name: /FED_Championnat Jeunes/ })
    await expect(row).toContainText('Toutes les catégories')
    await expect(row).toContainText('FFTT')
  })

  test('still allows a competition FFTT does not run to be added by hand', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('button', { name: 'Ajouter une compétition' }).click()
    await expect(page.getByRole('heading', { name: 'Ajouter une compétition' })).toBeVisible()
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
    await page.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Championnat féminin' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('row', { name: /GE 7/ })).toContainText('Championnat féminin')
  })

  // More specific wins: a division may narrow its competition's categories.
  test('a division can narrow the categories its competition admits', async ({ page }) => {
    await page.goto('/divisions')
    await page.getByRole('row', { name: /GE 7/ }).getByRole('button', { name: 'Modifier' }).click()

    // The option only appears once the division belongs to a competition.
    await page.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Championnat jeunes' })
    const narrow = page.getByRole('checkbox', { name: /Restreindre les catégories/ })
    await expect(narrow).not.toBeChecked()
    await narrow.check()
    await page.getByRole('checkbox', { name: 'Benjamin', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Minime', exact: true }).check()
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    const row = page.getByRole('row', { name: /GE 7/ })
    await expect(row).toContainText('Championnat jeunes')
    await expect(row).toContainText('B, M')
  })

  test('a division with no competition is not offered category restrictions', async ({ page }) => {
    await page.goto('/divisions')
    await page.getByRole('row', { name: /GE 6/ }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Aucune (aucune restriction de catégorie)' })
    await expect(page.getByRole('checkbox', { name: /Restreindre les catégories/ })).toHaveCount(0)
  })

  test('a division can belong to no competition, which restricts nobody', async ({ page }) => {
    await page.goto('/divisions')
    await page.getByRole('row', { name: /GE 6/ }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Aucune (aucune restriction de catégorie)' })
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
    await club.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Championnat jeunes' })
    await expect(club).toContainText('Réservée à ces catégories')
    await expect(club.getByRole('button', { name: 'Ajouter' })).toHaveCount(0)
    // Excluding one of its own stays possible.
    await expect(club.getByRole('button', { name: 'Exclure' }).first()).toBeVisible()
  })

  test('adds a licensee the default turns away, then puts them back', async ({ page }) => {
    const club = section(page)
    await club.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Championnat vétérans' })

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
