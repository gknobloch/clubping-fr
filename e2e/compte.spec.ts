import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Player — Compte', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'knobloch')
  })

  test('reachable from the header name and shows identity', async ({ page }) => {
    await page.getByRole('link', { name: /Gilles Knobloch/ }).click()
    await expect(page).toHaveURL('/compte')
    await expect(page.getByRole('heading', { name: 'Gilles Knobloch' })).toBeVisible()
    await expect(page.getByText('Joueur', { exact: true })).toBeVisible()
  })

  test('editing a contact field persists the change', async ({ page }) => {
    await page.goto('/compte')
    await page.getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Téléphone').fill('0612345678')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible()
    await expect(page.getByText('0612345678')).toBeVisible()
  })

  test('can log out from Compte', async ({ page }) => {
    await page.goto('/compte')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Club Ping/i })).toBeVisible()
  })

  // #315 — the column is nullable, but you cannot take your own address away:
  // it is how you sign in. Only an admin may clear it, from the Joueurs page.
  test('refuses to let a member remove their own e-mail', async ({ page }) => {
    await page.goto('/compte')
    await page.getByRole('button', { name: 'Modifier' }).click()
    await page.getByLabel('Email').fill('')

    const save = page.getByRole('button', { name: 'Enregistrer' })
    await expect(save).toBeDisabled()
    await expect(page.getByText(/sert à vous connecter/)).toBeVisible()

    // Typing one back re-enables the form; the rest of the fields still save.
    await page.getByLabel('Email').fill('gilles@example.com')
    await expect(save).toBeEnabled()
  })
})
