import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #372 — the follow-up to #307, which only ever measured the seven list pages.
// Everything else (detail pages, /club, /compte, and every modal) was never
// checked, and had drifted: OUI/PE/NON measured 36-49x26, modal footers 36px,
// "Détails du match" 16x16.
//
// Two differences from mobile-touch-targets.spec.ts, both of which are why that
// spec stayed green while these pages did not:
//   - links count. Back links and row links are targets too, and they were the
//     largest group of offenders (19-20px tall).
//   - an <input> inside a <label> is measured by its label, which is the real
//     tap target. Measuring the input alone reports false failures on the
//     checkboxes and radios that already pad their label out to 44px.

const MIN = 44

/** Visible interactive targets, measured the way a finger meets them. */
const smallTargets = () => {
  const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"]'
  return [...document.querySelectorAll<HTMLElement>(sel)]
    .filter((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.visibility !== 'hidden'
    })
    .map((el) => {
      const label = el.closest('label')
      const target = label && el.tagName === 'INPUT' ? label : el
      const r = target.getBoundingClientRect()
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        what: `<${el.tagName.toLowerCase()}> ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}`,
      }
    })
    .filter((t) => t.w > 0 && t.h > 0)
    .filter((t) => t.w < 44 || t.h < 44)
}

/**
 * Content sticking out of an ancestor that clips (`overflow: hidden`), which a
 * viewport-width check cannot see: the page reports no overflow while a control
 * sits outside the card that contains it. This is what 44px-wide selects did to
 * the four-column "Heure" cell of the team form.
 */
const clippedOut = () =>
  [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.visibility !== 'hidden'
    })
    .filter((el) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return false
      let a = el.parentElement
      let clip: HTMLElement | null = null
      while (a && a !== document.body) {
        const ox = getComputedStyle(a).overflowX
        // A scroll container is meant to hold wider content — not a defect.
        if (ox === 'auto' || ox === 'scroll') return false
        if (ox === 'hidden' || ox === 'clip') { clip = a; break }
        a = a.parentElement
      }
      if (!clip) return false
      const cr = clip.getBoundingClientRect()
      return r.right > cr.right + 1 || r.left < cr.left - 1
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))

test.describe('Zones tactiles — pages de détail et modales (#372)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  const ADMIN_PAGES = ['/saisons', '/phases', '/divisions', '/compte']

  for (const path of ADMIN_PAGES) {
    test(`${path} : aucune cible sous ${MIN} px`, async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto(path)
      await page.locator('main').waitFor()
      expect(await page.evaluate(smallTargets)).toEqual([])
    })
  }

  test('les pages de détail respectent la cible de 44 px', async ({ page }) => {
    await loginAs(page, 'admin')

    // Reached by navigation rather than by hardcoded id: the seed ids differ
    // between the local D1 and CI.
    await page.goto('/equipes')
    await page.getByRole('link', { name: /PPA Rixheim/ }).first().click()
    await expect(page).toHaveURL(/\/equipes\//)
    expect(await page.evaluate(smallTargets)).toEqual([])

    await page.goto('/joueurs')
    await page.getByRole('listitem').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/\/joueurs\//)
    expect(await page.evaluate(smallTargets)).toEqual([])
  })

  // The regression this spec exists to prevent: OUI/PE/NON is the control every
  // licensee touches, and it was the smallest target in the app.
  test('les boutons de disponibilité font 44 px sur mobile', async ({ page }) => {
    await loginAs(page, 'lotz')
    const oui = page.getByRole('button', { name: 'OUI' }).first()
    await expect(oui).toBeVisible()

    const box = (await oui.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(MIN)
    expect(box.height).toBeGreaterThanOrEqual(MIN)
  })

  test('les modales : pied de page et champs à 44 px, rien de rogné', async ({ page }) => {
    await loginAs(page, 'admin')

    for (const [path, label] of [
      ['/saisons', 'Ajouter une saison'],
      ['/divisions', 'Ajouter une division'],
      ['/groupes', 'Ajouter un groupe'],
      ['/clubs', 'Ajouter un club'],
      ['/joueurs', 'Ajouter un joueur'],
      ['/equipes', 'Ajouter une équipe'],
    ] as const) {
      await page.goto(path)
      await page.getByRole('button', { name: label }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      expect(await page.evaluate(smallTargets), `${label} : cibles trop petites`).toEqual([])
      expect(await page.evaluate(clippedOut), `${label} : contenu rogné`).toEqual([])
    }
  })
})

test.describe('Zones tactiles — desktop inchangé (#372)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // Every fix is gated on `md:`, so desktop keeps the original density: 36px
  // footers, 26px availability chips, a 28px brand link.
  test('garde les hauteurs d’origine', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/saisons')
    await page.getByRole('button', { name: 'Ajouter une saison' }).click()

    const cancel = page.getByRole('dialog').getByRole('button', { name: 'Annuler' })
    expect((await cancel.boundingBox())!.height).toBeLessThan(MIN)
  })

  test('garde les puces de disponibilité compactes', async ({ page }) => {
    await loginAs(page, 'lotz')
    const oui = page.getByRole('button', { name: 'OUI' }).first()
    await expect(oui).toBeVisible()
    expect((await oui.boundingBox())!.height).toBeLessThan(MIN)
  })
})
