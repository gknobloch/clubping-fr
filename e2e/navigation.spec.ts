import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Navigation after login', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('can navigate to Accueil and see welcome', async ({ page }) => {
    await page.getByRole('link', { name: 'Accueil' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('can navigate to Équipes', async ({ page }) => {
    await page.getByRole('link', { name: 'Équipes' }).click()
    await expect(page).toHaveURL('/equipes')
    await expect(page.getByRole('heading', { name: 'Équipes' })).toBeVisible()
  })

  test('can navigate to Journées', async ({ page }) => {
    await page.getByRole('link', { name: 'Journées' }).click()
    await expect(page).toHaveURL('/journees')
    await expect(
      page.getByRole('heading', { name: 'Journées' })
    ).toBeVisible()
  })

  // No `page.on('dialog')` since #375: the confirmation is rendered in the
  // page. Accepting a native dialog here is exactly what hid the bug — on iOS
  // Safari, a member who has blocked dialogs gets `false` back with nothing
  // shown, and logout silently did nothing.
  test('can logout and is redirected to login', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => {
      window.confirm = () => {
        throw new Error('window.confirm must not gate logout (#375)')
      }
    })

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Se déconnecter' }).click()

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Club Ping/i })).toBeVisible()
  })

  test('la déconnexion peut être annulée', async ({ page }) => {
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page).not.toHaveURL(/\/login/)
  })
})
