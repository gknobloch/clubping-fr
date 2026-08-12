import { test, expect } from '@playwright/test'
import { loginAs, acceptConfirm } from './helpers'

// The dev server has no API, so the FFTT endpoints are mocked per test.
const FFTT_CHECK = '**/api/seasons/fftt-current'
const FFTT_IMPORT = '**/api/seasons/import-current'

test.describe('General admin — Saisons', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('lists seasons with their status', async ({ page }) => {
    await page.goto('/saisons')
    await expect(page.getByRole('heading', { name: 'Saisons' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '2025/2026' })).toBeVisible()
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
  })

  test('rejects an invalid season name on creation', async ({ page }) => {
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Ajouter une saison' }).click()
    await page.getByLabel(/Nom/).fill('sefsd')
    await expect(page.getByText(/années consécutives/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  test('rejects a duplicate season', async ({ page }) => {
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Ajouter une saison' }).click()
    await page.getByLabel(/Nom/).fill('2025/2026')
    await expect(page.getByText('Cette saison existe déjà.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  test('creates a valid upcoming season', async ({ page }) => {
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Ajouter une saison' }).click()
    await page.getByLabel(/Nom/).fill('2027/2028')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('cell', { name: '2027/2028' })).toBeVisible()
    await expect(page.getByText('À venir')).toBeVisible()
  })

  test('checks FFTT on demand and imports the current season', async ({ page }) => {
    await page.route(FFTT_CHECK, (route) =>
      route.fulfill({
        json: { id: '27', displayName: '2026/2027', exists: false },
      }),
    )
    await page.route(FFTT_IMPORT, (route) =>
      route.fulfill({
        json: {
          season: { id: '27', displayName: '2026/2027', status: 'active' },
          archivedSeasonIds: ['26'],
        },
      }),
    )
    await page.goto('/saisons')
    // Nothing happens until the check is requested.
    await expect(page.getByText(/Nouvelle saison FFTT disponible/)).not.toBeVisible()
    await page.getByRole('button', { name: 'Vérifier la saison FFTT' }).click()
    await expect(page.getByText(/Nouvelle saison FFTT disponible/)).toBeVisible()
    await expect(page.getByText('2026/2027').first()).toBeVisible()
    await page.getByRole('button', { name: 'Importer' }).click()

    // Banner replaced by a confirmation, new season active, previous one archived.
    await expect(page.getByText(/Nouvelle saison FFTT disponible/)).not.toBeVisible()
    await expect(page.getByText(/importée et activée/)).toBeVisible()
    await expect(page.getByRole('cell', { name: '2026/2027' })).toBeVisible()
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: '2025/2026' })).not.toBeVisible()
    await page.getByLabel(/Afficher les saisons archivées/).check()
    await expect(page.getByRole('cell', { name: '2025/2026' })).toBeVisible()
  })

  test('reports when the FFTT season is already active', async ({ page }) => {
    await page.route(FFTT_CHECK, (route) =>
      route.fulfill({
        json: { id: '26', displayName: '2025/2026', exists: true, status: 'active' },
      }),
    )
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Vérifier la saison FFTT' }).click()
    await expect(page.getByText(/déjà active — rien à faire/)).toBeVisible()
    await expect(page.getByText(/Nouvelle saison FFTT disponible/)).not.toBeVisible()
  })

  test('offers to activate the FFTT season when it exists but is not active (#223)', async ({ page }) => {
    await page.route(FFTT_CHECK, (route) =>
      route.fulfill({
        json: { id: '26', displayName: '2025/2026', exists: true, status: 'archived' },
      }),
    )
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Vérifier la saison FFTT' }).click()
    await expect(page.getByText(/existe mais n’est pas active/)).toBeVisible()
    await page.getByRole('button', { name: 'Activer' }).click()
    await expect(page.getByText(/Saison 2025\/2026 activée/)).toBeVisible()
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
  })

  test('activating a season switches the active phase to that season (#227)', async ({ page }) => {
    // Client-side navigation only: a full page load resets the mock data.
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Ajouter une saison' }).click()
    await page.getByLabel(/Nom/).fill('2026/2027')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('cell', { name: '2026/2027' })).toBeVisible()

    // Give the new season two inactive phases: the switch must pick the most
    // recent one (Phase 2 over Phase 1).
    await page.getByRole('link', { name: 'Phases' }).click()
    for (const phaseName of ['Phase 1', 'Phase 2']) {
      await page.getByRole('button', { name: 'Ajouter une phase' }).click()
      await page.getByLabel('Saison').selectOption({ label: '2026/2027' })
      await page.getByLabel('Phase', { exact: true }).selectOption(phaseName)
      await page.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(page.getByRole('cell', { name: `2026/2027 ${phaseName}` })).toBeVisible()
    }

    // Activate the season: the note announces the phase switch, and the
    // active phase follows.
    await page.getByRole('link', { name: 'Saisons' }).click()
    await page.getByRole('row', { name: /2026\/2027/ }).getByRole('button', { name: 'Modifier' }).click()
    await page.getByRole('radio', { name: 'Active' }).check()
    await expect(page.getByText('2026/2027 · Phase 2')).toBeVisible()
    await expect(page.getByText(/La phase 2025\/2026 Phase 1 sera archivée et 2026\/2027 Phase 2 sera activée/)).toBeVisible()
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await page.getByRole('link', { name: 'Phases' }).click()
    await expect(page.getByText('Active', { exact: true })).toHaveCount(1)
    await expect(
      page.getByRole('row', { name: /2026\/2027 Phase 2/ }).getByText('Active', { exact: true }),
    ).toBeVisible()
  })

  test('an archived season can be modified to recover from a mistake (#223)', async ({ page }) => {
    await page.goto('/saisons')
    // Archive the only season, then bring it back via Modifier.
    await page.getByRole('button', { name: 'Archiver' }).click()
    await acceptConfirm(page, 'Archiver')
    await page.getByLabel(/Afficher les saisons archivées/).check()
    await expect(page.getByText('Archivée', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Modifier' }).click()
    await page.getByRole('radio', { name: 'Active' }).check()
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
    await expect(page.getByText('Archivée', { exact: true })).not.toBeVisible()
  })

  test('reports when the FFTT API is unreachable', async ({ page }) => {
    await page.route(FFTT_CHECK, (route) => route.fulfill({ status: 502, json: { error: 'fftt_unavailable' } }))
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Vérifier la saison FFTT' }).click()
    await expect(page.getByText(/Impossible de contacter l’API FFTT/)).toBeVisible()
  })
})
