import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #292: /api/data never sent games.date, so every client-side game.date was
// undefined and the journée header fell back to match_days.date — the MIN
// across the round. A Sunday fixture in a mostly-Saturday journée showed the
// Saturday instead. Mock game g1-8 carries a fixed date of its own, distinct
// from its journée's (which is relative to today), so the two never coincide.
test.describe('Journées — a game shows its own date', () => {
  test('the header uses the game’s own date and time', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/journees')

    // Only the game carries this date; its journée is dated relative to today.
    await expect(page.getByText(/jeu\. 13 août/).first()).toBeVisible()
    await expect(page.getByText(/9h30/).first()).toBeVisible()
  })
})

// #294: a slot agreed between clubs is marked, and an away fixture is not the
// visiting club's to reschedule.
test.describe('Journées — provenance and who may reschedule', () => {
  test('a manually agreed slot is flagged', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/journees')
    await expect(page.getByText('Modifié manuellement').first()).toBeAttached()
  })

  test('a club admin may reschedule a home fixture but not an away one', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/journees')

    // PPA Rixheim 1's J8 (g1-8) is at home — its header is actionable.
    await expect(page.getByRole('button').filter({ hasText: /jeu\. 13 août/ })).toHaveCount(1)

    // J6 and J7 are away (opp-moussey-1 / opp-anould-2 are the home clubs):
    // the headers render, but not as something you can open.
    for (const opponent of ['Moussey 1', 'Anould 2']) {
      await expect(page.getByText(opponent).first()).toBeVisible()
      await expect(page.getByRole('button').filter({ hasText: opponent })).toHaveCount(0)
    }
  })
})
