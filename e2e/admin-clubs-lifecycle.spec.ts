import { test, expect } from '@playwright/test'
import { loginAs, acceptConfirm } from './helpers'

// The browser fetches xml_club_detail.php directly (Cloudflare/FFTT egress
// block, same as the other FFTT imports) — mocked per test.
const CLUB_DETAIL = '**/xml_club_detail.php**'

const newClubXml =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><club><numero>06680997</numero><nom>TT ORPHELIN</nom>' +
  '<nomsalle>Salle des Sports</nomsalle><adressesalle1>1 rue Test</adressesalle1>' +
  '<codepsalle>68000</codepsalle><villesalle>TESTVILLE</villesalle></club></liste>'

const rixheimUpdatedXml =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><club><numero>06680011</numero><nom>RIXHEIM PPA NOUVEAU</nom>' +
  '<nomsalle>Nouveau Gymnase</nomsalle><adressesalle1>9 rue Neuve</adressesalle1>' +
  '<codepsalle>68170</codepsalle><villesalle>RIXHEIM</villesalle></club></liste>'

test.describe('General admin — Clubs lifecycle (archive / activate / delete)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('archives then reactivates a club from the list', async ({ page }) => {
    await page.goto('/clubs')

    await page.getByRole('row').filter({ hasText: 'Etival' }).getByRole('button', { name: 'Archiver' }).click()
    await acceptConfirm(page, 'Archiver')

    // Hidden from the default (active-only) view once archived.
    await expect(page.getByRole('cell', { name: 'Etival' })).toHaveCount(0)

    await page.getByText(/Afficher les clubs archivés/).click()
    const row = page.getByRole('row').filter({ hasText: 'Etival' })
    await expect(row.getByText('Archivé')).toBeVisible()

    await row.getByRole('button', { name: 'Activer' }).click()
    await expect(row.getByText('Archivé')).toHaveCount(0)
  })

  test('disables Supprimer for an archived club that still has teams/players', async ({ page }) => {
    await page.goto('/clubs')

    await page.getByRole('row').filter({ hasText: 'PPA Rixheim' }).getByRole('button', { name: 'Archiver' }).click()
    await acceptConfirm(page, 'Archiver')

    await page.getByText(/Afficher les clubs archivés/).click()
    const row = page.getByRole('row').filter({ hasText: 'PPA Rixheim' })
    await expect(row.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  })

  test('imports a fresh club (no dependents) then archives and deletes it for good', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: newClubXml, contentType: 'text/xml' }))

    await page.goto('/clubs')
    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('N° affiliation').fill('06680997')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()
    await dialog.getByRole('button', { name: 'Importer ce club' }).click()
    await dialog.getByRole('button', { name: 'Fermer' }).click()

    await expect(page.getByRole('cell', { name: 'TT Orphelin' })).toBeVisible()

    await page.getByRole('row').filter({ hasText: 'TT Orphelin' }).getByRole('button', { name: 'Archiver' }).click()
    await acceptConfirm(page, 'Archiver')

    await page.getByText(/Afficher les clubs archivés/).click()
    const row = page.getByRole('row').filter({ hasText: 'TT Orphelin' })
    const deleteButton = row.getByRole('button', { name: 'Supprimer' })
    await expect(deleteButton).toBeEnabled()

    await deleteButton.click()
    await acceptConfirm(page, 'Supprimer')
    await expect(page.getByRole('cell', { name: 'TT Orphelin' })).toHaveCount(0)
  })

  test('offers a direct reactivate button when re-importing an archived club', async ({ page }) => {
    await page.goto('/clubs')
    await page.getByRole('row').filter({ hasText: 'Etival' }).getByRole('button', { name: 'Archiver' }).click()
    await acceptConfirm(page, 'Archiver')

    const etivalXml =
      '<?xml version="1.0" encoding="ISO-8859-1"?><liste><club><numero>06880123</numero><nom>ETIVAL</nom></club></liste>'
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: etivalXml, contentType: 'text/xml' }))

    await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('N° affiliation').fill('06880123')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText('Archivé')).toBeVisible()
    await dialog.getByRole('button', { name: 'Réactiver ce club' }).click()
    await expect(dialog.getByText('Archivé')).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('cell', { name: 'Etival' })).toBeVisible()
  })

  // #275: the detail page used to be routed on the affiliation number, so a
  // club without one (allowed since migration 0019) had no reachable page at
  // all — "Modifier" landed on "Club introuvable.".
  test('opens and edits a club that has no affiliation number', async ({ page }) => {
    await page.goto('/clubs')

    await page.getByRole('button', { name: 'Ajouter un club' }).click()
    const createDialog = page.getByRole('dialog')
    await createDialog.getByLabel('Nom').fill('TT Sans Numéro')
    await createDialog.getByRole('button', { name: 'Enregistrer' }).click()

    const row = page.getByRole('row').filter({ hasText: 'TT Sans Numéro' })
    await row.getByRole('button', { name: 'Modifier' }).click()

    await expect(page.getByRole('heading', { name: 'TT Sans Numéro' })).toBeVisible()
    // Nothing to sync against without a number, so the action is disabled.
    await expect(page.getByRole('button', { name: 'Synchroniser depuis la FFTT' })).toBeDisabled()

    // The URL is the club id, so filling the number in does not invalidate it.
    const url = page.url()
    await page.getByLabel('N° affiliation').fill('06680998')
    await page.getByRole('button', { name: 'Enregistrer' }).first().click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('button', { name: 'Synchroniser depuis la FFTT' })).toBeEnabled()
  })

  test('syncs a club’s name and address from the FFTT on its detail page', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: rixheimUpdatedXml, contentType: 'text/xml' }))

    await page.goto('/clubs/club-fftt-06680011')
    await page.getByRole('button', { name: 'Synchroniser depuis la FFTT' }).click()

    // #280: nothing is written until the preview is confirmed.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Synchroniser depuis la FFTT' })).toBeVisible()
    // The name row shows both sides. "RIXHEIM PPA NOUVEAU" normalized:
    // "RIXHEIM"/"NOUVEAU" title-cased, "PPA" (<=4 letters) kept as-is.
    const nameRow = dialog.locator('li').filter({ hasText: 'Nom du club' })
    await expect(nameRow).toContainText('PPA Rixheim')
    await expect(nameRow).toContainText('Rixheim PPA Nouveau')
    const venueRow = dialog.locator('li').filter({ hasText: 'Lieu de jeu' })
    await expect(venueRow).toContainText('12 rue du Sport')
    await expect(venueRow).toContainText('9 rue Neuve')
    await dialog.getByRole('button', { name: 'Appliquer' }).click()

    await expect(page.getByText('Club synchronisé.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Rixheim PPA Nouveau/ })).toBeVisible()
  })

  // #280: the whole point — take the venue, keep a hand-edited club name.
  test('sync can apply the address while leaving the club name untouched', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: rixheimUpdatedXml, contentType: 'text/xml' }))

    await page.goto('/clubs/club-fftt-06680011')
    await page.getByRole('button', { name: 'Synchroniser depuis la FFTT' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.locator('#import-field-displayName').uncheck()
    await dialog.getByRole('button', { name: 'Appliquer' }).click()

    await expect(page.getByText('Club synchronisé.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'PPA Rixheim' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Rixheim PPA Nouveau/ })).toHaveCount(0)
    await expect(page.getByText('9 rue Neuve')).toBeVisible()
  })

  test('sync changes nothing when cancelled', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: rixheimUpdatedXml, contentType: 'text/xml' }))

    await page.goto('/clubs/club-fftt-06680011')
    await page.getByRole('button', { name: 'Synchroniser depuis la FFTT' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()

    await expect(page.getByText('Club synchronisé.')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'PPA Rixheim' })).toBeVisible()
  })
})
