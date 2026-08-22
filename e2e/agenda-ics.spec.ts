import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// The .ics download (#426) — the one part of "add to my calendar" that unit
// tests cannot reach: the browser has to actually be handed a file.
test.describe('Player — add a match to their calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'lotz')
  })

  test('the Accueil card hands over an .ics for the upcoming match', async ({ page }) => {
    const card = page.getByText(/PPA Rixheim 1 – Etival 1/).locator('..')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Ajouter à mon agenda' }).click(),
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
    const icons = page.getByRole('button', { name: 'Ajouter à mon agenda' })
    await expect(icons.first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      icons.first().click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.ics$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
