import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// #306 — /journees is a matrix, not a list: players down, journées across. At
// 375px that was 14 columns and 964px of table, 2.6x the screen, with the
// Brûlage column already cut off. No responsive tweak fits a matrix on a phone,
// so below md: it becomes one card per match, tapping through to a detail where
// the roster runs vertically. Above md: the matrix is untouched.
//
// These tests are the acceptance criteria, in order.

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

test.describe('Journées sur mobile (#306)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
  })

  test('ne provoque aucun défilement horizontal', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    const { scrollWidth, clientWidth } = await noHorizontalScroll(page)
    expect(scrollWidth).toBe(clientWidth)
  })

  test('montre des cartes de match, pas la matrice', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    await expect(page.locator('a[href^="/journees/"]').first()).toBeVisible()
    // Every table on the page belongs to the desktop-only matrix.
    for (const table of await page.locator('table').all()) {
      await expect(table).toBeHidden()
    }
  })

  // Availability and line-up are now two separate gestures, not two dropdowns
  // on every roster row: OUI/PE/NON per player, and one "Composer l'équipe"
  // sheet for the group decision (#382). Both still have to work without the
  // page ever moving sideways.
  test('régler dispo et compo se fait sans défilement horizontal', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('a[href^="/journees/"]').first().click()
    await page.waitForURL(/\/journees\/.+/)
    await page.locator('h1').waitFor()

    const { scrollWidth, clientWidth } = await noHorizontalScroll(page)
    expect(scrollWidth).toBe(clientWidth)

    const oui = page.getByRole('button', { name: 'OUI' }).first()
    await expect(oui).toBeInViewport()
    await oui.click()

    const compose = page.getByRole('button', { name: /Composer l’équipe|Composer l'équipe/ })
    await expect(compose).toBeInViewport()
    await compose.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()

    // Still no sideways scroll after interacting.
    const after = await noHorizontalScroll(page)
    expect(after.scrollWidth).toBe(after.clientWidth)
  })

  test('un seul contrôle de navigation entre journées', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    // The journée switcher; the matrix's two paginators go with the matrix.
    await expect(page.getByRole('button', { name: 'Journée précédente' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Journée suivante' })).toHaveCount(1)
    for (const label of ['Journées précédentes (toutes équipes)', 'Journées suivantes (toutes équipes)']) {
      await expect(page.getByRole('button', { name: label })).toBeHidden()
    }
  })

  // The controls used to need 416px in a 343px row, so the toolbar scrolled
  // sideways and drew a scrollbar across a 44px control row — it read as a
  // glitch. The phase became a native select to buy the 60px back; since #432
  // the two are stacked instead, which buys the whole row.
  test('la barre de contrôles tient sans défiler, phase au-dessus de journée', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('[data-testid="page-toolbar"]').waitFor()

    const row = page.locator('[data-testid="page-toolbar"] > div')
    const { client, scroll } = await row.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }))
    expect(scroll).toBe(client)

    // No native select any more: two switchers, phase on top.
    await expect(page.locator('[data-testid="page-toolbar"] select')).toHaveCount(0)
    // Drawn twice — stacked here, a pill above md: — so only one is visible.
    await expect(page.locator('[data-testid="page-toolbar"] :text-matches("^Saison "):visible')).toHaveCount(1)

    const visible = (label: string) =>
      page.locator(`[data-testid="page-toolbar"] button[aria-label="${label}"]:visible`)
    const phase = visible('Phase précédente')
    const journee = visible('Journée précédente')
    await expect(phase).toHaveCount(1)
    await expect(journee).toHaveCount(1)

    const phaseBottom = await phase.evaluate((el) => el.getBoundingClientRect().bottom)
    const journeeTop = await journee.evaluate((el) => el.getBoundingClientRect().top)
    expect(phaseBottom).toBeLessThanOrEqual(journeeTop)
  })

  test('le sélecteur de journée change les matchs affichés', async ({ page }) => {
    await page.goto('/journees')
    await page.locator('main h1').waitFor()

    const heading = page.locator('[data-testid="page-toolbar"]').getByText(/^Journée \d+$/)
    const before = await heading.textContent()
    const cardsBefore = await page.locator('a[href^="/journees/"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href'))
    )

    await page.getByRole('button', { name: 'Journée précédente' }).click()
    await expect(heading).not.toHaveText(before!)

    const cardsAfter = await page.locator('a[href^="/journees/"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href'))
    )
    expect(cardsAfter).not.toEqual(cardsBefore)
  })
})

test.describe('Journées sur desktop — la matrice est intacte (#306)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('garde la matrice et ses deux paginateurs', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/journees')
    await page.locator('table').first().waitFor()

    await expect(page.locator('table').first()).toBeVisible()
    // The per-team paginator stays above the breakpoint — the issue asks for the
    // desktop matrix to be left alone, so the redundancy is a mobile-only fix.
    await expect(page.getByRole('button', { name: 'Journées précédentes (toutes équipes)' })).toBeVisible()
    // ...and the card list is mobile-only. It stays in the DOM behind
    // `md:hidden`, so assert on visibility rather than on element count.
    await expect(page.locator('a[href^="/journees/"]').first()).toBeHidden()
  })
})
