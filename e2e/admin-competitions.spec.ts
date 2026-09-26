import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #482, #604 — the global mapping, and a club reserving a competition to one of
// its groups, end to end.
//
// Matches the mock data: PPA Rixheim's licensees carry FFTT categories, and
// three competitions exist — the senior championship (no category listed, so
// open to everyone), a youth championship and a veterans one. The club has two
// groups (#602): Bureau, and Entraîneurs (Grégory Canaque V40, Quentin Colle S,
// Enzo Lotz J1). No competition is reserved to either until a test says so.
const ORGS = '**/api/fftt/organizations'
const CONTESTS = '**/api/fftt/competitions-preview*'
const IMPORT = '**/api/competitions/import'

const organizations = [{ id: '14', type: 'League', identifier: 'L06', name: 'GRAND-EST' }]

// Every championship FFTT runs for the organisation and season chosen. The
// men's team championship is the one the mock data already holds.
// Two contests sharing the identifier "TO", as org 15 really lists them: the
// dialog must show two rows with two independent checkboxes (#482).
const contests = {
  competitions: [
    { id: '18368', identifier: '1', name: 'FED_Championnat de France par Equipes Masculin', exists: true, localName: 'Championnat par équipes' },
    { id: '18721', identifier: '4', name: 'FED_Championnat par Equipes Jeunes', exists: false },
    { id: '18647', identifier: 'TO', name: 'TOP DE ZONE 06', exists: false },
    { id: '18742', identifier: 'TO', name: 'TOP DE QUALIFICATION', exists: false },
  ],
}

const importResult = {
  created: [{
    id: 'comp-zone', displayName: 'Top de zone', categories: [],
    sortOrder: 4, isArchived: false,
    ffttContestIdentifier: 'TO', ffttContestName: 'TOP DE ZONE 06',
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
    // Nothing ticked by default — the list is everything a league runs.
    await expect(page.getByRole('checkbox', { name: 'FED_Championnat par Equipes Jeunes' }))
      .not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Aucune sélection' })).toBeDisabled()

    // Two contests share the identifier "TO"; they are two independent rows,
    // not one control that ticks both (#482).
    const zone = page.getByRole('checkbox', { name: 'TOP DE ZONE 06' })
    const qualif = page.getByRole('checkbox', { name: 'TOP DE QUALIFICATION' })
    await zone.check()
    await expect(qualif).not.toBeChecked()

    // And the name is the admin's to choose — FFTT's are export labels.
    await page.getByLabel('Nom de « TOP DE ZONE 06 »').fill('Top de zone')
    await page.getByRole('button', { name: 'Importer 1 compétition' }).click()
    await expect(page.getByText(/1 compétition importée, ouverte à toutes les catégories/)).toBeVisible()

    await page.getByRole('button', { name: 'Fermer' }).click()
    // Imported open to everyone: an import never starts restricting anyone.
    const row = page.getByRole('row', { name: /Top de zone/ })
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
    await expect(youth).toContainText('P, B, M, C, J')
  })

  test('creates one and attaches a division to it', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('button', { name: 'Ajouter une compétition' }).click()
    await page.getByLabel('Nom').fill('Championnat féminin')
    await page.getByRole('checkbox', { name: 'Cadet' }).check()
    await page.getByRole('checkbox', { name: 'Junior' }).check()
    // No lock any more (#604): a club can only narrow a competition, so there
    // is nothing left to reserve it against.
    await expect(page.getByRole('checkbox', { name: /Réservée à ces catégories/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    const row = page.getByRole('row', { name: /Championnat féminin/ })
    await expect(row).toContainText('C, J')
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

test.describe('Player detail — the category, and no more (#604)', () => {
  test('states the category, and says so plainly when none is on file', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/joueurs/p2-player-39')
    // In the identity card, for the season being played.
    const informations = page.getByRole('heading', { name: 'Informations' }).locator('xpath=..')
    await expect(informations).toContainText('Catégorie')
    await expect(informations).toContainText('Cadet (C1)')

    // And beside the season it belongs to — points are per phase, a category
    // per season (#482).
    await expect(page.getByText('Catégorie Cadet (C1)')).toBeVisible()
  })

  // The per-licensee amendments are gone, and the section that offered them
  // with them: a competition is now reserved to a group, on the club's screen.
  test('no longer lists the competitions on the fiche', async ({ page }) => {
    await loginAs(page, 'canaque')
    await page.goto('/joueurs/p2-player-39')
    await expect(page.getByRole('heading', { name: 'Compétitions' })).toHaveCount(0)
  })
})

test.describe('Club admin — reserving a competition to a group (#604)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'canaque')
  })

  /** One competition's card on the club's screen. */
  const card = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })

  test('has its own screen in the navigation, not a section buried in the club', async ({ page }) => {
    await page.goto('/club')
    await expect(page.getByRole('region', { name: 'Compétitions' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Compétitions' }).click()
    await expect(page).toHaveURL('/competitions')
    await expect(page.getByRole('heading', { name: 'Compétitions', level: 1 })).toBeVisible()
    // The club's own screen, not the general admin's global configuration.
    await expect(page.getByRole('button', { name: 'Importer depuis la FFTT' })).toHaveCount(0)
  })

  test('asks before leaving out a player an équipe already fields, then flags them', async ({ page }) => {
    await page.goto('/competitions')
    const seniors = card(page, 'Championnat par équipes')
    await seniors.getByLabel('Réservée au groupe').selectOption({ label: 'Entraîneurs' })

    // Joris Szulc is on a roster playing that championship, and not a coach.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Joris Szulc')
    await expect(dialog).toContainText('Rien ne les retire')
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(seniors.getByLabel('Réservée au groupe')).toHaveValue('')

    await seniors.getByLabel('Réservée au groupe').selectOption({ label: 'Entraîneurs' })
    await page.getByRole('dialog').getByRole('button', { name: 'Réserver' }).click()
    await expect(seniors.getByText('3 joueurs éligibles')).toBeVisible()
    // Reserved, and the contradiction is flagged rather than hidden.
    await expect(seniors.getByRole('alert')).toContainText('Joris Szulc')
  })

  // The group can only narrow: a coach the categories turn away stays out,
  // greyed, with the reason.
  test('greys the group members a competition\'s categories turn away', async ({ page }) => {
    await page.goto('/competitions')
    const youth = card(page, 'Championnat jeunes')
    await youth.getByLabel('Réservée au groupe').selectOption({ label: 'Entraîneurs' })
    // No mock division belongs to the youth championship, so no team fields
    // anyone there: nothing to confirm.
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await youth.getByText(/1 joueur éligible · 2 hors catégorie/).click()
    await expect(youth.getByRole('link', { name: 'Enzo Lotz' })).toBeVisible()
    await expect(youth.getByRole('listitem').filter({ hasText: 'Quentin Colle' })).toContainText('Hors catégorie')
  })

  // The journées matrix is the third way a club fields somebody, after the
  // roster picker and the match sheet. A reservation made here has to reach it.
  test('takes a player outside the group out of the journées matrix', async ({ page }) => {
    await page.goto('/journees')
    await expect(page.locator('#other-players').getByText('Jordan Pesenti')).toBeVisible()

    // In-app navigation throughout: without the API the choice lives in
    // DataContext, and a reload would drop it.
    await page.getByRole('link', { name: 'Compétitions' }).click()
    await card(page, 'Championnat par équipes').getByLabel('Réservée au groupe')
      .selectOption({ label: 'Entraîneurs' })
    await page.getByRole('dialog').getByRole('button', { name: 'Réserver' }).click()

    await page.getByRole('link', { name: 'Journées' }).click()
    await expect(page.locator('#other-players').getByText('Jordan Pesenti')).toHaveCount(0)
  })

  test('reads the same on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/competitions')
    const seniors = card(page, 'Championnat par équipes')
    await expect(seniors.getByLabel('Réservée au groupe')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
