import { test, expect } from '@playwright/test'
import { loginAs, runRowAction } from './helpers'

// #454 — past a dozen licenciés, every "pick a player" list is a scroll. The
// club in the fixtures has forty-six, which is the ordinary case, not the
// extreme one. Two flows here: the admin adding someone to a team roster, and
// a captain composing a line-up from a phone.

test.describe('Ajouter un joueur à une équipe (#454)', () => {
  // The native dropdown this replaces was unusable on a phone: a spinning
  // wheel of the whole club with a keyboard that did nothing. The fixtures put
  // almost every licencié in a roster already, so the shortlist here is under
  // the search threshold — what this covers is the sheet itself.
  test('choisit le joueur dans une feuille, pas dans un menu déroulant', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/equipes')

    const card = page
      .locator('div')
      .filter({ hasText: 'PPA Rixheim 1' })
      .filter({ hasText: 'Quentin Colle' })
      .last()
    await runRowAction(page, card, 'Modifier')

    const teamDialog = page.getByRole('dialog')
    await teamDialog.getByRole('button', { name: '+ Ajouter un joueur' }).click()

    // The picker opens on top of the team dialog, hence addressed by its title.
    const picker = page.getByRole('dialog', { name: 'Ajouter un joueur' })
    await expect(picker).toBeVisible()

    await picker.getByRole('button', { name: /Jordan Pesenti/ }).click()

    // The sheet stays open — a roster is several names in a row — and the
    // player is already in the table behind it.
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: 'Fermer' }).click()

    await expect(teamDialog.getByRole('cell', { name: 'Jordan Pesenti' })).toBeVisible()
  })
})

test.describe('Composer depuis un téléphone (#454)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('filtre « Autres joueurs » par nom', async ({ page }) => {
    await loginAs(page, 'colle')
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    await page.getByRole('link', { name: 'Détails' }).click()
    await page.getByRole('button', { name: /Composer l’équipe|Composer l'équipe/ }).click()

    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    const search = sheet.getByLabel('Rechercher un joueur')
    await expect(search).toBeVisible()
    await search.fill('buchi')

    await expect(sheet.getByText('Christian Buchi')).toBeVisible()
    // The roster section is filtered too: to the captain it is one list.
    await expect(sheet.getByText('Quentin Colle')).toBeHidden()
  })
})
