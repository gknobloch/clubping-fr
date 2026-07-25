import { test, expect } from '@playwright/test'

test.describe('Auth', () => {
  test('unauthenticated user visiting / is redirected to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Ping Club/i })).toBeVisible()
  })

  test('unauthenticated user visiting protected route is redirected to login', async ({
    page,
  }) => {
    await page.goto('/clubs')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/equipes')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/club')
    await expect(page).toHaveURL(/\/login/)
  })
})
