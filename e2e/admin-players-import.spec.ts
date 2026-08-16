import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// Both FFTT endpoints are fetched straight from the browser (Cloudflare egress
// block, like every other FFTT import), so they are mocked per test and CI
// never reaches dafunker.
const ONE_LICENCE = '**/v1/joueur/**'
const CLUB_LICENCES = '**/xml_licence_b.php**'

/** A PPA Rixheim (06680011) licence absent from the seed, so this is a creation.
 *  "DU PONT-MARTIN" exercises the whole normalizer at once: a particle that
 *  stays lowercase inside the name, and a compound title-cased segment by
 *  segment. */
const newcomerJson = JSON.stringify({
  nom: 'DU PONT-MARTIN', prenom: 'Alain', licence: '9999999',
  numclub: '06680011', nomclub: 'RIXHEIM PPA', point: 803.0, pointm: 803.0, apointm: 788.34,
})

/** Grégory Canaque, already seeded with licence 425881 — an update, not a creation. */
const knownJson = JSON.stringify({
  nom: 'CANAQUE', prenom: 'Grégory', licence: '425881',
  numclub: '06680011', nomclub: 'RIXHEIM PPA', point: 1731, pointm: 1731,
})

/** A licence of another club — must be refused. */
const foreignJson = JSON.stringify({
  nom: 'MARTIN', prenom: 'Paul', licence: '1234567',
  numclub: '06680125', nomclub: 'ROSENAU TT', point: 900,
})

const clubXml =
  '<liste>' +
  '<licence><idlicence>41142</idlicence><licence>425881</licence><nom>CANAQUE</nom>' +
  '<prenom>Grégory</prenom><numclub>06680011</numclub><nomclub>RIXHEIM PPA</nomclub>' +
  '<point>1731</point><pointm>1731</pointm></licence>' +
  '<licence><idlicence>99999</idlicence><licence>9999999</licence><nom>DU PONT-MARTIN</nom>' +
  '<prenom>Alain</prenom><numclub>06680011</numclub><nomclub>RIXHEIM PPA</nomclub>' +
  '<point>803</point><pointm>803</pointm></licence>' +
  '</liste>'

async function openImport(page: import('@playwright/test').Page) {
  await page.goto('/joueurs')
  await page.getByRole('button', { name: 'Importer depuis la FFTT' }).click()
  return page.getByRole('dialog')
}

test.describe('Club admin — Joueurs FFTT import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'club.admin')
  })

  test('imports a new licensee, normalizing the name and recording the points', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.fulfill({ body: newcomerJson, contentType: 'application/json' }))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('9999999')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    // "DU PONT-MARTIN" → "Du Pont-Martin": ffttClub's normalizer would have
    // left "DU" alone as a club abbreviation.
    await expect(dialog.getByText('Alain Du Pont-Martin')).toBeVisible()
    await expect(dialog.getByText('Nouveau')).toBeVisible()
    // Points come from `point` (803), not from apointm (788.34).
    await expect(dialog.getByText('803', { exact: false })).toBeVisible()

    await dialog.getByRole('button', { name: 'Importer la sélection' }).click()
    await expect(dialog.getByText(/1 joueur créé/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Fermer' }).click()

    await page.getByPlaceholder(/Rechercher par nom/i).fill('Pont-Martin')
    await expect(page.getByRole('cell', { name: 'Alain Du Pont-Martin' })).toBeVisible()
  })

  test('shows what would change on a licensee we already hold', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.fulfill({ body: knownJson, contentType: 'application/json' }))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('425881')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText('Modifié')).toBeVisible()
    // The name is already right, so only the points are offered.
    const points = dialog.getByRole('checkbox', { name: /Points/ })
    await expect(points).toBeChecked()
    await expect(dialog.getByText('1731')).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: /Nom/ })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Importer la sélection' }).click()
    await expect(dialog.getByText(/1 mis à jour/)).toBeVisible()
  })

  test('refuses a licence belonging to another club', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.fulfill({ body: foreignJson, contentType: 'application/json' }))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('1234567')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText(/Cette licence appartient à Rosenau TT/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Importer la sélection' })).toHaveCount(0)
  })

  test('loads the whole club, splitting new from already known', async ({ page }) => {
    await page.route(CLUB_LICENCES, (route) => route.fulfill({ body: clubXml, contentType: 'text/xml' }))

    const dialog = await openImport(page)
    await dialog.getByRole('button', { name: 'Charger tous les licenciés du club' }).click()

    await expect(dialog.getByText('Nouveau')).toBeVisible()
    await expect(dialog.getByText('Modifié')).toBeVisible()
    // Everyone else in the seed is absent from this two-licence list, and is
    // reported rather than removed.
    await expect(dialog.getByText(/Absents de la liste FFTT/)).toBeVisible()
    await expect(dialog.getByText(/Rien n’est supprimé/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Importer la sélection' }).click()
    await expect(dialog.getByText(/1 joueur créé/)).toBeVisible()
  })

  test('reports an unreachable FFTT without writing anything', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.abort())

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('9999999')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText(/Impossible de contacter la FFTT/)).toBeVisible()
  })
})

test.describe('Joueurs FFTT import — mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  // Dense comparison screen, desktop-only for now (#381, #384).
  test('the import trigger is not offered below md:', async ({ page }) => {
    await loginAs(page, 'club.admin')
    await page.goto('/joueurs')
    await expect(page.getByRole('button', { name: 'Ajouter un joueur' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Importer depuis la FFTT' })).toBeHidden()
  })
})
