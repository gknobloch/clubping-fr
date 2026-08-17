import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #387 — a line-up is read in a sports hall, often a basement, which is exactly
// where the signal is not. Offline the app used to replace itself with an error
// page; it now keeps showing what it last knew and says so.

// The E2E stack runs the front end with no API behind it, so a plain load never
// caches anything — DataProvider falls back to fixtures instead. These tests
// therefore answer `/api/data` themselves: a successful response first, so a
// cache exists, then a dead network.
const PAYLOAD = {
  seasons: [], phases: [], divisions: [], clubs: [], groups: [], teams: [],
  players: [], playerPhasePoints: [], matchDays: [], games: [],
  gameAvailabilities: [], gameSelections: [], users: [],
}

test.describe('Mode hors ligne (#387)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/data', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
    )
  })

  /** Swap the healthy route for a dead one and make the app look again. */
  const goOffline = async (page: import('@playwright/test').Page) => {
    await page.unroute('**/api/data')
    await page.route('**/api/data', (route) => route.abort())
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
  }

  test('garde les données connues et annonce qu’elles datent', async ({ page }) => {
    await loginAs(page, 'lotz')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const name = await page.getByRole('heading', { level: 1 }).textContent()

    // Nothing on screen says "offline" while the network answers.
    await expect(page.getByRole('status')).toHaveCount(0)

    // Cut the network the way a basement does.
    await goOffline(page)

    const banner = page.getByRole('status')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/Hors ligne/)

    // The point of the change: the screen still carries the member's own data.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!)
    await expect(page.getByText('Impossible de charger les données. Vérifiez votre connexion.')).toHaveCount(0)
  })

  test('le bandeau repart quand le réseau revient', async ({ page }) => {
    await loginAs(page, 'lotz')

    await goOffline(page)
    await expect(page.getByRole('status')).toBeVisible()

    await page.unroute('**/api/data')
    await page.route('**/api/data', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
    )
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    await expect(page.getByRole('status')).toHaveCount(0)
  })

  // Clubs share phones. The cache is one member's and must not outlive their
  // session — this is a privacy rule, not a convenience.
  test('la déconnexion emporte le cache', async ({ page }) => {
    await loginAs(page, 'lotz')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const cachedWhileSignedIn = await page.evaluate(() =>
      window.localStorage.getItem('pp-club-data-cache'),
    )
    expect(cachedWhileSignedIn).not.toBeNull()

    // At 375px the nav's sign-out lives in the drawer; /compte carries its own.
    await page.goto('/compte')
    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/login/)

    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('pp-club-data-cache')))
      .toBeNull()
  })
})
