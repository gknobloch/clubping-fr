import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// Matches the mock data: phase-26-1 (2025/2026 Phase 1, active) has GE 1..GE 7,
// GE 2..GE 5 each hanging from the one above.
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

  // #694 — the parent was only chosen at creation, and a deleted parent left
  // its children pointing at nothing. GE 1 → GE 5 are a chain; GE 6 and GE 7
  // have no parent.
  const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(`^${name}(?!\\d)`) })

  test('an existing division takes a new parent among those ranked above it', async ({ page }) => {
    await row(page, 'GE 7').getByRole('button', { name: 'Modifier' }).click()
    const parent = page.getByLabel('Division parente')
    await expect(parent).toHaveValue('')
    // Only what ranks above it is offered — never GE 7 itself.
    await expect(parent.locator('option')).toHaveText(['Aucune (division de tête)', 'GE 1', 'GE 2', 'GE 3', 'GE 4', 'GE 5', 'GE 6'])
    await parent.selectOption({ label: 'GE 6' })
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(row(page, 'GE 7').getByRole('button', { name: 'Monter' })).toBeDisabled()
    await expect(row(page, 'GE 6').getByRole('button', { name: 'Descendre' })).toBeDisabled()
  })

  test('deleting a division hands its children to its own parent', async ({ page }) => {
    await row(page, 'GE 3').getByRole('button', { name: 'Archiver' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click()
    await page.getByLabel(/Afficher les divisions archivées/).check()
    await row(page, 'GE 3').getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(row(page, 'GE 3')).toHaveCount(0)

    // GE 4 now hangs from GE 2, directly above it.
    await expect(row(page, 'GE 4').getByRole('button', { name: 'Monter' })).toBeDisabled()
    await row(page, 'GE 4').getByRole('button', { name: 'Modifier' }).click()
    await expect(page.getByLabel('Division parente').locator('option:checked')).toHaveText('GE 2')
  })
})
