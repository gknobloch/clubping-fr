import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #270 — "Réinitialiser les matchs" on a group clears its journées and games
// but leaves the group and its teams alone.
//
// Mock data: division 198609 (GE 1) holds group-1 (Poule 1), which contains
// PPA Rixheim 1 (team-1) and seven opponents, with journées md-g1-1..7.
//
// The E2E dev server has no API, so the dataset is the in-memory mock and any
// full page load restores it. Everything after the reset therefore navigates
// client-side — a `page.goto` would silently undo the very mutation under test.
test.describe('General admin — réinitialiser les matchs d’un groupe (#270)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    // 198609 is an FFTT-aligned division id (#275), so the client may query
    // apiv2 for its pools. Answer with an empty list to stay hermetic.
    await page.route('https://apiv2.fftt.com/api/graphql', (route) =>
      route.fulfill({ json: { data: { pools: { edges: [] } } } }))
  })

  test('team-1 has games to begin with', async ({ page }) => {
    await page.goto('/equipes/team-1')

    await expect(page.getByRole('heading', { name: 'Matchs' })).toBeVisible()
    expect(await page.getByRole('button', { name: 'Détails du match' }).count()).toBeGreaterThan(0)
  })

  test('warns before clearing, then keeps the group and its teams', async ({ page }) => {
    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })

    let message = ''
    page.once('dialog', (dialog) => {
      message = dialog.message()
      return dialog.accept()
    })
    await page.getByRole('button', { name: 'Réinitialiser les matchs' }).click()

    expect(message).toContain('irréversible')
    expect(message).toContain('équipes du groupe seront conservées')

    // The pool itself and its roster of teams are untouched.
    await expect(page.getByRole('cell', { name: '1', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: /PPA Rixheim 1/ })).toBeVisible()

    await page.getByRole('link', { name: 'Équipes' }).click()
    await page.getByRole('link', { name: /PPA Rixheim 1/ }).first().click()

    await expect(page.getByRole('heading', { name: 'PPA Rixheim 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Détails du match' })).toHaveCount(0)
  })

  test('declining the confirmation leaves the calendar alone', async ({ page }) => {
    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Réinitialiser les matchs' }).click()

    await page.getByRole('link', { name: 'Équipes' }).click()
    await page.getByRole('link', { name: /PPA Rixheim 1/ }).first().click()

    expect(await page.getByRole('button', { name: 'Détails du match' }).count()).toBeGreaterThan(0)
  })
})
