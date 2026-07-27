import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// The E2E dev server has no API; the FFTT groups endpoints are mocked per test.
const PREVIEW = '**/api/fftt/groups-preview*'
const IMPORT = '**/api/groups/import'

// Matches the mock data: division 198609 (GE 1, phase-26-1 2025/2026 Phase 1,
// active) already has group-1 (Poule 1, 8 teams incl. PPA Rixheim 1).
const preview = {
  divisionId: '198609',
  divisionName: 'GE 1',
  groups: [
    { id: 'group-1', number: 1, exists: true },
    { id: 'fftt-pool-99', number: 2, exists: false },
  ],
}

const importResult = {
  created: [{ id: 'fftt-pool-99', divisionId: '198609', number: 2, teamIds: [], isArchived: false }],
  skipped: [{ id: 'group-1', number: 1 }],
}

test.describe('General admin — Groups screen and FFTT import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    // 198609 is an FFTT-aligned division id (#275), so the client queries
    // apiv2 for its pools before hitting our API. Kept hermetic by answering
    // with an empty pool list — the preview itself is mocked below.
    await page.route('https://apiv2.fftt.com/api/graphql', (route) =>
      route.fulfill({ json: { data: { pools: { edges: [] } } } }))
  })

  test('scopes to a phase then a division, with no Division/Phase table columns', async ({ page }) => {
    await page.goto('/groupes')

    await expect(page.getByText('Saison 2025/2026 Phase 1')).toBeVisible()
    await expect(page.getByText('Sélectionnez une division pour afficher ses groupes.')).toBeVisible()

    await page.getByLabel('Division').selectOption({ label: 'GE 1' })

    await expect(page.getByRole('columnheader', { name: 'N° groupe' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Division' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Phase' })).toHaveCount(0)
    await expect(page.getByRole('cell', { name: '1', exact: true })).toBeVisible()
  })

  test('previews and imports a division’s FFTT groups', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))
    let importBody: { divisionId: string; pools: unknown[] } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: importResult })
    })

    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })
    await page.getByRole('button', { name: 'Importer les groupes FFTT' }).click()

    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('heading', { name: 'Importer les groupes FFTT' })).toBeVisible()
    await expect(dialog.getByText('GE 1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Poule 1')).toBeVisible()
    await expect(dialog.getByText('Déjà présente')).toBeVisible()
    await expect(dialog.getByText('Poule 2')).toBeVisible()

    await page.getByRole('button', { name: 'Importer 1 groupe' }).click()
    await expect(page.getByText('1 groupe importé.')).toBeVisible()

    expect(importBody).toEqual({ divisionId: '198609', pools: [] })
  })

  test('reports when the FFTT API is unreachable', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ status: 502, json: { error: 'fftt_unavailable' } }))

    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })
    await page.getByRole('button', { name: 'Importer les groupes FFTT' }).click()
    await expect(page.getByText(/Impossible de contacter l’API FFTT/)).toBeVisible()
  })
})

test.describe('Player — Groups screen', () => {
  test('players see no import action', async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })
    await expect(page.getByRole('button', { name: 'Importer les groupes FFTT' })).toHaveCount(0)
  })
})
