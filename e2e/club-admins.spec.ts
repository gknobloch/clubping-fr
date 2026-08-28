import { test, expect } from '@playwright/test'
import { acceptConfirm, loginAs } from './helpers'

// #474 — appointing and standing down a club's admins, from the club page.
// The cap and the never-zero rule are pinned down in the unit and API suites;
// what this walks is the journey a club admin actually takes.

/** The Administrateurs section, scoped so its "Retirer" buttons stay separable. */
const section = (page: import('@playwright/test').Page) =>
  page.getByRole('region').filter({ hasText: 'Administrateurs' })

test.describe('Club admin — administrateurs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/club')
  })

  test('lists the club’s admins with the count against the cap', async ({ page }) => {
    const admins = section(page)
    await expect(admins).toBeVisible()
    // Rixheim starts with two: the non-playing secretary and a promoted player.
    await expect(admins.getByText('2 / 5')).toBeVisible()
    await expect(admins.getByText('Virginie Barlinge')).toBeVisible()
    await expect(admins.getByText('Grégory Canaque')).toBeVisible()
    // The secretary holds no licence and is marked as such — on her row, not
    // to be confused with the "Inviter une personne non licenciée" button.
    const secretary = admins.getByRole('listitem').filter({ hasText: 'Virginie Barlinge' })
    await expect(secretary.getByText('Non licencié', { exact: true })).toBeVisible()
  })

  test('appoints a member of the club, who then counts as an admin', async ({ page }) => {
    const admins = section(page)
    await admins.getByRole('button', { name: '+ Désigner un membre' }).click()

    const picker = page.getByRole('dialog')
    await expect(picker).toBeVisible()
    // Someone already administering the club is not on offer.
    await expect(picker.getByRole('button', { name: /Grégory Canaque/ })).toHaveCount(0)
    await picker.getByRole('button', { name: /Quentin Colle/ }).click()

    await expect(admins.getByText('3 / 5')).toBeVisible()
    await expect(admins.getByText('Quentin Colle')).toBeVisible()
  })

  test('stands an admin down, leaving them a player of the club', async ({ page }) => {
    const admins = section(page)
    const row = admins.getByRole('listitem').filter({ hasText: 'Grégory Canaque' })
    await row.getByRole('button', { name: 'Retirer' }).click()

    // The dialog says what survives the removal, which for a player is a lot.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('reste joueuse du club')
    await acceptConfirm(page, 'Retirer')

    await expect(admins.getByText('1 / 5')).toBeVisible()
    await expect(admins.getByText('Grégory Canaque')).toHaveCount(0)

    // Still on the roster: the role went, the licence did not (#474). The
    // directory shows the name twice (row and link), so match the row.
    await page.goto('/joueurs')
    await expect(page.getByRole('row', { name: /Grégory Canaque/ })).toBeVisible()
  })

  test('will not remove the last admin, and says why', async ({ page }) => {
    const admins = section(page)
    // Down to one first.
    await admins
      .getByRole('listitem')
      .filter({ hasText: 'Grégory Canaque' })
      .getByRole('button', { name: 'Retirer' })
      .click()
    await acceptConfirm(page, 'Retirer')
    await expect(admins.getByText('1 / 5')).toBeVisible()

    // The last one is refused before any dialog opens.
    await admins.getByRole('button', { name: 'Retirer' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(admins.getByRole('alert')).toContainText('dernier administrateur')
    await expect(admins.getByText('1 / 5')).toBeVisible()
  })

  test('invites someone who holds no licence', async ({ page }) => {
    const admins = section(page)
    await admins.getByRole('button', { name: /Inviter une personne non licenciée/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Inviter' })).toBeDisabled()
    await dialog.getByLabel('Prénom').fill('Sylvie')
    await dialog.getByLabel('Nom', { exact: true }).fill('Trésorière')
    await dialog.getByLabel('Adresse e-mail').fill('sylvie@example.com')
    await dialog.getByRole('button', { name: 'Inviter' }).click()

    await expect(admins.getByText('3 / 5')).toBeVisible()
    await expect(admins.getByText('Sylvie Trésorière')).toBeVisible()

    // Created as a member who does not play, so no roster gains a name.
    await page.goto('/joueurs')
    await expect(page.getByRole('row', { name: /Sylvie Trésorière/ })).toHaveCount(0)
  })
})

test.describe('Player — administrateurs', () => {
  test('sees who runs the club but is offered no control over it', async ({ page }) => {
    await loginAs(page, 'szulc')
    await page.goto('/club')

    const admins = section(page)
    await expect(admins.getByText('Virginie Barlinge')).toBeVisible()
    await expect(admins.getByRole('button', { name: 'Retirer' })).toHaveCount(0)
    await expect(admins.getByRole('button', { name: '+ Désigner un membre' })).toHaveCount(0)
  })
})
