import { expect, Page } from '@playwright/test'

/**
 * Log in as a user by typing in the search and selecting the first matching option.
 * Assumes we're on /login.
 */
/**
 * Accept the in-app confirmation dialog. Since #375 the destructive actions no
 * longer go through `window.confirm` — it is silently inert on iOS Safari once
 * a member blocks dialogs, which made archive, delete and logout do nothing at
 * all. `action` is the confirm button's label ("Archiver", "Supprimer", …).
 */
export async function acceptConfirm(page: Page, action: string | RegExp) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: action }).click()
  await expect(dialog).toBeHidden()
}

/** Decline the in-app confirmation dialog. */
export async function declineConfirm(page: Page) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()
}

export async function loginAs(page: Page, search: string) {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)
  await page.getByPlaceholder(/Nom ou adresse email/i).fill(search)
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option').first().click()
  await expect(page).toHaveURL('/')
}
