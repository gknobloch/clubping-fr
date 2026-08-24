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

  // Was "le premier tiers" (270px). Journées carries two navigation controls
  // on a phone since #432 — the phase and the journée, stacked, each a 44px
  // touch target — where it used to carry a select and a paginator side by
  // side. Two of them cannot fit one row, so the budget moved: 340px, still
  // well under half the screen, and the number below is what the layout
  // actually produces (320px) with room for a font or a border to shift.
  test('sur Journées, le contenu commence dans la première moitié de l’écran', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()
    // The first match card — the actual content on a phone since #306 replaced
    // the matrix here. Either way it is what has to clear both header levels.
    const firstCard = page.locator('a[href^="/journees/"]').first()
    await firstCard.waitFor()

    const top = await firstCard.evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBeGreaterThan(0)
    expect(top).toBeLessThanOrEqual(340)
  })

  // On /equipes rather than /journees: since #306 the mobile Journées view is a
  // short card list for one journée, which may not scroll far enough to push the
  // identity off screen. Équipes has the same two-level header and real length.
  test('l’identité défile hors de l’écran, la barre de contrôles reste', async ({ page }) => {
    await page.goto('/equipes')
    await page.locator('main h1').waitFor()

    const toolbar = page.locator('[data-testid="page-toolbar"]')
    await expect(toolbar).toBeVisible()

    // Scroll as far as this screen allows; the card list is shorter than the
    // matrix it replaced (#306), so a fixed 600px may never arrive.
    const scrolled = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return window.scrollY
    })
    await page.waitForFunction((y) => window.scrollY >= y, scrolled)
    expect(scrolled, 'need a scrollable page to prove the identity leaves').toBeGreaterThan(120)

    const { titleBottom, toolbarTop } = await page.evaluate(() => ({
      titleBottom: document.querySelector('main h1')!.getBoundingClientRect().bottom,
      toolbarTop: document.querySelector('[data-testid="page-toolbar"]')!.getBoundingClientRect().top,
    }))

    // Identity is gone from view...
    expect(titleBottom).toBeLessThan(0)
    // ...while the controls are parked right under the app bar.
    expect(toolbarTop).toBeCloseTo(APP_BAR, 0)
  })

  // The rule this pins is "the band stays small and predictable", not "one
  // row": #311 was written against a header that *wrapped* to three rows
  // without anyone deciding it should. Journées now declares two — phase over
  // journée (#432) — and Équipes, Groupes and the rest still declare one, at
  // 90px. Whatever a screen declares, it may not drift past it.
  test('la barre de contrôles garde une hauteur bornée', async ({ page }) => {
    const heightOf = async (path: string) => {
      await page.goto(path)
      await page.locator('[data-testid="page-toolbar"]').waitFor()
      return page
        .locator('[data-testid="page-toolbar"]')
        .evaluate((el) => el.getBoundingClientRect().height)
    }

    // One row of 44px touch targets plus the band's padding.
    expect(await heightOf('/equipes')).toBeLessThan(90)
    // Two, plus the journée's second line of text. Three would be ~180px.
    expect(await heightOf('/journees')).toBeLessThan(140)
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

// The team shortcuts jump between the per-team matrix tables, which #306 made
// desktop-only — so the anchor offset this issue fixed is now a desktop
// concern. The measured `--page-scroll-offset` is what makes it land.
test.describe('En-tête de page — desktop (#311)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
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
})
