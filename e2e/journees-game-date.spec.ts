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
