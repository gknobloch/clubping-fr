import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// #311 — the page header used to mix two kinds of content. On Journées that
// stacked identity (logo, title, club name) and controls (phase switcher, team
// shortcuts, journée paginator) into one sticky block eating ~530px of an
// 812px screen, while every other screen had no sticky header at all.
//
// The split: identity scrolls away, controls stay. These tests pin the two
// properties that actually matter to a user — how much screen the chrome
// costs, and whether "aller à l'équipe X" lands somewhere readable.

const APP_BAR = 56

/** Bottom of the sticky chrome: the app bar, plus the toolbar when a page has one. */
async function stickyBottom(page: Page) {
  return page.evaluate((appBar) => {
    const toolbar = document.querySelector('[data-testid="page-toolbar"]')
    return toolbar ? toolbar.getBoundingClientRect().bottom : appBar
  }, APP_BAR)
}

test.describe('En-tête de page — mobile (#311)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
  })

  test('sur Journées, le contenu commence dans le premier tiers de l’écran', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()
    // First team section — the actual content, below both header levels.
    const firstSection = page.locator('section[id^="team-"]').first()
    await firstSection.waitFor()

    const top = await firstSection.evaluate((el) => el.getBoundingClientRect().top)
    const third = 812 / 3
    expect(top).toBeGreaterThan(0)
    expect(top).toBeLessThanOrEqual(third)
  })

  test('l’identité défile hors de l’écran, la barre de contrôles reste', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    const toolbar = page.locator('[data-testid="page-toolbar"]')
    await expect(toolbar).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForFunction(() => window.scrollY > 400)

    const { titleBottom, toolbarTop } = await page.evaluate(() => ({
      titleBottom: document.querySelector('main h1')!.getBoundingClientRect().bottom,
      toolbarTop: document.querySelector('[data-testid="page-toolbar"]')!.getBoundingClientRect().top,
    }))

    // Identity is gone from view...
    expect(titleBottom).toBeLessThan(0)
    // ...while the controls are parked right under the app bar.
    expect(toolbarTop).toBeCloseTo(APP_BAR, 0)
  })

  test('la barre de contrôles tient sur une seule rangée', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('[data-testid="page-toolbar"]').waitFor()

    const height = await page
      .locator('[data-testid="page-toolbar"]')
      .evaluate((el) => el.getBoundingClientRect().height)

    // One row of 44px touch targets plus the card's padding. Two rows would be
    // ~110px, which is what wrapping used to produce on a phone.
    expect(height).toBeLessThan(90)
  })

  test('« aller à l’équipe » atterrit sous l’en-tête, pas dessous', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    const shortcuts = page.locator('[data-testid="page-toolbar"] button', { hasText: /^\d+$/ })
    const count = await shortcuts.count()
    test.skip(count < 2, 'needs at least two team shortcuts to prove the landing')

    // Scroll to the bottom, then jump back to the *first* team. Targeting the
    // last one instead would land against the document's own scroll limit, so
    // the browser clamps and the element stops wherever it can — which passes
    // or fails for reasons that have nothing to do with the offset.
    const targetId = await page
      .locator('section[id^="team-"]')
      .first()
      .evaluate((el) => el.id)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForFunction(() => window.scrollY > 500, null, { timeout: 5_000 })
    await shortcuts.first().click()

    // scrollIntoView is smooth: wait for it to start, then for two consecutive
    // polls at the same offset. Sampling once right after the click reads the
    // pre-scroll position and passes the landing assertions for the wrong
    // reason.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __lastY?: number }
        const settled = w.__lastY === window.scrollY
        w.__lastY = window.scrollY
        return settled
      },
      null,
      { polling: 150, timeout: 5_000 }
    )

    const { sectionTop, chromeBottom } = await page.evaluate((id) => ({
      sectionTop: document.getElementById(id)!.getBoundingClientRect().top,
      chromeBottom: document
        .querySelector('[data-testid="page-toolbar"]')!
        .getBoundingClientRect().bottom,
    }), targetId)

    // The heading must clear the sticky chrome — this is what the hardcoded
    // scroll-mt-[195px] got wrong once the header's real height changed.
    expect(sectionTop).toBeGreaterThanOrEqual(chromeBottom - 1)
    // ...and not be pushed so far down that it wastes the screen.
    expect(sectionTop).toBeLessThan(chromeBottom + 40)
  })

  test('les écrans sans contrôles n’ont pas de barre collante', async ({ page }) => {
    for (const path of ['/joueurs', '/clubs', '/saisons']) {
      await page.goto(path)
      await page.locator('main h1').waitFor()
      await expect(page.locator('[data-testid="page-toolbar"]')).toHaveCount(0)
      expect(await stickyBottom(page)).toBe(APP_BAR)
    }
  })

  // The consistency half of the acceptance criteria: every screen that has a
  // control puts it at the same level, not just Journées. Équipes and Groupes
  // used to park their phase switcher in the scrolling flow.
  test('les écrans à contrôles les gardent tous collés, à la même hauteur', async ({ page }) => {
    for (const path of ['/journees', '/equipes', '/groupes']) {
      await page.goto(path)
      await page.locator('main h1').waitFor()

      const toolbar = page.locator('[data-testid="page-toolbar"]')
      await expect(toolbar).toBeVisible()

      const restingTop = await toolbar.evaluate((el) => el.getBoundingClientRect().top)

      // Scroll as far as this screen allows — /groupes is short enough that a
      // fixed 400px never arrives, and waiting for it just times out.
      const scrolled = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        return window.scrollY
      })
      await page.waitForFunction((y) => window.scrollY >= y, scrolled)

      const top = await toolbar.evaluate((el) => el.getBoundingClientRect().top)
      if (scrolled >= restingTop - APP_BAR) {
        // The header has been scrolled past, so the toolbar must be parked.
        expect(top, `${path}: toolbar should park under the app bar`).toBeCloseTo(APP_BAR, 0)
      } else {
        // Too short to detach; it must at least never slide under the app bar.
        expect(top, `${path}: toolbar should never go under the app bar`).toBeGreaterThanOrEqual(APP_BAR - 1)
      }
    }
  })
})
