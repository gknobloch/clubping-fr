import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// FFTT is fetched straight from the browser (Cloudflare egress block, like
// every other FFTT import), so it is mocked per test and CI never reaches
// dafunker. One licence and a whole club are the same endpoint with a
// different query — the JSON /v1/joueur/<licence> twin sends no CORS header
// and is unusable from a page — so the two are told apart by their parameter.
const ONE_LICENCE = (url: URL) => url.pathname.endsWith('/xml_licence_b.php') && url.searchParams.has('licence')
const CLUB_LICENCES = (url: URL) => url.pathname.endsWith('/xml_licence_b.php') && url.searchParams.has('club')

const record = (fields: Record<string, string>) =>
  '<licence>' + Object.entries(fields).map(([k, v]) => `<${k}>${v}</${k}>`).join('') + '</licence>'

const liste = (...records: string[]) =>
  '<?xml version="1.0" encoding="ISO-8859-1"?><liste>' + records.join('') + '</liste>'

/** A PPA Rixheim (06680011) licence absent from the seed, so this is a creation.
 *  "DU PONT-MARTIN" exercises the whole normalizer at once: a particle that
 *  stays lowercase inside the name, and a compound title-cased segment by
 *  segment. */
const newcomer = record({
  idlicence: '99999', licence: '9999999', nom: 'DU PONT-MARTIN', prenom: 'Alain',
  numclub: '06680011', nomclub: 'RIXHEIM PPA', point: '803', pointm: '803', apointm: '788.34',
})

/** Grégory Canaque, already seeded with licence 425881 — an update, not a creation. */
const known = record({
  idlicence: '41142', licence: '425881', nom: 'CANAQUE', prenom: 'Gregory',
  numclub: '06680011', nomclub: 'RIXHEIM PPA', point: '1731', pointm: '1731',
})

/** A licence of another club — must be refused. */
const foreign = record({
  idlicence: '15603', licence: '1234567', nom: 'MARTIN', prenom: 'Paul',
  numclub: '06680125', nomclub: 'ROSENAU TT', point: '900', pointm: '900',
})

const clubXml = liste(known, newcomer)

const xml = (body: string) => ({ body, contentType: 'text/xml' })

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
    await page.route(ONE_LICENCE, (route) => route.fulfill(xml(liste(newcomer))))

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
    await page.route(ONE_LICENCE, (route) => route.fulfill(xml(liste(known))))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('425881')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText('Modifié')).toBeVisible()
    // FFTT states the first name unaccented ("Gregory"); we hold "Grégory".
    // That is not a correction, so only the points are offered.
    const points = dialog.getByRole('checkbox', { name: /Points/ })
    await expect(points).toBeChecked()
    await expect(dialog.getByText('1731')).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: /Nom/ })).toHaveCount(0)
    await expect(dialog.getByRole('checkbox', { name: /Prénom/ })).toHaveCount(0)
    // And the row is titled with our spelling, not FFTT's.
    await expect(dialog.getByText('Grégory Canaque')).toBeVisible()

    await dialog.getByRole('button', { name: 'Importer la sélection' }).click()
    await expect(dialog.getByText(/1 mis à jour/)).toBeVisible()
  })

  test('refuses a licence belonging to another club', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.fulfill(xml(liste(foreign))))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('1234567')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText(/Cette licence appartient à Rosenau TT/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Importer la sélection' })).toHaveCount(0)
  })

  test('loads the whole club, splitting new from already known', async ({ page }) => {
    await page.route(CLUB_LICENCES, (route) => route.fulfill(xml(clubXml)))

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

  test('reports an unknown licence — an empty list, not an error', async ({ page }) => {
    await page.route(ONE_LICENCE, (route) => route.fulfill(xml(liste())))

    const dialog = await openImport(page)
    await dialog.getByLabel('N° licence').fill('0000000')
    await dialog.getByRole('button', { name: 'Rechercher' }).click()

    await expect(dialog.getByText('Aucun licencié trouvé.')).toBeVisible()
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
    // With the import gone, the manual add is the page's only action and takes
    // the filled look back (it is outlined on desktop, where import leads).
    await expect(page.getByRole('button', { name: 'Ajouter un joueur' }))
      .toHaveCSS('background-color', 'rgb(201, 47, 47)')
  })
})
