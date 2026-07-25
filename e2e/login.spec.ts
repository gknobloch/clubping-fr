import { test, expect } from '@playwright/test'

test.describe('Login and home', () => {
  test('unauthenticated user sees login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Ping Club/i })).toBeVisible()
    await expect(page.getByPlaceholder(/Nom ou adresse email/i)).toBeVisible()
  })

  test('user can log in and is redirected to home', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)

    // Type to filter and select first suggestion (admin user)
    await page.getByPlaceholder(/Nom ou adresse email/i).fill('admin')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.getByRole('option').first().click()

    // Should redirect to home
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
