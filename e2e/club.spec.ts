import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Club admin / Captain — Club', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'szulc')
  })

  test('sees Club in nav and can open it', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Club', exact: true }).click()
    await expect(page).toHaveURL('/club')
    await expect(page.getByRole('heading', { name: 'PPA Rixheim' })).toBeVisible()
  })

  test('Club page shows a read-only club header, addresses, and channels — no Modifier button', async ({ page }) => {
    await page.goto('/club')
    await expect(page.getByRole('heading', { name: 'PPA Rixheim' })).toBeVisible()
    await expect(page.getByText(/N° 06680011/)).toBeVisible()
    await expect(page.getByText('Adresses')).toBeVisible()
    await expect(page.getByText('Canaux de communication')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
  })
})

test.describe('Club admin — Club (edit)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
  })

  test('club admin sees a Modifier button and can open the edit form', async ({ page }) => {
    await page.goto('/club')
    await expect(page.getByRole('heading', { name: 'PPA Rixheim' })).toBeVisible()
    // The club's own button, in its identity card at the top — each of the
    // club's groups (#602) has a « Modifier » of its own further down.
    await page.getByRole('button', { name: 'Modifier' }).first().click()
    await expect(page.getByLabel(/Nom/i)).toHaveValue(/PPA Rixheim|Rixheim/i)
    await page.getByRole('button', { name: 'Terminé' }).click()
    await expect(page.getByLabel(/Nom/i)).toHaveCount(0)
  })
})
