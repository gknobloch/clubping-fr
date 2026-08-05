import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #304 — on a phone the nav used to be nine links in a bare flex row: the
// document grew to 711px inside a 375px viewport and Groupes / Équipes /
// Journées / Joueurs / logout sat off-screen, unreachable.
//
// Unlike the unit test, Playwright applies the real stylesheet, so this is
// where the `md:` breakpoint is actually exercised.
const noHorizontalScroll = () =>
  ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })

test.describe('Navigation mobile (#304)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('the page does not scroll horizontally', async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(noHorizontalScroll)
    expect(scrollWidth).toBe(clientWidth)
  })

  test('nav links are behind the menu button, not on the bar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Groupes' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()

    await expect(page.getByRole('link', { name: 'Groupes' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Journées' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  })

  test('every drawer row is at least 44px tall (#307)', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()

    const heights = await page.locator('#menu-mobile a, #menu-mobile button').evaluateAll(
      (els) => els.map((el) => el.getBoundingClientRect().height),
    )
    expect(heights.length).toBeGreaterThan(0)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })

  test('navigating closes the drawer', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await page.getByRole('link', { name: 'Groupes' }).click()

    await expect(page).toHaveURL(/\/groupes$/)
    await expect(page.locator('#menu-mobile')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible()
  })

  test('Escape closes the drawer', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await expect(page.locator('#menu-mobile')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('#menu-mobile')).toHaveCount(0)
  })
})

test.describe('Navigation desktop (#304)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('keeps the horizontal bar and hides the menu button', async ({ page }) => {
    await loginAs(page, 'admin')

    await expect(page.getByRole('link', { name: 'Groupes' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Joueurs' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeHidden()
  })
})
