import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #308 — PageHeader's action row already had `flex-wrap`, but `shrink-0` sized
// it to max-content so the wrap never triggered and the page overflowed
// instead: +44px on /groupes, +34px on /equipes.
//
// Asserting on the header's own box rather than on document scrollWidth is
// deliberate. A page can measure zero overflow while still being broken —
// /clubs does exactly that, because its table sits in an `overflow-hidden`
// wrapper that clips the Actions column out of reach (#305). Measuring the
// header directly keeps this test honest about what it covers.
const headerBox = () => {
  const h1 = document.querySelector('main h1')
  const box = h1?.closest('div.rounded-2xl')
  if (!box) return null
  const r = box.getBoundingClientRect()
  return { left: r.left, right: r.right, viewport: document.documentElement.clientWidth }
}

test.describe('En-tête de page sur mobile (#308)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  for (const path of ['/groupes', '/equipes', '/clubs']) {
    test(`l'en-tête de ${path} tient dans l'écran`, async ({ page }) => {
      await page.goto(path)
      await page.locator('main h1').waitFor()

      const box = await page.evaluate(headerBox)
      expect(box).not.toBeNull()
      expect(box!.left).toBeGreaterThanOrEqual(0)
      expect(box!.right).toBeLessThanOrEqual(box!.viewport)
    })
  }

  for (const path of ['/groupes', '/equipes']) {
    test(`${path} ne défile pas horizontalement`, async ({ page }) => {
      await page.goto(path)

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBe(clientWidth)
    })
  }

  // #308 wrapped the actions under the title because their labels could not
  // share a 375px row. They are icon-only squares below md: since #389's
  // review, so they fit beside the title and no longer need to wrap — which is
  // what PageHeader always allowed for ("actions sit beside the title when they
  // fit"). What still has to hold is the reason wrapping existed: the header
  // must not overflow, and every action must stay a full 44px target.
  test('les actions tiennent dans l’en-tête sans le faire déborder', async ({ page }) => {
    await page.goto('/groupes')
    await page.locator('main h1').waitFor()

    const header = page.locator('main h1').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    const { client, scroll } = await header.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }))
    expect(scroll).toBe(client)

    for (const btn of await header.getByRole('button').all()) {
      const box = (await btn.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width).toBeLessThanOrEqual(375)
    }
  })
})

test.describe('En-tête de page sur desktop (#308)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('garde le titre et les actions sur une seule ligne', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/groupes')
    await page.locator('main h1').waitFor()

    const { titleTop, actionTop } = await page.evaluate(() => {
      const h1 = document.querySelector('main h1')!
      const btn = h1.closest('div.rounded-2xl')!.querySelector('button')!
      return { titleTop: h1.getBoundingClientRect().top, actionTop: btn.getBoundingClientRect().top }
    })
    // Same row: the action sits alongside the title, not beneath it.
    expect(Math.abs(actionTop - titleTop)).toBeLessThan(20)
  })
})
