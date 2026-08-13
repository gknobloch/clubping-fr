import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #380 — fielding a player from outside the roster was desktop-only, through
// the "Autres joueurs" matrix. A captain composing from a phone could not do it
// at all, which is a routine move when the roster is short of availability.
//
// Since #382 it happens in the line-up sheet the native app uses: "Cette
// équipe" then "Autres joueurs", chosen together and saved in one go, rather
// than a team dropdown on each roster row.

test.describe('Composition depuis un téléphone (#380, #382)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  /** Open the captain's own next match from Accueil. */
  const openMyMatch = async (page: import('@playwright/test').Page) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    await page.getByRole('link', { name: 'Détails' }).click()
    await expect(page).toHaveURL(/\/journees\//)
  }

  const openSheet = async (page: import('@playwright/test').Page) => {
    const compose = page.getByRole('button', { name: /Composer l’équipe|Composer l'équipe/ })
    await expect(compose).toBeVisible()
    await compose.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    return sheet
  }

  test('un capitaine aligne un renfort et le voit dans la composition', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)
    const sheet = await openSheet(page)

    // "Autres joueurs" is the section that did not exist on a phone at all.
    await expect(sheet.getByText('Cette équipe')).toBeVisible()
    await expect(sheet.getByText('Autres joueurs')).toBeVisible()

    // The line-up starts full, which is the realistic case: a captain swaps
    // someone out for the renfort rather than adding a fifth. Freeing the slot
    // first also proves the limit is not simply ignored.
    await sheet.locator('ul').first().locator('button[aria-pressed="true"]').first().click()

    // A renfort already in the line-up also shows here, checked — tapping that
    // one would remove them. Pick one that is not selected yet.
    const others = sheet.locator('ul').last()
    const pick = others.locator('button[aria-pressed="false"]').first()
    const name = ((await pick.textContent()) ?? '').replace(/✓|—|Oui|Non|Peut-être/g, '').trim()
    await pick.click()
    await sheet.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(sheet).toBeHidden()

    const row = page.locator('li').filter({ hasText: name })
    await expect(row.getByText('Renfort')).toBeVisible()
  })

  test('Annuler n’écrit rien', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)

    const compose = page.getByRole('button', { name: /Composer l’équipe|Composer l'équipe/ })
    const before = await compose.textContent()

    const sheet = await openSheet(page)
    await sheet.locator('ul').first().locator('button[aria-pressed="true"]').first().click()
    await sheet.getByRole('button', { name: 'Annuler' }).click()

    await expect(sheet).toBeHidden()
    await expect(compose).toHaveText(before!)
  })

  // #383 — the third shortcut, in the native app's order.
  test('la feuille de match reprend le club et la composition', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)

    await page.getByRole('button', { name: 'Feuille de match' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    await expect(sheet.getByText('Feuille de match')).toBeVisible()
    // Exact: the club name is also a substring of the matchup line above.
    await expect(sheet.getByText('PPA Rixheim', { exact: true })).toBeVisible()
    await expect(sheet.getByText(/Joueurs \(\d+\)/)).toBeVisible()
    await expect(sheet.getByText(/n'est pas enregistré/)).toBeVisible()
  })

  test('la feuille est ancrée en bas et tient à l’écran', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)
    await openSheet(page)

    const card = page.getByRole('dialog').locator('> *').first()
    const box = (await card.boundingBox())!
    expect(Math.round(box.x)).toBe(0)
    expect(Math.round(box.width)).toBe(375)
    expect(Math.round(box.y + box.height)).toBe(812)
  })
})
