import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// The .ics download (#426) — the one part of "add to my calendar" that unit
// tests cannot reach: the browser has to actually be handed a file. A row of
// the « Partager » menu since #747, which took the calendar icon's place.
test.describe('Player — add a match to their calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'lotz')
  })

  test('the Accueil card hands over an .ics for the upcoming match', async ({ page }) => {
    const card = page.getByText(/PPA Rixheim 1 – Etival 1/).locator('..')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await card.getByRole('button', { name: 'Partager le match' }).click()
        await page.getByRole('dialog', { name: 'Partager le match' }).getByRole('button', { name: 'Ajouter à mon agenda' }).click()
      })(),
    ])

    expect(download.suggestedFilename()).toMatch(/^club-ping-j\d+-etival-1\.ics$/)

    const stream = await download.createReadStream()
    const ics = (await new Response(stream as unknown as ReadableStream).text())

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:PPA Rixheim 1 – Etival 1')
    expect(ics).toMatch(/DTSTART[;:]/)
    expect(ics).toContain('END:VCALENDAR')
  })

  test('the journées matrix offers one on every fixture', async ({ page }) => {
    await page.getByRole('link', { name: 'Journées' }).click()

    // The matrix cell is a dead end otherwise: inert for a member, and for an
    // admin it opens the slot editor. The icon must not open that.
    const icons = page.getByRole('button', { name: 'Partager le match' })
    await expect(icons.first()).toBeVisible()
    await icons.first().click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('dialog', { name: 'Partager le match' }).getByRole('button', { name: 'Ajouter à mon agenda' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.ics$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
