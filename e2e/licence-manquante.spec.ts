import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// #488 — the club import already knows who the FFTT did not list ("Absents de
// la liste FFTT"), and used to forget it the moment the dialog closed. It is
// now recorded per season, so the tag rides next to the name and the line-up
// sheet says so before a captain fields somebody who may not play.
//
// In the mock, Stéphane Lach (p2-player-3) is the one licensee left off the
// federation's list — and he is on team 5's roster, so he is pickable.

const LACH = 'Stéphane Lach'

test.describe('Licence non validée (#488)', () => {
  test('marque le licencié dans la liste des joueurs', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/joueurs')
    const row = page.getByRole('row', { name: new RegExp(LACH) })
    await expect(row).toContainText('Sans licence')

    // And only him: the tag is a statement about one member, not the club.
    const other = page.getByRole('row', { name: /Joris Szulc/ })
    await expect(other).not.toContainText('Sans licence')
  })

  // The matrix is the screen a captain works from: the fact has to be there
  // too, not only on a match's own page.
  test('marque le licencié dans la matrice des journées', async ({ page }) => {
    await loginAs(page, 'colle')
    await page.goto('/journees')
    await expect(page.getByRole('row', { name: new RegExp(LACH) })).toContainText('Sans licence')
    await expect(page.getByRole('row', { name: /Joris Szulc/ })).not.toContainText('Sans licence')
  })

  test('le marque aussi sur sa fiche', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/joueurs/p2-player-3')
    await expect(page.getByRole('heading', { name: new RegExp(LACH) })).toContainText('Sans licence')
  })

  // The line-up sheet is the phone's way in (#382); on a desktop the same
  // choice is made in the "Autres joueurs" matrix.
  test.describe('depuis un téléphone', () => {
    test.use({ viewport: { width: 375, height: 812 } })

  // The captain has to know without going looking: the line-up he saved three
  // weeks ago is the one he will field, and nobody reopens the sheet to check.
  test('le dit sur la composition déjà enregistrée, pas seulement en composant', async ({ page }) => {
    await loginAs(page, 'colle')
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    await page.getByRole('link', { name: 'Détails' }).click()
    await expect(page).toHaveURL(/\/journees\//)

    await expect(page.getByRole('alert'))
      .toContainText(`${LACH} — licence non validée cette saison`)
    // And the tag rides next to his name in the roster itself.
    await expect(page.getByRole('listitem').filter({ hasText: LACH }))
      .toContainText('Sans licence')
  })

  test('le marque dans l’aperçu d’une rencontre', async ({ page }) => {
    await loginAs(page, 'colle')
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('listitem').filter({ hasText: LACH })).toContainText('Sans licence')
  })

  test('prévient le capitaine qui l’aligne, sans l’en empêcher', async ({ page }) => {
    await loginAs(page, 'colle')
    await page.goto('/')
    await page.getByRole('button', { name: 'Aperçu' }).first().click()
    await page.getByRole('link', { name: 'Détails' }).click()
    await expect(page).toHaveURL(/\/journees\//)

    const compose = page.getByRole('button', { name: /Composer l’équipe|Composer l'équipe/ })
    await compose.click()
    const sheet = page.getByRole('dialog')

    // Tagged in the list, and still selectable — an unvalidated licence is
    // usually a renewal in flight, and the captain is the one who knows.
    const row = sheet.getByRole('button', { name: new RegExp(LACH) })
    await expect(row).toContainText('Sans licence')

    // He is already in the saved line-up, which is exactly the case worth
    // warning about: nobody would think to check him again.
    await expect(sheet.getByRole('alert'))
      .toContainText(`${LACH} n’a pas de licence validée pour cette saison`)

    // Taking him off withdraws the warning; putting him back brings it.
    await row.click()
    await expect(sheet.getByRole('alert')).toHaveCount(0)
    await row.click()
    await expect(sheet.getByRole('alert')).toContainText(LACH)

    // And it never blocks: the line-up saves as composed.
    await sheet.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(sheet).toBeHidden()
  })
  })
})
