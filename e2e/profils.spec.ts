import { test, expect } from '@playwright/test'

// #640 — a parent and a child: the session is one of them; the header's
// account menu (#722) offers the others, and a click becomes the other. Since
// #749 the parent's own clubs and the child's profile, delegated to him, are
// two lists, and a banner says whose profile is open.
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
// Enzo signed in; Quentin delegated his profile to him (#655, #749).
const profiles = [
  { id: enzo.id, role: enzo.role, firstName: enzo.firstName, lastName: enzo.lastName, clubId: CLUB, clubName: 'Rixheim PPA', signedIn: true },
  { id: quentin.id, role: quentin.role, firstName: quentin.firstName, lastName: quentin.lastName, clubId: CLUB, clubName: 'Rixheim PPA', managed: true },
]

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
    await page.route('**/api/auth/switch', (route) => {
      const toQuentin = route.request().postDataJSON()?.userId === quentin.id
      return route.fulfill(json({ token: toQuentin ? 'tok-quentin' : 'tok-enzo', user: toQuentin ? quentin : enzo, profiles }))
    })
  })

  test('propose ses clubs et les profils qu’il gère, et bascule sur l’autre', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: /Enzo Lotz/ }).click()
    const menu = page.locator('#account-menu')
    // Who is signed in and where; his club, ticked; then the profile he manages.
    await expect(menu.getByText('Enzo Lotz', { exact: true })).toBeVisible()
    await expect(menu.getByRole('heading', { name: 'Mes clubs' })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Rixheim PPA/ })).toHaveAttribute('aria-current', 'true')
    await expect(menu.getByRole('heading', { name: 'Profils que vous gérez' })).toBeVisible()
    await expect(page.getByTestId('managed-profile-banner')).toHaveCount(0)

    await menu.getByRole('button', { name: /Quentin Colle/ }).click()
    await expect(menu).toBeHidden()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('banner').getByRole('button', { name: /Quentin Colle/ })).toBeVisible()
    // Somebody else's profile: the banner says whose.
    const banner = page.getByTestId('managed-profile-banner')
    await expect(banner).toContainText('Quentin Colle')

    // The new session is the one a reload restores — banner included.
    await page.reload()
    await expect(page.getByRole('banner').getByRole('button', { name: /Quentin Colle/ })).toBeVisible()
    await expect(banner).toBeVisible()

    // And one click goes back to the profile that signed in.
    await banner.getByRole('button', { name: 'Revenir à mon profil' }).click()
    await expect(page.getByRole('banner').getByRole('button', { name: /Enzo Lotz/ })).toBeVisible()
    await expect(banner).toHaveCount(0)
  })

  test('ne propose rien quand l’adresse n’ouvre qu’un profil', async ({ page }) => {
    await page.unroute('**/api/auth/me')
    await page.route('**/api/auth/me', (route) => route.fulfill(json({ user: enzo, profiles: [profiles[0]] })))
    await page.goto('/')
    await page.getByRole('banner').getByRole('button', { name: /Enzo Lotz/ }).click()
    const menu = page.locator('#account-menu')
    await expect(menu.getByRole('link', { name: /Mon compte/ })).toBeVisible()
    await expect(menu.getByTestId('profile-list')).toHaveCount(0)
  })
})
