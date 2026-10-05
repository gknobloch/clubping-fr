import { test, expect } from '@playwright/test'

// #640 — a parent and a child, one address. The session is one of them; the
// header offers the others, grouped by club, and a tap becomes the other.
//
// The E2E stack has no API behind the front end, so the two auth routes this
// flow touches are answered here: `/auth/me` restores whichever session the
// browser holds, `/auth/switch` hands back the other profile's. Everything
// else falls back to the fixtures, which is where both names come from.

const CLUB = 'club-fftt-06680011'
const enzo = {
  id: 'p2-player-4', role: 'player', isPlayer: true, firstName: 'Enzo', lastName: 'Lotz',
  email: 'famille.lotz@example.com', clubId: CLUB,
}
const quentin = {
  id: 'p2-player-2', role: 'player', isPlayer: true, firstName: 'Quentin', lastName: 'Colle',
  email: 'famille.lotz@example.com', clubId: CLUB,
}
const profiles = [enzo, quentin].map(({ id, role, firstName, lastName }) => ({
  id, role, firstName, lastName, clubId: CLUB, clubName: 'Rixheim PPA',
}))

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.describe('Changer de profil (#640)', () => {
  test.beforeEach(async ({ page }) => {
    // Signed in as Enzo — unless a switch already stored another session,
    // which a reload must keep.
    await page.addInitScript(() => {
      if (!window.localStorage.getItem('pp-club-session')) {
        window.localStorage.setItem('pp-club-session', 'tok-enzo')
      }
    })
    await page.route('**/api/auth/me', (route) => {
      const asQuentin = route.request().headers().authorization === 'Bearer tok-quentin'
      return route.fulfill(json({ user: asQuentin ? quentin : enzo, profiles }))
    })
    await page.route('**/api/auth/switch', (route) =>
      route.fulfill(json({ token: 'tok-quentin', user: quentin, profiles })),
    )
  })

  test('propose les profils de l’adresse et bascule sur l’autre', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Enzo Lotz' })).toBeVisible()

    await page.getByRole('button', { name: 'Changer de profil' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Changer de profil' })).toBeVisible()
    await expect(dialog.getByText('Rixheim PPA')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Enzo Lotz/ })).toBeDisabled()

    await dialog.getByRole('button', { name: /Quentin Colle/ }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Quentin Colle' })).toBeVisible()

    // The new session is the one a reload restores.
    await page.reload()
    await expect(page.getByRole('banner').getByRole('link', { name: 'Quentin Colle' })).toBeVisible()
  })

  test('ne propose rien quand l’adresse n’ouvre qu’un profil', async ({ page }) => {
    await page.unroute('**/api/auth/me')
    await page.route('**/api/auth/me', (route) => route.fulfill(json({ user: enzo, profiles: [profiles[0]] })))
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Enzo Lotz' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Changer de profil' })).toHaveCount(0)
  })
})
