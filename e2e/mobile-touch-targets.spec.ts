import { test, expect } from '@playwright/test'
import { loginAs, declineConfirm } from './helpers'

// #307 (targets under 44px) and #305 (tables clipped or overflowing).
//
// The two issues meet on the row actions: they were 54x20px text buttons in a
// dense table, and the table sat in an `overflow-hidden` wrapper that cut them
// off entirely — on /clubs, "Modifier" and "Archiver" rendered as "M" and "A".
// Rolling them into one "…" menu fixes the target size and takes the Actions
// column out of the overflow at the same time.
//
// Measuring reachability rather than `scrollWidth` is deliberate: a clipped
// page reports zero overflow precisely because its content has been cut away.

const LIST_PAGES = ['/clubs', '/saisons', '/phases', '/divisions', '/groupes', '/equipes', '/joueurs']

/** Visible, genuinely interactive controls inside the page body. */
const smallTargets = () => {
  const els = document.querySelectorAll<HTMLElement>('main button, main select, main input')
  return [...els]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    .map((el) => ({
      height: Math.round(el.getBoundingClientRect().height),
      // Enough to identify the offender from the failure message alone.
      what: `<${el.tagName.toLowerCase()}> ${(el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('placeholder') ?? '').trim().slice(0, 40)}`,
    }))
    .filter((t) => t.height < 44)
}

test.describe('Zones tactiles et tableaux sur mobile (#307, #305)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  for (const path of LIST_PAGES) {
    test(`${path} : aucun élément interactif sous 44 px`, async ({ page }) => {
      await page.goto(path)
      await page.locator('main h1').waitFor()

      expect(await page.evaluate(smallTargets)).toEqual([])
    })
  }

  // The headline complaint of #305: an admin could not archive a club from a
  // phone at all, because the buttons were clipped out of reach.
  test('les actions de ligne sont atteignables et déclenchent bien l’action', async ({ page }) => {
    await page.goto('/clubs')
    const row = page.getByRole('row').filter({ hasText: 'PPA Rixheim' })

    const trigger = row.getByRole('button', { name: /^Actions —/ })
    await expect(trigger).toBeVisible()

    // In view without scrolling the table sideways first: the Actions column is
    // pinned to the right edge of the scrollport. Under `overflow-hidden` the
    // buttons sat at right=405 in a container that ended at 359, and no amount
    // of scrolling could reach them.
    const box = (await trigger.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    expect(box.height).toBeGreaterThanOrEqual(44)

    await trigger.click()
    const archive = page.getByRole('menuitem', { name: 'Archiver' })
    await expect(archive).toBeVisible()
    expect((await archive.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    await archive.click()
    await expect(page.getByRole('menu')).toHaveCount(0)
    await declineConfirm(page)
  })

  // The menu is portalled to <body> for this reason: its cell now lives in an
  // `overflow-x-auto` scroll container, which clips whatever it contains.
  test('le menu d’actions n’est pas rogné par le conteneur défilant du tableau', async ({ page }) => {
    await page.goto('/clubs')
    const row = page.getByRole('row').filter({ hasText: 'PPA Rixheim' })
    await row.getByRole('button', { name: /^Actions —/ }).click()

    const menu = page.getByRole('menu')
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    expect(box.y + box.height).toBeLessThanOrEqual(812)
  })

  // Pinning is what turns "reachable by scrolling" into "already there". The
  // table is still wider than the phone, so this asserts the column holds its
  // place while the rest of the row scrolls under it.
  test('la colonne Actions reste à l’écran quand le tableau défile', async ({ page }) => {
    await page.goto('/clubs')
    const trigger = page
      .getByRole('row')
      .filter({ hasText: 'PPA Rixheim' })
      .getByRole('button', { name: /^Actions —/ })

    const before = (await trigger.boundingBox())!
    expect(before.x + before.width).toBeLessThanOrEqual(375)

    const scroller = page.locator('main div.overflow-x-auto').first()
    await scroller.evaluate((el) => el.scrollBy({ left: 300 }))
    await expect
      .poll(async () => (await scroller.evaluate((el) => el.scrollLeft)))
      .toBeGreaterThan(0)

    const after = (await trigger.boundingBox())!
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.x + after.width).toBeLessThanOrEqual(375)
  })

  test('/joueurs passe en liste de cartes plutôt qu’en tableau de 724 px', async ({ page }) => {
    await page.goto('/joueurs')
    await page.locator('main h1').waitFor()

    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByRole('listitem').first()).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBe(clientWidth)
  })

  for (const path of LIST_PAGES) {
    test(`${path} ne rogne aucun contenu de tableau`, async ({ page }) => {
      await page.goto(path)
      await page.locator('main h1').waitFor()

      // A wrapper may scroll (scrollWidth > clientWidth), but it must not clip:
      // `overflow-hidden` leaves content unreachable at any scroll offset.
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('main div, main section')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .filter((el) => getComputedStyle(el).overflowX === 'hidden')
          .map((el) => `${el.className} (${el.clientWidth} < ${el.scrollWidth})`),
      )
      expect(clipped).toEqual([])
    })
  }
})

test.describe('Zones tactiles sur desktop (#307)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // "Le rendu desktop n'est pas alourdi" — the actions stay inline text
  // buttons above md:, and the "…" trigger is not rendered at all.
  test('garde les actions de ligne en clair, sans menu', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/clubs')
    const row = page.getByRole('row').filter({ hasText: 'PPA Rixheim' })

    await expect(row.getByRole('button', { name: 'Modifier' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Archiver' })).toBeVisible()
    await expect(row.getByRole('button', { name: /^Actions —/ })).toBeHidden()
  })
})
