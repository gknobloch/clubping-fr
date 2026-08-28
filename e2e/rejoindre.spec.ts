import { test, expect } from '@playwright/test'

// #474 — the public way in. Nothing here is behind a session: this is the page
// a club's correspondent reaches when the app has never heard of their club, so
// every test starts logged out and stays that way.

// Read in the visitor's browser, like every FFTT call in this app — mocked so
// CI never reaches dafunker.
const CLUB_DETAIL = '**/xml_club_detail.php**'
const REQUESTS = '**/api/onboarding/requests'

const mulhouseXml =
  '<?xml version="1.0" encoding="ISO-8859-1"?>' +
  '<liste><club><numero>06680105</numero><nom>MULHOUSE TENNIS DE TABLE</nom>' +
  '<nomsalle>Salle Specifique MTT</nomsalle><adressesalle1>Rue Jean Martin</adressesalle1>' +
  '<codepsalle>68200</codepsalle><villesalle>MULHOUSE</villesalle>' +
  '<nomcor>BARLINGE</nomcor><prenomcor>Virginie</prenomcor>' +
  '<mailcor>Mulhouse-tennis-de-table@orange.fr</mailcor><telcor>0686839957</telcor>' +
  '</club></liste>'

const emptyXml = '<?xml version="1.0" encoding="ISO-8859-1"?><liste></liste>'

/** Find the club, landing on the request form. */
async function findClub(page: import('@playwright/test').Page, number = '06680105') {
  await page.goto('/rejoindre')
  await page.getByLabel('Numéro d’affiliation du club').fill(number)
  await page.getByRole('button', { name: 'Rechercher ce club' }).click()
}

test.describe('Page publique — faire administrer son club', () => {
  test('est accessible sans être connecté, depuis la connexion', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Demandez à l’administrer' }).click()
    await expect(page).toHaveURL('/rejoindre')
    await expect(page.getByRole('heading', { name: 'Faire administrer mon club' })).toBeVisible()
  })

  test('refuse un numéro qui n’a pas huit chiffres, sans appeler la FFTT', async ({ page }) => {
    let called = false
    await page.route(CLUB_DETAIL, (route) => {
      called = true
      return route.fulfill({ body: mulhouseXml, contentType: 'text/xml' })
    })
    await findClub(page, '123')
    await expect(page.getByRole('alert')).toContainText('numéro d’affiliation n’est pas valide')
    expect(called).toBe(false)
  })

  test('le dit quand la FFTT ne connaît pas le club', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: emptyXml, contentType: 'text/xml' }))
    await findClub(page, '06680999')
    await expect(page.getByRole('alert')).toContainText('Aucun club ne porte ce numéro')
  })

  test('montre le club et masque le contact publié par la FFTT', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: mulhouseXml, contentType: 'text/xml' }))
    await findClub(page)

    await expect(page.getByText('Mulhouse Tennis de Table')).toBeVisible()
    await expect(page.getByText('Salle Specifique MTT · Rue Jean Martin, 68200 Mulhouse')).toBeVisible()
    await expect(page.getByText('Virginie Barlinge')).toBeVisible()

    // La page est publique : l'adresse du correspondant n'y est jamais en clair.
    await expect(page.getByText('M•••••@orange.fr · ••••••57')).toBeVisible()
    await expect(page.getByText('Mulhouse-tennis-de-table@orange.fr')).toHaveCount(0)
    await expect(page.getByText('0686839957')).toHaveCount(0)
  })

  test('envoie la demande avec ce que le navigateur a lu à la FFTT', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: mulhouseXml, contentType: 'text/xml' }))
    let sent: Record<string, unknown> | null = null
    await page.route(REQUESTS, async (route) => {
      sent = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })

    await findClub(page)
    await page.getByLabel('Prénom').fill('Virginie')
    await page.getByLabel('Nom', { exact: true }).fill('Barlinge')
    await page.getByLabel('Adresse e-mail').fill('Mulhouse-tennis-de-table@orange.fr')
    await page.getByLabel('Téléphone (facultatif)').fill('0686839957')
    await page.getByLabel('Votre rôle dans le club (facultatif)').fill('Je suis la correspondante.')
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()

    await expect(page.getByText('Demande envoyée')).toBeVisible()
    // Et l'écran est franc sur ce qui ne se passera pas.
    await expect(page.getByText(/Aucun message automatique/)).toBeVisible()

    expect(sent).toMatchObject({
      affiliationNumber: '06680105',
      email: 'Mulhouse-tennis-de-table@orange.fr',
      firstName: 'Virginie',
      lastName: 'Barlinge',
      snapshot: {
        displayName: 'Mulhouse Tennis de Table',
        correspondentName: 'Virginie Barlinge',
        // Non masqué dans l'envoi : c'est l'écran qui masque, pas la donnée.
        correspondentEmail: 'Mulhouse-tennis-de-table@orange.fr',
      },
    })
  })

  test('n’envoie rien tant que le formulaire est incomplet', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: mulhouseXml, contentType: 'text/xml' }))
    let called = false
    await page.route(REQUESTS, async (route) => {
      called = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })

    await findClub(page)
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.getByRole('alert')).toContainText('nom et votre prénom')
    expect(called).toBe(false)

    await page.getByLabel('Prénom').fill('Virginie')
    await page.getByLabel('Nom', { exact: true }).fill('Barlinge')
    await page.getByLabel('Adresse e-mail').fill('pas-une-adresse')
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.getByRole('alert')).toContainText('adresse e-mail valide')
    expect(called).toBe(false)
  })

  test('affiche le refus du serveur tel quel', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: mulhouseXml, contentType: 'text/xml' }))
    await page.route(REQUESTS, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'already_pending', message: 'Une demande est déjà en attente pour ce club avec cette adresse.' }),
      }),
    )

    await findClub(page)
    await page.getByLabel('Prénom').fill('Virginie')
    await page.getByLabel('Nom', { exact: true }).fill('Barlinge')
    await page.getByLabel('Adresse e-mail').fill('v@example.fr')
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()

    await expect(page.getByRole('alert')).toContainText('déjà en attente')
    await expect(page.getByText('Demande envoyée')).toHaveCount(0)
  })

  test('permet de revenir sur le club choisi', async ({ page }) => {
    await page.route(CLUB_DETAIL, (route) => route.fulfill({ body: mulhouseXml, contentType: 'text/xml' }))
    await findClub(page)
    await page.getByRole('button', { name: 'Ce n’est pas mon club' }).click()
    await expect(page.getByLabel('Numéro d’affiliation du club')).toBeVisible()
  })
})
