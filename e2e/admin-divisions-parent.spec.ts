import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// Matches the mock data: phase-26-1 (2025/2026 Phase 1, active) has GE 1..GE 7,
// none of them carrying a parent (they predate #236).
test.describe('General admin — Division ranking (#236)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/divisions')
  })

  test('manual add asks for a parent instead of a rank', async ({ page }) => {
    await page.getByRole('button', { name: 'Ajouter une division' }).click()
    await expect(page.getByRole('heading', { name: 'Ajouter une division' })).toBeVisible()
    await expect(page.getByLabel('Division parente')).toBeVisible()
    await expect(page.getByLabel('Rang', { exact: false })).toHaveCount(0)

    await page.getByLabel('Nom de la division').fill('GE8')
    await page.getByLabel('Division parente').selectOption({ label: 'GE 7' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    // Dropped right after its parent (GE 7 is rank 7 among GE 1..GE 7).
    const rows = page.locator('tbody tr')
    await expect(rows.nth(6)).toContainText('GE 7')
    await expect(rows.nth(7)).toContainText('GE8')
  })

  test('a child division cannot move above its parent, nor the parent below its child', async ({ page }) => {
    await page.getByRole('button', { name: 'Ajouter une division' }).click()
    await page.getByLabel('Nom de la division').fill('GE 1 bis')
    await page.getByLabel('Division parente').selectOption({ label: 'GE 1' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    const rows = page.locator('tbody tr')
    const parentRow = rows.filter({ hasText: 'GE 1' }).first()
    const childRow = rows.filter({ hasText: 'GE 1 bis' })

    // Child can't move up past its own parent.
    await expect(childRow.getByRole('button', { name: 'Monter' })).toBeDisabled()
    // Parent can't move down past its own child.
    await expect(parentRow.getByRole('button', { name: 'Descendre' })).toBeDisabled()
  })
})
