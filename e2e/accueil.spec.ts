import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test.describe('Player — Accueil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'lotz')
  })

  test('shows welcome, club, and the upcoming match card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Enzo Lotz', level: 1 })).toBeVisible()
    await expect(page.getByRole('main').getByText('PPA Rixheim', { exact: true })).toBeVisible()
    await expect(page.getByText('Prochains matchs')).toBeVisible()
    await expect(page.getByText(/PPA Rixheim 1 – Etival 1/)).toBeVisible()
  })

  test('setting availability updates the "À confirmer" tile', async ({ page }) => {
    await expect(page.getByText('1 match', { exact: true })).toBeVisible()
    // Scoped: from md: up the card carries the team's answers too, so a bare
    // "OUI" is two controls — mine, and my own row in the roster (#461).
    await page.getByRole('group', { name: 'Ma disponibilité' }).getByRole('button', { name: 'OUI' }).click()
    await expect(page.getByText('0 matchs')).toBeVisible()
  })

  // #461 — the card carries the team from md: up, so the button that used to
  // open that list has nothing left to open at this width. Same split
  // "Composer l'équipe" makes below, and "Détails" makes inside the modal.
  test('porte la composition sur la carte, sans Aperçu à ouvrir', async ({ page }) => {
    const roster = page.getByRole('list', { name: "Disponibilité de l'équipe" })
    await expect(roster).toBeVisible()
    await expect(roster.getByText('Enzo Lotz')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aperçu' })).toBeHidden()
  })

  test.describe('sur téléphone', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('Aperçu opens the game modal, whose Détails leads to the round', async ({ page }) => {
      // The list would cost a screen of scrolling here, so the summary line
      // stays and the modal is still the way to the names.
      await expect(page.getByRole('list', { name: "Disponibilité de l'équipe" })).toBeHidden()
      await expect(page.getByText(/disponible.*sans réponse/)).toBeVisible()

      await page.getByRole('button', { name: 'Aperçu' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Disponibilités')).toBeVisible()

      // The way on is a link, not a button, and the destination depends on the
      // viewport (#347) — a phone here, so the match screen.
      const details = page.getByRole('dialog').getByRole('link', { name: 'Détails', exact: true })
      await expect(details).toHaveAttribute('href', /^\/journees\/.+/)

      await page.getByRole('button', { name: 'Fermer' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })
  })

  test('shows the "Tous mes matchs" section with a phase card', async ({ page }) => {
    await expect(page.getByText('Tous mes matchs')).toBeVisible()
    await expect(page.getByText('Saison 2025/2026 Phase 1')).toBeVisible()
  })

  // #385 — the card used to say nothing about the team's own state; a player
  // (let alone a captain) had to open "Aperçu" to learn it. Enzo Lotz is on
  // team-1's roster but not its captain, so the shortcut below is his to not see.
  //
  // From md: up the card says it in full (#461), and the count beside the
  // heading is what remains of the summary line — anchored, since the phone's
  // own line ends in the same three words.
  test('shows how many have not answered, and no shortcut to a non-captain', async ({ page }) => {
    await expect(page.getByText(/^\d+ sans réponse$/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Composer l'équipe/ })).toHaveCount(0)
  })

  test('shows "Matchs joués" beside "À confirmer"', async ({ page }) => {
    await expect(page.getByText('Matchs joués')).toBeVisible()
    await expect(page.getByText('À confirmer')).toBeVisible()
  })
})

// Quentin Colle (p2-player-2) captains team-1 — the "Composer l'équipe"
// shortcut on the card is his alone (#385).
test.describe('Player — Accueil (captain shortcut)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'colle')
  })

  // #456 — the shortcut leads somewhere different at each width, the same
  // split "Détails" makes above. On a wide screen the sheet was a full-height
  // list of the club laid over the matrix, which already shows the
  // availabilities, the brûlage and the club's other teams.
  test('mène à la journée, le match entouré, sur grand écran', async ({ page }) => {
    const compose = page.getByRole('link', { name: /Composer l'équipe/ })
    await expect(compose).toBeVisible()
    await expect(compose).toContainText('4/4')
    // The sheet's own trigger is not merely unused here — it is not rendered.
    await expect(page.getByRole('button', { name: /Composer l'équipe/ })).toBeHidden()

    await compose.click()
    await expect(page).toHaveURL(/\/journees\?equipe=team-1&match=g1-8/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // #347's ring — the point of the deep link is that the fixture is findable
    // in a matrix of otherwise identical cells.
    await expect(page.locator('.ring-accent-500').first()).toBeVisible()
  })

  test.describe('sur téléphone', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('ouvre la feuille en un geste, depuis la carte', async ({ page }) => {
      const compose = page.getByRole('button', { name: /Composer l'équipe/ })
      await expect(compose).toBeVisible()
      await expect(compose).toContainText('4/4')

      await compose.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/Sélection — PPA Rixheim 1/)).toBeVisible()
    })
  })
})

// Cédric Cunin is the seeded renfort/brûlage case: rostered on (and captain
// of) team-2, called up to team-1 for a second game — his full match history
// (shared with the player-detail screen via PlayerPhaseHistory) exercises the
// Cap./Brûlage badges and spans two of the club's teams.
test.describe('Player — Accueil (Tous mes matchs)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'cunin')
  })

  test('shows every game across the club, tagged with the team played for', async ({ page }) => {
    await expect(page.getByText('Tous mes matchs')).toBeVisible()
    await expect(page.getByText('Cap.')).toBeVisible()
    await expect(page.getByText('Brûlage')).toBeVisible()
    await expect(page.getByText('Matchs (2)')).toBeVisible()
    await expect(page.getByText('J1')).toBeVisible()
    await expect(page.getByText('J2')).toBeVisible()
    // 1 game for his own team (team-2) + 1 borrowed for team-1, out of team-2's 7 games.
    await expect(page.getByText('1 + 1 / 7 joués')).toBeVisible()
  })

  test('opens the game modal from the match history', async ({ page }) => {
    await page.getByRole('button', { name: 'Détails du match' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
