import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// Reproduces #400: on desktop, Journées scrolls itself via a team anchor
// (`scrollIntoView`); navigating to another long page used to inherit that
// scroll position instead of starting at the top. The team shortcuts are
// desktop-only (#306), and this is a desktop bug, so we run at a wide viewport.
test.describe('Scroll reset on navigation (#400)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('la nouvelle page commence en haut après une ancre de Journées', async ({ page }) => {
    // club.admin's club has teams, so Journées renders the matrix with the
    // "Aller à" team shortcuts.
    await loginAs(page, 'club.admin')

    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    // Jump to a team via its shortcut — this is Journées' own `scrollIntoView`,
    // which leaves the document far from the top.
    const shortcuts = page.locator('[data-testid="page-toolbar"] button', { hasText: /^\d+$/ })
    await shortcuts.first().waitFor()
    await shortcuts.first().click()

    // scrollIntoView is smooth: navigating mid-animation lets the in-flight
    // scroll win over the reset. Wait for it to settle (two equal polls) well
    // away from the top before leaving.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __lastY?: number }
        const settled = w.__lastY === window.scrollY && window.scrollY > 100
        w.__lastY = window.scrollY
        return settled
      },
      null,
      { polling: 150, timeout: 5_000 },
    )

    await page.getByRole('link', { name: 'Joueurs' }).click()
    await expect(page).toHaveURL('/joueurs')

    // The new page must start at the top, not inherit Journées' scroll.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})
