import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// The E2E dev server has no API; the FFTT proxy endpoints are mocked per test.
const ORGS = '**/api/fftt/organizations'
const CONTESTS = '**/api/fftt/competitions-preview*'
const PREVIEW = '**/api/fftt/divisions-preview*'
const IMPORT = '**/api/divisions/import'

// The championships FFTT runs for the chosen organisation and season: the
// divisions import picks one rather than being pinned to the men's team
// championship (#482).
const contests = {
  competitions: [
    { identifier: '1', name: 'FED_Championnat de France par Equipes Masculin', exists: true, localName: 'Championnat par équipes' },
    { identifier: 'CJ', name: 'FED_Championnat Jeunes', exists: false },
  ],
}

const organizations = [
  { id: '14', type: 'League', identifier: 'L06', name: 'GRAND-EST' },
  { id: '72', type: 'Committee', identifier: 'D68', name: 'HAUT RHIN' },
]

// Matches the mock data: season '26' with phase 'phase-26-1' (Phase 1, active).
const preview = {
  contest: { id: '18368', identifier: '1', name: 'FED_Championnat de France par Equipes Masculin' },
  // The import reads one contest, so it knows the competition (#482).
  competition: { id: 'comp-seniors', displayName: 'Championnat par équipes', exists: true },
  phaseExists: true,
  divisions: [
    { id: '234142', identifier: 'GEEP1', name: 'GE Elite P1', rank: 1, playersPerGame: 4, exists: false },
    { id: '234322', identifier: 'GE1P1', name: 'GE 1 Phase 1', rank: 2, playersPerGame: 4, exists: true },
    { id: '234612', identifier: 'GE7P1', name: 'GE 7 Phase 1', rank: 3, playersPerGame: 3, exists: false },
  ],
}

const importResult = {
  phase: { id: 'phase-26-1', seasonId: '26', name: 'Phase 1', displayName: '2025/2026 Phase 1', isArchived: false, isActive: true },
  createdPhase: false,
  created: [
    { id: '234142', phaseId: 'phase-26-1', displayName: 'GE Elite P1', rank: 5, playersPerGame: 4, isArchived: false },
    { id: '234612', phaseId: 'phase-26-1', displayName: 'GE 7 Phase 1', rank: 6, playersPerGame: 3, isArchived: false },
  ],
  skipped: [{ id: '234322', name: 'GE 1 Phase 1' }],
}

test.describe('General admin — Divisions FFTT import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('import is the primary action, manual add still available', async ({ page }) => {
    await page.goto('/divisions')
    await expect(page.getByRole('button', { name: 'Importer depuis la FFTT' })).toBeVisible()
    await page.getByRole('button', { name: 'Ajouter une division' }).click()
    await expect(page.getByRole('heading', { name: 'Ajouter une division' })).toBeVisible()
  })

  test('previews and imports divisions, skipping existing ones', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))
    await page.route(IMPORT, (route) => route.fulfill({ json: importResult }))

    await page.goto('/divisions')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await expect(page.getByRole('heading', { name: 'Importer les divisions FFTT' })).toBeVisible()

    await page.getByLabel('Organisation', { exact: true }).selectOption('14')
    // Season defaults to the active one (2025/2026), phase to Phase 1.
    await expect(page.getByLabel('Saison')).toHaveValue('26')
    // Which championship's divisions — several exist, so one must be chosen.
    // The picker separates the ones we already hold from the rest (#482).
    const contest = page.getByLabel('Compétition', { exact: true })
    await expect(contest.locator('optgroup[label="Déjà importées"] option'))
      .toHaveText(['Championnat par équipes'])
    await expect(contest.locator('optgroup[label="Pas encore importées"] option'))
      .toHaveText(['FED_Championnat Jeunes'])
    await contest.selectOption('1')
    await page.getByRole('button', { name: 'Rechercher les divisions' }).click()

    await expect(page.getByText('FED_Championnat de France par Equipes Masculin')).toBeVisible()
    await expect(page.getByText('1. GE Elite P1')).toBeVisible()
    await expect(page.getByText('Déjà présente')).toBeVisible()
    await expect(page.getByText('3 j/match')).toBeVisible()

    // Each division is tickable, and the ones that would be acted on start
    // ticked — unlike the competitions list, this IS the championship chosen.
    await expect(page.getByRole('checkbox', { name: 'GE Elite P1' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'GE 1 Phase 1' })).toBeDisabled()

    // Unticking one takes it out of the count.
    await page.getByRole('checkbox', { name: 'GE 7 Phase 1' }).uncheck()
    await expect(page.getByRole('button', { name: 'Importer 1 division' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'GE 7 Phase 1' }).check()

    await page.getByRole('button', { name: 'Importer 2 divisions' }).click()
    await expect(page.getByText('2 divisions importées.')).toBeVisible()

    await page.getByRole('button', { name: 'Fermer' }).click()
    // A successful import sets the page filter to the org just imported
    // (#259) — this mock's preview response is static and doesn't reflect
    // the newly-created divisions as existing, so reset to "Toutes" to see
    // them (a real FFTT response would already show them as existing here).
    await page.getByLabel('Organisation', { exact: false }).selectOption('')
    await expect(page.getByRole('cell', { name: 'GE Elite P1' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'GE 7 Phase 1' })).toBeVisible()
  })

  test('reports when no championship exists for the selection', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ status: 404, json: { error: 'no_contest' } }))

    await page.goto('/divisions')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Organisation', { exact: true }).selectOption('72')
    await page.getByLabel('Compétition', { exact: true }).selectOption('1')
    await page.getByRole('button', { name: 'Rechercher les divisions' }).click()
    await expect(page.getByText('Aucun championnat trouvé')).toBeVisible()
  })

  test('reports when the FFTT API is unreachable', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ status: 502, json: { error: 'fftt_unavailable' } }))

    await page.goto('/divisions')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Organisation', { exact: true }).selectOption('14')
    await page.getByLabel('Compétition', { exact: true }).selectOption('1')
    await page.getByRole('button', { name: 'Rechercher les divisions' }).click()
    await expect(page.getByText(/Impossible de contacter l’API FFTT/)).toBeVisible()
  })

  test('warns when the phase will be created', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) =>
      route.fulfill({ json: { ...preview, phaseExists: false } }),
    )

    await page.goto('/divisions')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Organisation', { exact: true }).selectOption('14')
    await page.getByLabel('Phase', { exact: true }).selectOption('2')
    await page.getByLabel('Compétition', { exact: true }).selectOption('1')
    await page.getByRole('button', { name: 'Rechercher les divisions' }).click()
    await expect(page.getByText(/La phase « Phase 2 » n’existe pas encore/)).toBeVisible()
  })
})

test.describe('General admin — Divisions organization filter', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  // Matches the mock data: 198609..198907 (GE 1..GE 7) all exist in phase-26-1.
  const localPreview = {
    contest: { id: '18368', identifier: '1', name: 'FED_Championnat de France par Equipes Masculin' },
    competition: { id: 'comp-seniors', displayName: 'Championnat par équipes', exists: true },
    phaseExists: true,
    divisions: [
      { id: '198609', identifier: 'GE1P1', name: 'GE 1', rank: 1, playersPerGame: 4, exists: true },
      { id: '198755', identifier: 'GE2P1', name: 'GE 2', rank: 2, playersPerGame: 4, exists: true },
      { id: '198305', identifier: 'GE3P1', name: 'GE 3', rank: 3, playersPerGame: 4, exists: true },
    ],
  }

  test('narrows the division list to the selected organization', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ json: localPreview }))

    await page.goto('/divisions')
    await expect(page.getByRole('cell', { name: 'GE 1', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'GE 7', exact: true })).toBeVisible()

    await page.getByLabel('Organisation', { exact: false }).selectOption('14')
    await expect(page.getByRole('cell', { name: 'GE 1', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'GE 3', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'GE 7', exact: true })).toHaveCount(0)

    await page.getByLabel('Organisation', { exact: false }).selectOption('')
    await expect(page.getByRole('cell', { name: 'GE 7', exact: true })).toBeVisible()
  })

  test('preselects the import dialog’s organization from the page filter (#259)', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ json: localPreview }))

    await page.goto('/divisions')
    await page.getByLabel('Organisation', { exact: false }).selectOption('14')
    await expect(page.getByRole('cell', { name: 'GE 1', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await expect(page.getByLabel('Organisation', { exact: true })).toHaveValue('14')
  })

  test('sets the page filter to the imported organization after a successful import (#259)', async ({ page }) => {
    await page.route(ORGS, (route) => route.fulfill({ json: { organizations } }))
    await page.route(CONTESTS, (route) => route.fulfill({ json: contests }))
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))
    await page.route(IMPORT, (route) => route.fulfill({ json: importResult }))

    await page.goto('/divisions')
    // No page-level filter selected yet.
    await expect(page.getByLabel('Organisation', { exact: false })).toHaveValue('')

    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Organisation', { exact: true }).selectOption('14')
    await page.getByLabel('Compétition', { exact: true }).selectOption('1')
    await page.getByRole('button', { name: 'Rechercher les divisions' }).click()
    await page.getByRole('button', { name: 'Importer 2 divisions' }).click()
    await expect(page.getByText('2 divisions importées.')).toBeVisible()

    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByLabel('Organisation', { exact: false })).toHaveValue('14')
  })
})
