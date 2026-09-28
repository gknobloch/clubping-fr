import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// #608 — a club's collective trainings. The mock club (Rixheim) has a regular
// Tuesday slot for everyone, and a guided series for its « Entraîneurs » group
// dated two, nine and sixteen days from today — the second one called off.

/**
 * The session cards of one training, in date order — by their accessible name
 * ("Entraînement dirigé, mardi 29 septembre"). Not by the title's text: the
 * title also carries the Dirigé / Libre pill, so an exact match finds nothing.
 */
const cards = (page: Page, name: string) => page.getByRole('article', { name: new RegExp(`^${name}, `) })

test.describe('Entraînements — un membre', () => {
  test.beforeEach(async ({ page }) => {
    // Enzo Lotz is in « Entraîneurs », so the guided series expects him.
    await loginAs(page, 'lotz')
    await page.getByRole('link', { name: 'Entraînements' }).first().click()
    await expect(page).toHaveURL('/entrainements')
  })

  test('says whether he comes to a guided session, and the tally follows', async ({ page }) => {
    const next = cards(page, 'Entraînement dirigé').first()
    await expect(next.getByText('Ma disponibilité')).toBeVisible()
    await expect(next.getByRole('button', { name: /1 oui · 1 peut-être · 1 sans réponse/ })).toBeVisible()

    // He had said « peut-être »; now he is coming. `exact`, or « OUI » also
    // names the tally button ("1 oui · …").
    await next.getByRole('button', { name: 'OUI', exact: true }).click()
    await expect(next.getByRole('button', { name: /2 oui · 1 sans réponse/ })).toBeVisible()
    // Touching the answer he gave withdraws it.
    await next.getByRole('button', { name: 'OUI', exact: true }).click()
    await expect(next.getByRole('button', { name: /1 oui · 2 sans réponse/ })).toBeVisible()
  })

  test('sees a session called off, with its reason, and cannot change the calendar', async ({ page }) => {
    await expect(page.getByText('Annulée — Salle prise pour le tournoi.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouvel entraînement' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Actions —/ })).toHaveCount(0)
  })
})

test.describe('Entraînements — un administrateur de club', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/entrainements')
  })

  test('creates a weekly slot, then calls one evening off', async ({ page }) => {
    await page.getByRole('button', { name: 'Nouvel entraînement' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Entraînement libre', { exact: true }).click()
    await dialog.getByLabel('Nom').fill('Loisirs du jeudi')
    await dialog.getByLabel('Jour').selectOption({ label: 'Jeudi' })
    await dialog.getByLabel('Début').fill('20:00')
    await dialog.getByLabel(/^Fin/).fill('21:30')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toHaveCount(0)

    const thursdays = cards(page, 'Loisirs du jeudi')
    await expect(thursdays.first()).toContainText('20h – 21h30')
    // The series sit folded at the top of the page; unfolded, the new slot is there.
    await page.getByRole('button', { name: /Créneaux et séries/ }).click()
    await expect(page.getByText('Tous les jeudis, 20h – 21h30')).toBeVisible()

    await thursdays.first().getByRole('button', { name: /^Actions —/ }).click()
    await page.getByRole('menuitem', { name: 'Annuler la séance' }).click()
    await page.getByRole('dialog').getByLabel(/Motif/).fill('Gymnase fermé')
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler la séance' }).click()
    await expect(thursdays.first()).toContainText('Annulée — Gymnase fermé')
  })
})
