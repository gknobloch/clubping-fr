import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('General admin — Clubs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('sees Clubs in nav and can open clubs list', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Clubs' }).click()
    await expect(page).toHaveURL('/clubs')
    await expect(page.getByRole('heading', { name: 'Clubs' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ajouter un club/i })).toBeVisible()
  })

  test('clubs list shows at least one club', async ({ page }) => {
    await page.goto('/clubs')
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'PPA Rixheim' })).toBeVisible()
  })

  test('can open a club by clicking Modifier and see club detail with back link', async ({
    page,
  }) => {
    await page.goto('/clubs')
    await page.getByRole('button', { name: 'Modifier' }).first().click()
    await expect(page).toHaveURL(/\/clubs\/club-fftt-\d+/)
    await expect(page.getByRole('link', { name: /Retour à la liste des clubs/i })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('can navigate back from club detail to clubs list', async ({ page }) => {
    await page.goto('/clubs/06680011')
    await expect(page.getByRole('link', { name: /Retour à la liste des clubs/i })).toBeVisible()
    await page.getByRole('link', { name: /Retour à la liste des clubs/i }).click()
    await expect(page).toHaveURL('/clubs')
    await expect(page.getByRole('heading', { name: 'Clubs' })).toBeVisible()
  })
})
