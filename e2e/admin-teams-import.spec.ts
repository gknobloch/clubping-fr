import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// The E2E dev server has no API; the FFTT teams endpoints are mocked per test.
const PREVIEW = '**/api/fftt/teams-preview*'
const IMPORT = '**/api/teams/import'

// The browser fetches apiv2 GraphQL directly (#231 follow-up: FFTT blocks
// Cloudflare egress, apiv2 allows CORS) — always mocked so E2E stays hermetic.
const FFTT_GRAPHQL = 'https://apiv2.fftt.com/api/graphql'

const graphqlTeamNode = (teamId: string, teamName: string, poolId: string, poolName: string, divisionId: string, divisionName: string) => ({
  node: {
    opponent: { team: { id: `/api/teams/${teamId}`, name: teamName } },
    pool: {
      id: `/api/pools/${poolId}`, name: poolName,
      group: { tour: { division: { id: `/api/divisions/${divisionId}`, name: divisionName, phase: { id: '/api/phases/1' } } } },
    },
  },
})

async function mockFfttGraphql(page: Page) {
  await page.route(FFTT_GRAPHQL, (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('seasons(current: true)')) {
      return route.fulfill({ json: { data: { seasons: { edges: [{ node: { id: '/api/seasons/26', name: '2025 / 2026' } }] } } } })
    }
    return route.fulfill({
      json: {
        data: {
          poolOpponents: {
            edges: [
              graphqlTeamNode('9101', 'PPA RIXHEIM 1', '801', '3', '901', 'GE 1'),
              graphqlTeamNode('9110', 'PPA RIXHEIM 10', '807', '5', '907', 'GE 7'),
              graphqlTeamNode('9111', 'PPA RIXHEIM 11', '808', '2', '234700', 'GE 8 Phase 1'),
            ],
          },
        },
      },
    })
  })
}

// Matches the mock data: club-fftt-06680011 (PPA Rixheim) already has teams
// 1..8 in phase-26-1 (2025/2026 Phase 1, active); divisions 198609..198907 exist
// locally; its addresses are addr-1 (Gymnase principal, default) and addr-2
// (Salle annexe).
const preview = {
  club: { id: 'club-fftt-06680011', displayName: 'PPA Rixheim' },
  season: { id: '26', displayName: '2025/2026', exists: true },
  teams: [
    {
      id: '9101', name: 'PPA Rixheim 1', number: 1, phase: 1,
      divisionId: '198609', divisionName: 'GE 1', divisionExists: true,
      poolNumber: 3, exists: true, importable: false,
    },
    {
      id: '9110', name: 'PPA Rixheim 10', number: 10, phase: 1,
      divisionId: '198907', divisionName: 'GE 7', divisionExists: true,
      poolNumber: 5, exists: false, importable: true,
    },
    {
      id: '9111', name: 'PPA Rixheim 11', number: 11, phase: 1,
      divisionId: '234700', divisionName: 'GE 8 Phase 1', divisionExists: false,
      poolNumber: 2, exists: false, importable: true,
    },
  ],
}

const importResult = {
  createdPhases: [],
  createdDivisions: [
    { id: '234700', phaseId: 'phase-26-1', displayName: 'GE 8 Phase 1', rank: 8, playersPerGame: 3, isArchived: false },
  ],
  groups: [
    { id: '1500001', divisionId: '198907', number: 5, teamIds: ['9110'], isArchived: false },
    { id: '1500002', divisionId: '234700', number: 2, teamIds: ['9111'], isArchived: false },
  ],
  createdTeams: [
    {
      id: '9110', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 10, divisionId: '198907', groupId: '1500001',
      gameLocationId: 'addr-2', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: '', playerIds: [], isArchived: false,
    },
    {
      id: '9111', clubId: 'club-fftt-06680011', phaseId: 'phase-26-1', number: 11, divisionId: '234700', groupId: '1500002',
      gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00', captainId: '', playerIds: [], isArchived: false,
    },
  ],
  skipped: [{ id: '9101', label: 'RIXHEIM PPA 1 - Phase 1', reason: 'already_exists' }],
}

test.describe('General admin — Teams FFTT import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await mockFfttGraphql(page)
  })

  test('import is the primary action, manual add still available', async ({ page }) => {
    await page.goto('/equipes')
    await expect(page.getByRole('button', { name: 'Importer depuis la FFTT' })).toBeVisible()
    await page.getByRole('button', { name: 'Ajouter une équipe' }).click()
    await expect(page.getByRole('heading', { name: 'Ajouter une équipe' })).toBeVisible()
  })

  test('previews teams with a simplified name, and excludes existing ones from selection', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await expect(page.getByRole('heading', { name: 'Importer les équipes FFTT' })).toBeVisible()

    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()

    // Simplified naming ("Club Nom"), not the raw FFTT label. Scoped to the
    // dialog: "PPA Rixheim 1" also matches the existing team-1 card behind it.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('PPA Rixheim 1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('PPA Rixheim 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Déjà présente')).toBeVisible()
    await expect(page.getByText('Division à importer')).toBeVisible()

    // An already-existing team can't be selected for import. exact: true
    // avoids matching "Importer PPA Rixheim 10"/"11" (substring match by default).
    const existingCheckbox = dialog.getByLabel('Importer PPA Rixheim 1', { exact: true })
    await expect(existingCheckbox).toBeDisabled()
    await expect(existingCheckbox).not.toBeChecked()

    // A new team defaults to selected, with the club's default venue preselected.
    const newCheckbox = dialog.getByLabel('Importer PPA Rixheim 10')
    await expect(newCheckbox).toBeChecked()
    await expect(dialog.getByLabel('Lieu de jeu — PPA Rixheim 10')).toHaveValue('addr-1')
  })

  test('per-row overrides and "Appliquer à tous" both reach the import request', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))
    let importBody: unknown
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: importResult })
    })

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()

    // Bulk defaults, applied to every row via "Appliquer à tous".
    await page.getByLabel('Jour par défaut').selectOption('Jeudi')
    await page.getByLabel('Heure par défaut').selectOption('20')
    await page.getByRole('button', { name: 'Appliquer à tous' }).click()
    await expect(page.getByLabel('Jour — PPA Rixheim 10')).toHaveValue('Jeudi')
    await expect(page.getByLabel('Jour — PPA Rixheim 11')).toHaveValue('Jeudi')

    // Override one row's venue individually after the bulk apply.
    await page.getByLabel('Lieu de jeu — PPA Rixheim 10').selectOption('addr-2')

    await page.getByRole('button', { name: 'Importer 2 équipes' }).click()
    await expect(page.getByText('2 équipes importées.')).toBeVisible()
    await expect(page.getByText('1 division importée automatiquement.')).toBeVisible()

    // The body also carries the browser-fetched FFTT payload (season + teams)
    // that the server validates before persisting anything.
    expect(importBody).toMatchObject({
      clubId: 'club-fftt-06680011',
      teams: [
        { id: '9110', gameLocationId: 'addr-2', defaultDay: 'Jeudi', defaultTime: '20h00' },
        { id: '9111', gameLocationId: 'addr-1', defaultDay: 'Jeudi', defaultTime: '20h00' },
      ],
      season: { id: '26', displayName: '2025/2026' },
    })
    expect((importBody as { ffttTeams: unknown[] }).ffttTeams).toHaveLength(3)

    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByText('PPA Rixheim 10')).toBeVisible()
    await expect(page.getByText('PPA Rixheim 11')).toBeVisible()
  })

  test('unchecking a team excludes it from the import request', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))
    let importBody: { teams: Array<{ id: string }> } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({ json: { ...importResult, createdTeams: [importResult.createdTeams[1]] } })
    })

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()

    await page.getByLabel('Importer PPA Rixheim 10').uncheck()
    await page.getByRole('button', { name: 'Importer 1 équipe' }).click()
    await expect(page.getByText('1 équipe importée.')).toBeVisible()

    expect(importBody?.teams.map((t) => t.id)).toEqual(['9111'])
  })

  // #422: FFTT engages a team in another poule than the one it sits in — a
  // repêchage. Offered as a move, not reported as "déjà présente", and it
  // keeps the settings the club chose for it.
  test('offers an already-present team as a move when its pool changed', async ({ page }) => {
    await page.route(PREVIEW, (route) => route.fulfill({
      json: {
        ...preview,
        teams: [{
          ...preview.teams[0], exists: true, importable: true,
          moved: true, fromPoolNumber: 1, fromDivisionName: 'GE 1',
        }, preview.teams[1], preview.teams[2]],
      },
    }))
    let importBody: { teams: Array<{ id: string; gameLocationId: string }> } | undefined
    await page.route(IMPORT, (route) => {
      importBody = route.request().postDataJSON()
      return route.fulfill({
        json: {
          ...importResult, createdTeams: [], createdDivisions: [], skipped: [],
          movedTeams: [{ id: 'team-1', groupId: '1500001', previousGroupId: 'group-1' }],
          deletedGames: ['g-old-1', 'g-old-2'], deletedMatchDays: [],
        },
      })
    })

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Change de poule')).toBeVisible()
    await expect(dialog.getByText('Aujourd’hui : GE 1 · Poule 1')).toBeVisible()

    // Selectable, unlike a team that is simply already there — and its venue,
    // day and time are not up for grabs: the club set them.
    const moving = dialog.getByLabel('Importer PPA Rixheim 1', { exact: true })
    await expect(moving).toBeChecked()
    const venue = dialog.getByLabel('Lieu de jeu — PPA Rixheim 1', { exact: true })
    await expect(venue).toBeDisabled()
    await expect(venue).toHaveValue('')

    // Uncheck the other two so only the move is sent.
    await dialog.getByLabel('Importer PPA Rixheim 10').uncheck()
    await dialog.getByLabel('Importer PPA Rixheim 11').uncheck()
    // A move needs no venue, so the confirm button is not held back by one.
    await dialog.getByRole('button', { name: /^Importer/ }).click()

    expect(importBody?.teams).toEqual([{ id: '9101', gameLocationId: '', defaultDay: '', defaultTime: '' }])
    await expect(dialog.getByText(/1 équipe déplacée vers sa nouvelle poule, 2 matchs de l’ancienne supprimés/)).toBeVisible()
  })

  test('reports when the FFTT API is unreachable from the browser', async ({ page }) => {
    // The real prod failure path: the browser can't reach apiv2 — no request
    // ever hits our API.
    await page.route(FFTT_GRAPHQL, (route) => route.abort())

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()
    await expect(page.getByText(/Impossible de contacter l’API FFTT/)).toBeVisible()
  })

  test('blocks the import when the FFTT season is missing locally', async ({ page }) => {
    await page.route(PREVIEW, (route) =>
      route.fulfill({
        json: {
          ...preview,
          season: { id: '27', displayName: '2026/2027', exists: false },
          teams: preview.teams.map((t) => ({ ...t, exists: false, importable: false })),
        },
      }),
    )

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    await page.getByLabel('Club', { exact: true }).selectOption('club-fftt-06680011')
    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()

    await expect(page.getByText(/La saison 2026\/2027 n’existe pas encore/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rien à importer' })).toBeDisabled()
  })
})

test.describe('Club admin — Teams FFTT import', () => {
  test('the club is locked to the admin’s own club', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await mockFfttGraphql(page)
    await page.route(PREVIEW, (route) => route.fulfill({ json: preview }))

    await page.goto('/equipes')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()

    const clubSelect = page.getByLabel('Club', { exact: true })
    await expect(clubSelect).toBeDisabled()
    await expect(clubSelect).toHaveValue('club-fftt-06680011')

    await page.getByRole('button', { name: 'Rechercher les équipes' }).click()
    await expect(page.getByText('PPA Rixheim 10', { exact: true })).toBeVisible()
  })
})
