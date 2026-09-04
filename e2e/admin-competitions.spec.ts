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
    isCategoryLocked: false, sortOrder: 4, isArchived: false,
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
  // Every competition is listed, eligible or not: the answer a captain wants is
  // "and the youth championship?", which a list of only the yeses cannot give.
  const section = (page: import('@playwright/test').Page) =>
    page.getByRole('heading', { name: 'Compétitions' }).locator('xpath=..')

  test('a cadet is eligible to his category and to the adults', async ({ page }) => {
    await loginAs(page, 'admin')
    // Samuel Canemolla, C1 in the mock — team 6.
    await page.goto('/joueurs/p2-player-39')
    await expect(page.getByText('Cadet (C1)')).toBeVisible()

    const competitions = section(page)
    await expect(competitions.locator('li').filter({ hasText: 'Championnat par équipes' }))
      .toContainText('Éligible · Par sa catégorie')
    await expect(competitions.locator('li').filter({ hasText: 'Championnat jeunes' }))
      .toContainText('Éligible · Par sa catégorie')
    await expect(competitions.locator('li').filter({ hasText: 'Championnat vétérans' }))
      .toContainText('Non éligible · Hors catégorie')
  })

  test('a veteran is eligible to the veterans and not to the youth', async ({ page }) => {
    await loginAs(page, 'admin')
    // Hervé Ceroni, V55 in the mock.
    await page.goto('/joueurs/p2-player-7')
    await expect(page.getByText('Vétéran 55')).toBeVisible()

    const competitions = section(page)
    await expect(competitions.locator('li').filter({ hasText: 'Championnat vétérans' }))
      .toContainText('Éligible · Par sa catégorie')
    await expect(competitions.locator('li').filter({ hasText: 'Championnat jeunes' }))
      .toContainText('Non éligible · Hors catégorie')
  })
})

test.describe('Club admin — amending the default mapping (#482)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'canaque')
  })

  /** One cell of the desktop grid, named after the player and the competition. */
  const cell = (page: import('@playwright/test').Page, player: string, competition: string) =>
    page.getByRole('button', { name: new RegExp(`^${player} — ${competition} :`) })

  test('has its own screen in the navigation, not a section buried in the club', async ({ page }) => {
    await page.goto('/club')
    await expect(page.getByRole('region', { name: 'Compétitions' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Compétitions' }).click()
    await expect(page).toHaveURL('/competitions')
    await expect(page.getByRole('heading', { name: 'Compétitions', level: 1 })).toBeVisible()
    // The club's own screen, not the general admin's global configuration.
    await expect(page.getByRole('button', { name: 'Importer depuis la FFTT' })).toHaveCount(0)
  })

  test('shows the whole club against every competition as one grid', async ({ page }) => {
    await page.goto('/competitions')
    await expect(page.getByRole('columnheader', { name: /Championnat par équipes/ })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Championnat jeunes/ })).toContainText('Réservée')
    await expect(page.getByRole('columnheader', { name: /Championnat vétérans/ })).toContainText('Ouverte')

    // Samuel Canemolla is a cadet: in for the youth championship, out of the
    // veterans, and the senior one lists no category so it admits everyone.
    await expect(cell(page, 'Samuel Canemolla', 'Championnat jeunes'))
      .toHaveAccessibleName(/Par sa catégorie/)
    await expect(cell(page, 'Samuel Canemolla', 'Championnat vétérans'))
      .toHaveAccessibleName(/Hors catégorie/)
  })

  test('offers no way into a competition reserved to its categories', async ({ page }) => {
    await page.goto('/competitions')
    // Joris Szulc is a senior, and the youth championship is locked.
    const locked = cell(page, 'Joris Szulc', 'Championnat jeunes')
    await expect(locked).toBeDisabled()
    await expect(locked).not.toHaveAccessibleName(/Ajouter/)
    // Excluding one of its own stays possible.
    await expect(cell(page, 'Samuel Canemolla', 'Championnat jeunes'))
      .toHaveAccessibleName(/Exclure/)
  })

  test('adds a licensee the default turns away, then puts them back', async ({ page }) => {
    await page.goto('/competitions')
    const veterans = () => cell(page, 'Joris Szulc', 'Championnat vétérans')
    await expect(veterans()).toHaveAccessibleName(/Hors catégorie — Ajouter/)
    await veterans().click()

    await expect(veterans()).toHaveAccessibleName(/Ajouté par le club — Rétablir le défaut/)
    await veterans().click()
    await expect(veterans()).toHaveAccessibleName(/Hors catégorie — Ajouter/)
  })

  // Eligibility never empties a squad (#482), so an exclusion can contradict a
  // team sheet in silence. The grid says so, and asks before making it.
  test('warns before excluding someone an équipe already fields', async ({ page }) => {
    await page.goto('/competitions')
    // Joris Szulc is on the roster of a team playing the senior championship.
    await cell(page, 'Joris Szulc', 'Championnat par équipes').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText("Déjà dans l'équipe")
    await expect(dialog).toContainText("ne le retire d'aucune équipe ni d'aucune composition")
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(cell(page, 'Joris Szulc', 'Championnat par équipes'))
      .toHaveAccessibleName(/Par sa catégorie/)

    await cell(page, 'Joris Szulc', 'Championnat par équipes').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Exclure' }).click()
    // Excluded, and the contradiction is now flagged rather than hidden.
    await expect(cell(page, 'Joris Szulc', 'Championnat par équipes'))
      .toHaveAccessibleName(/Exclu par le club — Déjà dans l'équipe/)
  })

  test('filters the club by category', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('combobox', { name: 'Catégorie' }).selectOption({ label: 'Cadet' })
    await expect(page.getByRole('link', { name: /Samuel Canemolla/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Joris Szulc/ })).toHaveCount(0)
  })

  test('selects what the filter shows and applies one action to all of it', async ({ page }) => {
    await page.goto('/competitions')
    // The young squad: benjamins, minimes, cadets and juniors.
    await page.getByRole('combobox', { name: 'Catégorie' }).selectOption({ label: 'Minime' })
    await page.getByRole('checkbox', { name: 'Tout sélectionner' }).check()
    await expect(page.getByText(/^\d+ sélectionnés?$/)).toBeVisible()

    await page.getByRole('combobox', { name: 'Compétition à modifier' }).selectOption({ label: 'Championnat vétérans' })
    // Minimes are out of the veterans' categories, and it is not locked.
    const add = page.getByRole('button', { name: /^Ajouter \(\d+\)$/ })
    await expect(add).toBeEnabled()
    await add.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click()

    await expect(page.getByRole('status')).toContainText('modifiés')
    // And the grid now says the club put them there.
    await expect(page.getByRole('button', { name: /Championnat vétérans/ }).first())
      .toHaveAccessibleName(/Ajouté par le club/)
  })

  test('never bulk-adds into a competition reserved to its categories', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('combobox', { name: 'Catégorie' }).selectOption({ label: 'Senior' })
    await page.getByRole('checkbox', { name: 'Tout sélectionner' }).check()
    await page.getByRole('combobox', { name: 'Compétition à modifier' }).selectOption({ label: 'Championnat jeunes' })
    await expect(page.getByRole('button', { name: 'Ajouter (0)' })).toBeDisabled()
  })

  // The grid answers "who", and the next question is always about one of them.
  test('leads from a row to the player behind it', async ({ page }) => {
    await page.goto('/competitions')
    await page.getByRole('link', { name: /Samuel Canemolla/ }).click()
    await expect(page).toHaveURL('/joueurs/p2-player-39')
    await expect(page.getByRole('heading', { name: 'Samuel Canemolla' })).toBeVisible()
  })

  test('falls back to the per-competition list on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/competitions')
    await expect(page.getByRole('table')).toBeHidden()

    const club = page.getByRole('region', { name: 'Compétitions' })
    await club.getByLabel('Compétition', { exact: true }).selectOption({ label: 'Championnat vétérans' })
    const row = club.locator('li').filter({ hasText: 'Joris Szulc' })
    await expect(row).toContainText('Hors catégorie')
    await expect(row.getByRole('link')).toHaveAttribute('href', '/joueurs/p2-player-5')
    await row.getByRole('button', { name: 'Ajouter' }).click()
    await expect(club.locator('li').filter({ hasText: 'Joris Szulc' }))
      .toContainText('Ajouté par le club')
  })
})

test.describe('Club admin — amending from the player screen (#482)', () => {
  const section = (page: import('@playwright/test').Page) =>
    page.getByRole('heading', { name: 'Compétitions' }).locator('xpath=..')

  test('lists every competition with the verdict, and amends it in place', async ({ page }) => {
    await loginAs(page, 'canaque')
    // Joris Szulc, a senior of the club.
    await page.goto('/joueurs/p2-player-2')
    const competitions = section(page)

    // Every competition, eligible or not — the point is to be able to act on
    // the ones that turn him away.
    const veterans = competitions.locator('li').filter({ hasText: 'Championnat vétérans' })
    await expect(veterans).toContainText('Non éligible · Hors catégorie')
    await veterans.getByRole('button', { name: 'Ajouter' }).click()
    await expect(veterans).toContainText('Éligible · Ajouté par le club')

    await veterans.getByRole('button', { name: 'Rétablir le défaut' }).click()
    await expect(veterans).toContainText('Non éligible · Hors catégorie')

    // And the other way round, on one the default admits — where the player is
    // already on a roster, so the exclusion has to be confirmed first (#482).
    const seniors = competitions.locator('li').filter({ hasText: 'Championnat par équipes' })
    await seniors.getByRole('button', { name: 'Exclure' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText("Déjà dans l'équipe")
    await dialog.getByRole('button', { name: 'Exclure' }).click()
    await expect(seniors).toContainText('Non éligible · Exclu par le club')
    // The contradiction is stated rather than silently created.
    await expect(seniors).toContainText("Déjà dans l'équipe")
  })

  test('says a reserved competition cannot be joined, rather than offering it', async ({ page }) => {
    await loginAs(page, 'canaque')
    await page.goto('/joueurs/p2-player-2')
    const youth = section(page).locator('li').filter({ hasText: 'Championnat jeunes' })
    await expect(youth).toContainText('Compétition réservée')
    await expect(youth.getByRole('button')).toHaveCount(0)
  })

  test('a club admin has the controls on the player screen', async ({ page }) => {
    await loginAs(page, 'canaque')
    await page.goto('/joueurs/p2-player-2')
    await expect(section(page).getByRole('button', { name: 'Exclure' }).first()).toBeVisible()
  })

  test('a member who does not administer the club only reads the verdicts', async ({ page }) => {
    await loginAs(page, 'Szulc')
    await page.goto('/joueurs/p2-player-2')
    const competitions = section(page)
    await expect(competitions).toContainText('Championnat vétérans')
    await expect(competitions.getByRole('button')).toHaveCount(0)
  })
})
