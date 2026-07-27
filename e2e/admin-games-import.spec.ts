import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// The E2E dev server has no API; the FFTT games endpoints are mocked per test.
const PREVIEW = '**/api/fftt/games-preview*'
const IMPORT = '**/api/games/import'

// Matches the mock data: PPA Rixheim 1 (team-1) plays in group-1 (division
// div-1 "GE1"), phase-1 (2025/2026 Phase 1, active).
const previewOneGroup = {
  groups: [
    {
      groupId: 'group-1', groupNumber: 1, divisionName: 'GE1',
      rounds: 7, matches: 28, newMatchDays: 3, newGames: 12, existingGames: 16, newTeams: 3,
    },
  ],
  totals: { newClubs: 2, newTeams: 3 },
}

const importResult = {
  createdClubs: [
    { id: 'club-fftt-06570024', affiliationNumber: '06570024', displayName: 'THIONVILLE TT', isArchived: false, addresses: [], channels: [] },
  ],
  createdTeams: [
    {
      id: '5834', clubId: 'club-fftt-06570024', phaseId: 'phase-1', number: 1, divisionId: 'div-1', groupId: 'group-1',
      gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
    },
  ],
  groups: [],
  createdMatchDays: [
    { id: 'md-fftt-group-1-r8', groupId: 'group-1', number: 8, date: '2026-03-14' },
  ],
  updatedMatchDays: [
    { id: 'md-g1-1', groupId: 'group-1', number: 1, date: '2025-09-28' },
  ],
  createdGames: [
    { id: '900001', matchDayId: 'md-fftt-group-1-r8', homeTeamId: 'team-1', awayTeamId: '5834', date: '2026-03-14' },
  ],
  updatedGames: [],
  skippedGroups: [],
  existingGames: 16,
  skippedMatches: 0,
}

test.describe('General admin — Games FFTT import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    // Hermetic guard: the client only queries apiv2 for FFTT-aligned (numeric)
    // division ids — the mock data has none, so this must never be hit.
    await page.route('https://apiv2.fftt.com/api/graphql', (route) => route.abort())
  })

  test('imports a team’s pool calendar from /equipes', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: previewOneGroup }))
    let importBody: { groupIds: string[] } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: importResult })
    })

    await page.goto('/equipes')
    const card = page.locator('div').filter({ hasText: 'PPA Rixheim 1' }).filter({ hasText: 'Quentin Colle' }).last()
    await card.getByRole('button', { name: 'Importer les matchs' }).click()

    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('heading', { name: 'Importer les matchs FFTT' })).toBeVisible()
    await expect(dialog.getByText('PPA Rixheim 1 — calendrier de sa poule')).toBeVisible()
    await expect(dialog.getByText('GE1', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/7 journées · 12 nouveaux matchs · 16 déjà présents · 3 adversaires à créer/)).toBeVisible()
    await expect(page.getByText(/Les équipes adverses manquantes \(3, dont 2 nouveaux clubs\)/)).toBeVisible()

    await page.getByRole('button', { name: 'Importer 12 matchs' }).click()
    await expect(page.getByText('1 match importé, 1 journée créée.')).toBeVisible()
    await expect(page.getByText('1 journée redatée d’après la FFTT.')).toBeVisible()
    await expect(page.getByText('Adversaires créés : 1 équipe et 1 club.')).toBeVisible()

    expect(importBody).toEqual({ groupIds: ['group-1'], pools: [] })
  })

  test('imports one group’s calendar from /groupes (#245)', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: previewOneGroup }))
    let importBody: { groupIds: string[] } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: importResult })
    })

    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE1' })

    const row = page.locator('tr').filter({ hasText: 'PPA Rixheim 1' })
    await row.getByRole('button', { name: 'Importer les matchs' }).click()

    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('heading', { name: 'Importer les matchs FFTT' })).toBeVisible()
    await expect(dialog.getByText(/GE1 · Groupe 1 — calendrier de cette poule/)).toBeVisible()
    await expect(dialog.getByText(/7 journées · 12 nouveaux matchs · 16 déjà présents · 3 adversaires à créer/)).toBeVisible()

    await page.getByRole('button', { name: 'Importer 12 matchs' }).click()
    await expect(page.getByText('1 match importé, 1 journée créée.')).toBeVisible()

    expect(importBody).toEqual({ groupIds: ['group-1'], pools: [] })
  })

  test('imports the whole phase from /journees, flagging unimportable groups', async ({ page }) => {
    let previewedGroupIds: string[] = []
    await page.route(PREVIEW, (route) => {
      previewedGroupIds = (route.request().postDataJSON() as { groupIds: string[] }).groupIds
      return route.fulfill({
        json: {
          groups: [
            previewOneGroup.groups[0],
            { groupId: 'group-2', groupNumber: 2, divisionName: 'GE2', error: 'pool_not_found' },
            { groupId: 'group-3', groupNumber: 3, divisionName: 'GE3', error: 'calendar_not_published' },
          ],
          totals: previewOneGroup.totals,
        },
      })
    })

    await page.goto('/journees')
    await page.getByRole('button', { name: 'Importer les matchs FFTT' }).click()

    await expect(page.getByText(/toutes les poules avec équipes/)).toBeVisible()
    await expect(page.getByText('GE1', { exact: true })).toBeVisible()
    // Error rows are named by division · poule, never by raw group id.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('GE2', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Poule inconnue côté FFTT')).toBeVisible()
    await expect(dialog.getByText('GE3', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Calendrier pas encore publié par la FFTT')).toBeVisible()
    await expect(dialog.getByText(/Groupe group-/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Importer 12 matchs' })).toBeEnabled()

    expect(previewedGroupIds).toContain('group-1')
    expect(previewedGroupIds).toContain('group-2')
  })

  test('reports when the FFTT API is unreachable', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ status: 502, json: { error: 'fftt_unavailable' } }))

    await page.goto('/journees')
    await page.getByRole('button', { name: 'Importer les matchs FFTT' }).click()
    await expect(page.getByText(/Impossible de contacter l’API FFTT/)).toBeVisible()
  })
})

test.describe('Player — Games FFTT import', () => {
  test('players see no import actions', async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/equipes')
    await expect(page.getByRole('button', { name: 'Importer les matchs' })).toHaveCount(0)
    await page.goto('/journees')
    await expect(page.getByRole('button', { name: 'Importer les matchs FFTT' })).toHaveCount(0)
    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE1' })
    await expect(page.getByRole('button', { name: 'Importer les matchs' })).toHaveCount(0)
  })
})
