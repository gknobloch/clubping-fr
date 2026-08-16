import { test, expect } from '@playwright/test'
import { loginAs, runRowAction } from './helpers'

// The E2E dev server has no API; the FFTT games endpoints are mocked per test.
const PREVIEW = '**/api/fftt/games-preview*'
const IMPORT = '**/api/games/import'

// Matches the mock data: PPA Rixheim 1 (team-1) plays in group-1 (division
// 198609 "GE 1"), phase-26-1 (2025/2026 Phase 1, active).
const previewOneGroup = {
  groups: [
    {
      groupId: 'group-1', groupNumber: 1, divisionName: 'GE 1',
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
      id: '5834', clubId: 'club-fftt-06570024', phaseId: 'phase-26-1', number: 1, divisionId: '198609', groupId: 'group-1',
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
    // The mock data is FFTT-aligned since #275, so the games preview really
    // runs its three-tier pool resolution before hitting our API. Kept
    // hermetic: dafunker (tiers 0-1) answers empty, and apiv2 (tier 2)
    // answers with a single poule 1 — enough for selectPoolForGroup to
    // resolve every mock group, which are all numbered 1. Without a resolved
    // pool the preview short-circuits to "FFTT unreachable" and never reaches
    // the mocked endpoints below.
    await page.route('**/fftt.dafunker.com/**', (route) =>
      route.fulfill({ body: '', contentType: 'text/xml' }))
    await page.route('https://apiv2.fftt.com/api/graphql', (route) =>
      route.fulfill({
        json: { data: { pools: { edges: [{ node: { id: '/api/pools/9001', name: '1', sportMatches: { edges: [] } } }] } } },
      }))
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
    await runRowAction(page, card, 'Importer les matchs')

    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('heading', { name: 'Importer les matchs FFTT' })).toBeVisible()
    await expect(dialog.getByText('PPA Rixheim 1 — calendrier de sa poule')).toBeVisible()
    await expect(dialog.getByText('GE 1', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/7 journées · 12 nouveaux matchs · 16 déjà présents · 3 adversaires à créer/)).toBeVisible()
    await expect(page.getByText(/Les équipes adverses manquantes \(3, dont 2 nouveaux clubs\)/)).toBeVisible()

    await page.getByRole('button', { name: 'Importer 12 matchs' }).click()
    await expect(page.getByText('1 match importé, 1 journée créée.')).toBeVisible()
    await expect(page.getByText('1 journée redatée d’après la FFTT.')).toBeVisible()
    await expect(page.getByText('Adversaires créés : 1 équipe et 1 club.')).toBeVisible()

    // The import sends exactly the pools the preview resolved (the tier-2
    // apiv2 poule 1 mocked above), never a re-fetched list. From /equipes it
    // is also scoped to that one team (#287) — its pool's other fixtures are
    // not imported.
    expect(importBody).toEqual({
      groupIds: ['group-1'],
      teamId: 'team-1',
      pools: [{ divisionId: '198609', pools: [{ id: '9001', poolNumber: 1, matches: [] }] }],
    })
  })

  test('imports one group’s calendar from /groupes (#245)', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: previewOneGroup }))
    let importBody: { groupIds: string[] } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: importResult })
    })

    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })

    const row = page.locator('tr').filter({ hasText: 'PPA Rixheim 1' })
    await row.getByRole('button', { name: 'Importer les matchs' }).click()

    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('heading', { name: 'Importer les matchs FFTT' })).toBeVisible()
    await expect(dialog.getByText(/GE 1 · Groupe 1 — calendrier de cette poule/)).toBeVisible()
    await expect(dialog.getByText(/7 journées · 12 nouveaux matchs · 16 déjà présents · 3 adversaires à créer/)).toBeVisible()

    await page.getByRole('button', { name: 'Importer 12 matchs' }).click()
    await expect(page.getByText('1 match importé, 1 journée créée.')).toBeVisible()

    // The import sends exactly the pools the preview resolved (the tier-2
    // apiv2 poule 1 mocked above), never a re-fetched list.
    expect(importBody).toEqual({
      groupIds: ['group-1'],
      pools: [{ divisionId: '198609', pools: [{ id: '9001', poolNumber: 1, matches: [] }] }],
    })
  })

  test('imports the whole phase from /journees, flagging unimportable groups', async ({ page }) => {
    let previewedGroupIds: string[] = []
    await page.route(PREVIEW, (route) => {
      previewedGroupIds = (route.request().postDataJSON() as { groupIds: string[] }).groupIds
      return route.fulfill({
        json: {
          groups: [
            previewOneGroup.groups[0],
            { groupId: 'group-2', groupNumber: 2, divisionName: 'GE 2', error: 'pool_not_found' },
            { groupId: 'group-3', groupNumber: 3, divisionName: 'GE 3', error: 'calendar_not_published' },
          ],
          totals: previewOneGroup.totals,
        },
      })
    })

    await page.goto('/journees')
    await page.getByRole('button', { name: 'Importer les matchs FFTT' }).click()

    await expect(page.getByText(/toutes les poules avec équipes/)).toBeVisible()
    await expect(page.getByText('GE 1', { exact: true })).toBeVisible()
    // Error rows are named by division · poule, never by raw group id.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('GE 2', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Poule inconnue côté FFTT')).toBeVisible()
    await expect(dialog.getByText('GE 3', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Calendrier pas encore publié par la FFTT')).toBeVisible()
    await expect(dialog.getByText(/Groupe group-/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Importer 12 matchs' })).toBeEnabled()

    expect(previewedGroupIds).toContain('group-1')
    expect(previewedGroupIds).toContain('group-2')
  })

  // #289: a game already present on another date is reported, never silently
  // re-dated. The import only carries updateDates when the box is ticked.
  test('offers to take FFTT dates for games already present on another date', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({
      json: {
        groups: [{
          groupId: 'group-1', groupNumber: 1, divisionName: 'GE 1',
          rounds: 7, matches: 28, newMatchDays: 0, newGames: 0,
          existingGames: 28, dateMismatches: 3, newTeams: 0,
        }],
        totals: { newClubs: 0, newTeams: 0 },
      },
    }))
    let body: { updateDates?: boolean } | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: { ...importResult, createdGames: [], createdMatchDays: [], updatedMatchDays: [] } })
    })

    await page.goto('/equipes')
    await runRowAction(page, page, 'Importer les matchs')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('3 à une autre date')).toBeVisible()

    // Nothing new to add and the box unticked: there is genuinely nothing to do.
    const box = dialog.getByRole('checkbox')
    await expect(box).not.toBeChecked()
    await expect(dialog.getByRole('button', { name: 'Rien à importer' })).toBeDisabled()
    expect(body?.updateDates).toBeUndefined()
  })

  test('sends updateDates once the box is ticked', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({
      json: {
        groups: [{
          groupId: 'group-1', groupNumber: 1, divisionName: 'GE 1',
          rounds: 7, matches: 28, newMatchDays: 0, newGames: 0,
          existingGames: 28, dateMismatches: 3, newTeams: 0,
        }],
        totals: { newClubs: 0, newTeams: 0 },
      },
    }))
    let body: { updateDates?: boolean } | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: { ...importResult, createdGames: [], createdMatchDays: [], updatedMatchDays: [] } })
    })

    await page.goto('/equipes')
    await runRowAction(page, page, 'Importer les matchs')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('checkbox').check()
    // Adjusting dates is work in itself, so the button acts even with no new match.
    await dialog.getByRole('button', { name: /Mettre à jour/ }).click()
    await expect(page.getByText(/Aucun match à importer/)).toBeVisible()
    expect(body?.updateDates).toBe(true)
  })

  // #294: after importing a calendar from a document, every game exists but
  // none carries an FFTT match id. The preview said "0 nouveau match · 7 déjà
  // présents" and disabled the button, so the ids could never be linked.
  test('can link existing games to FFTT when there is nothing new to import', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({
      json: {
        groups: [{
          groupId: 'group-1', groupNumber: 3, divisionName: 'GE Elite',
          rounds: 7, matches: 7, newMatchDays: 0, newGames: 0,
          existingGames: 7, dateMismatches: 0, ffttIdsToLink: 7, newTeams: 0,
        }],
        totals: { newClubs: 0, newTeams: 0 },
      },
    }))
    let body: Record<string, unknown> | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: { ...importResult, createdGames: [], createdMatchDays: [], updatedMatchDays: [] } })
    })

    await page.goto('/equipes')
    await runRowAction(page, page, 'Importer les matchs')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('7 à relier à la FFTT')).toBeVisible()

    const confirm = dialog.getByRole('button', { name: /Relier 7 matchs à la FFTT/ })
    await expect(confirm).toBeEnabled()
    await confirm.click()
    expect(body).toBeDefined()
    // Linking needs no opt-in: it fills a blank and never touches the slot.
    expect(body?.updateDates).toBeUndefined()
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
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })
    await expect(page.getByRole('button', { name: 'Importer les matchs' })).toHaveCount(0)
  })
})
