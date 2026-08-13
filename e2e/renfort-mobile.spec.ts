import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #380 — fielding a player from outside the roster was desktop-only, through
// the "Autres joueurs" matrix. A captain composing from a phone could not do it
// at all, which is a routine move when the roster is short of availability.

test.describe('Renfort depuis un téléphone (#380)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  /** Open the captain's own next match from Accueil. */
  const openMyMatch = async (page: import('@playwright/test').Page) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    await page.getByRole('link', { name: 'Détails' }).click()
    await expect(page).toHaveURL(/\/journees\//)
  }

  test('un capitaine ajoute un renfort à sa composition', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)

    const trigger = page.getByRole('button', { name: 'Ajouter un renfort' })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    const first = sheet.getByRole('button', { name: /Ajouter$/ }).first()
    // The row also carries the player's own team and availability, so read the
    // name from its own element rather than slicing the button's text.
    const name = ((await first.locator('span.truncate').first().textContent()) ?? '').trim()
    expect(name).not.toBe('')
    await first.click()

    await expect(sheet).toBeHidden()
    // Appears in the line-up, marked as borrowed.
    const row = page.locator('li').filter({ hasText: name })
    await expect(row.getByText('Renfort')).toBeVisible()
  })

  test('la feuille est ancrée en bas et tient à l’écran', async ({ page }) => {
    await loginAs(page, 'colle')
    await openMyMatch(page)

    const trigger = page.getByRole('button', { name: 'Ajouter un renfort' })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const card = page.getByRole('dialog').locator('> *').first()
    const box = (await card.boundingBox())!
    expect(Math.round(box.x)).toBe(0)
    expect(Math.round(box.width)).toBe(375)
    expect(Math.round(box.y + box.height)).toBe(812)
  })
})
