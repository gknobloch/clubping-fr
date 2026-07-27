import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('General admin — Équipes list', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/equipes')
  })

  test('shows the phase switcher and a team card with division/schedule/captain', async ({ page }) => {
    await expect(page.getByText('Saison 2025/2026 Phase 1')).toBeVisible()

    const card = page.locator('div').filter({ hasText: 'PPA Rixheim 1' }).filter({ hasText: 'Quentin Colle' }).last()
    await expect(card.getByText('GE 1')).toBeVisible()
    await expect(card.getByText('Samedi 16h00')).toBeVisible()
    await expect(card.getByText('Quentin Colle')).toBeVisible()
  })

  test('can open the edit modal from a card', async ({ page }) => {
    await page.getByRole('button', { name: 'Modifier' }).first().click()
    await expect(page.getByRole('heading', { name: "Modifier l'équipe" })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('heading', { name: "Modifier l'équipe" })).not.toBeVisible()
  })

  test('editing the team color updates the card swatch (#229 follow-up)', async ({ page }) => {
    const card = page.locator('div').filter({ hasText: 'PPA Rixheim 1' }).filter({ hasText: 'Quentin Colle' }).last()
    const swatch = card.locator('span').filter({ hasText: '1' }).first()
    await expect(swatch).toHaveCSS('background-color', 'rgb(55, 65, 81)') // team-1's mock color, #374151

    await card.getByRole('button', { name: 'Modifier' }).click()
    await expect(page.getByLabel('Couleur')).toHaveValue('#374151')
    await page.getByLabel('Couleur').fill('#00aa55')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('heading', { name: "Modifier l'équipe" })).not.toBeVisible()

    await expect(swatch).toHaveCSS('background-color', 'rgb(0, 170, 85)')
  })
})

test.describe('Player — Équipes list', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/equipes')
  })

  test('shows only the player\'s club teams with no admin actions', async ({ page }) => {
    await expect(page.getByText('PPA Rixheim 1', { exact: true })).toBeVisible()
    await expect(page.getByText('PPA Rixheim 8', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ajouter une équipe' })).toHaveCount(0)
  })
})
