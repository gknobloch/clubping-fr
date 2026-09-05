import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers'

// The E2E dev server has no API; the import endpoint is mocked per test.
const IMPORT = '**/api/schedule-documents/import'

// ---------------------------------------------------------------------------
// Fixture document
// ---------------------------------------------------------------------------
// The file is built here rather than committed as a binary so the lines under
// test are readable in the diff. It is a real PDF with a genuine text layer,
// so this drives the actual pdfjs path the app uses — not a stub. One page per
// poule, as FFTT publishes them (#486).
//
// Deliberately NOT an image: the OCR fallback is tesseract/WASM, far too slow
// and variable to belong in a browser test. OCR tolerance is covered where it
// can be tested precisely, on fixed text, in ffttScheduleDocumentOcr.spec.ts.

function buildTextPdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  // One text-showing operator per line, each on its own baseline, so the app's
  // reconstructLines() groups them back into exactly these strings.
  const contents = pages.map((lines) => {
    let y = 800
    return lines
      .filter((l) => l.trim())
      .map((l) => { const op = `BT /F1 10 Tf 40 ${y} Td (${esc(l)}) Tj ET`; y -= 14; return op })
      .join('\n')
  })
  // 1 catalog, 2 pages node, then one page + one content stream per page, font last.
  const pageObj = (i: number) => 3 + i * 2
  const fontObj = 3 + pages.length * 2
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    `<</Type/Pages/Kids[${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}]/Count ${pages.length}>>`,
    ...pages.flatMap((_, i) => [
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${pageObj(i) + 1} 0 R/Resources<</Font<</F1 ${fontObj} 0 R>>>>>>`,
      `<</Length ${Buffer.byteLength(contents[i], 'latin1')}>>\nstream\n${contents[i]}\nendstream`,
    ]),
    // WinAnsiEncoding so "Journée" survives the round trip.
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

// Matches the mock data: division 198609 "GE 1" (phase-26-1, season 26) holds
// group-1 "Poule 1", whose teams include PPA Rixheim 1 (06680011), Etival 1
// (06880123), Rosenau 1 (06680125) and RC Strasbourg 2 (06670045). Every team
// here already exists, so a clean run creates none.
const POULE_1_LINES = [
  'CHAMPIONNAT GRAND EST 1 Poule 1',
  '1ère phase 2025-2026',
  '1 RIXHEIM PPA 1 Samedi 16h 06680011',
  '2 ETIVAL TT 1 Samedi 16h 06880123',
  '3 ROSENAU TT 1 Samedi 16h 06680125',
  '4 STRASBOURG RCS 2 Samedi 16h 06670045',
  'Journée 1 : 19 septembre 2026',
  'Samedi 16h RIXHEIM PPA 1 contre ROSENAU TT 1 -',
  'Samedi 16h ETIVAL TT 1 contre STRASBOURG RCS 2 -',
  'Journée 2 : 03 octobre 2026',
  'Samedi 16h ROSENAU TT 1 contre ETIVAL TT 1 -',
  'Samedi 16h STRASBOURG RCS 2 contre RIXHEIM PPA 1 -',
]

// The second page of a two-poule export: same division, poule 2, and a poule
// the mock data does not have — so the row offers to create it, which is what
// an admin importing a division's whole calendar actually faces.
const POULE_2_LINES = [
  'CHAMPIONNAT GRAND EST 1 Poule 2',
  '1ère phase 2025-2026',
  '1 VITTEL ST REMY 1 Samedi 16h 06880022',
  '2 ILLZACH TTSJB 2 Samedi 16h 06680091',
  '3 MOUSSEY TT 1 Samedi 16h 06100004',
  '4 ANOULD CP 2 Samedi 16h 06880002',
  'Journée 1 : 19 septembre 2026',
  'Samedi 16h VITTEL ST REMY 1 contre ANOULD CP 2 -',
  'Samedi 16h ILLZACH TTSJB 2 contre MOUSSEY TT 1 -',
  'Journée 2 : 03 octobre 2026',
  'Samedi 16h MOUSSEY TT 1 contre ILLZACH TTSJB 2 -',
  'Samedi 16h ANOULD CP 2 contre VITTEL ST REMY 1 -',
]

// Same document, except ROSENAU plays twice in journée 1 — impossible, so the
// parse is provably wrong and the file must be refused outright (#299).
const REPEATED_TEAM_LINES = [
  ...POULE_1_LINES.slice(0, 8),
  'Samedi 16h ETIVAL TT 1 contre ROSENAU TT 1 -',
]

const emptyResult = {
  createdPhases: [], createdDivisions: [], createdGroups: [], createdClubs: [],
  createdTeams: [], groups: [], createdMatchDays: [], updatedMatchDays: [],
  createdGames: [], skippedSchedules: [], existingGames: 0,
  skippedMatches: 0, skippedMatchDetails: [],
}

/** Result of a run that created the document's 4 fixtures across 2 journées. */
const importedResult = {
  ...emptyResult,
  createdMatchDays: [
    { id: 'md-e2e-1', groupId: 'group-1', number: 1, date: '2026-09-19' },
    { id: 'md-e2e-2', groupId: 'group-1', number: 2, date: '2026-10-03' },
  ],
  createdGames: [
    { id: 'g-e2e-1', matchDayId: 'md-e2e-1', homeTeamId: 'team-1', awayTeamId: 'opp-rosenau-1', date: '2026-09-19', time: '16h00', source: 'document' },
    { id: 'g-e2e-2', matchDayId: 'md-e2e-1', homeTeamId: 'opp-etival-1', awayTeamId: 'opp-rcs-2', date: '2026-09-19', time: '16h00', source: 'document' },
    { id: 'g-e2e-3', matchDayId: 'md-e2e-2', homeTeamId: 'opp-rosenau-1', awayTeamId: 'opp-etival-1', date: '2026-10-03', time: '16h00', source: 'document' },
    { id: 'g-e2e-4', matchDayId: 'md-e2e-2', homeTeamId: 'opp-rcs-2', awayTeamId: 'team-1', date: '2026-10-03', time: '16h00', source: 'document' },
  ],
}

type ImportBody = {
  updateSlots?: boolean
  removeObsolete?: boolean
  schedules: Array<{
    seasonId: string
    phaseNumber: number
    divisionId: string | null
    groupId: string | null
    newGroupNumber: number | null
    teams: unknown[]
    journees: Array<{ number: number; matches: unknown[] }>
  }>
}

async function attach(page: Page, lines: string[], name = 'poule-1.pdf') {
  await attachPages(page, [lines], name)
}

async function attachPages(page: Page, pages: string[][], name: string) {
  await page.locator('input[type=file]').setInputFiles({
    name, mimeType: 'application/pdf', buffer: buildTextPdf(pages),
  })
}

test.describe('General admin — import a schedule from a file', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('reads the document and posts the parsed schedule', async ({ page }) => {
    let body: ImportBody | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: importedResult })
    })

    await page.goto('/groupes')
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attach(page, POULE_1_LINES)

    // The header was read off the document itself — no division was selected.
    await expect(dialog.getByText('CHAMPIONNAT GRAND EST 1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('· Poule 1')).toBeVisible()
    await expect(dialog.getByText('2 journées · 4 matchs')).toBeVisible()

    // Every team in this document already exists in the mock data.
    await expect(dialog.getByText('RIXHEIM PPA n° 1 · Déjà présente')).toBeVisible()
    await expect(dialog.getByText(/Nouvelle équipe/)).toHaveCount(0)

    // "CHAMPIONNAT GRAND EST 1" scores below the auto-match threshold against
    // the division's short name "GE 1", so nothing is assumed: the row offers
    // to create a division and the admin points it at the existing one.
    await expect(dialog.getByLabel('Division')).toHaveValue('')
    await dialog.getByLabel('Division').selectOption({ label: 'GE 1' })
    await dialog.getByLabel('Groupe').selectOption({ label: 'Poule 1' })
    await expect(dialog.getByLabel('Groupe')).toHaveValue('group-1')

    await dialog.getByRole('button', { name: 'Importer 4 matchs (1 poule)' }).click()
    await expect(dialog.getByText('4 matchs importés.')).toBeVisible()

    expect(body).toBeDefined()
    expect(body!.schedules).toHaveLength(1)
    const s = body!.schedules[0]
    expect(s.seasonId).toBe('26')
    expect(s.phaseNumber).toBe(1)
    expect(s.divisionId).toBe('198609')
    expect(s.groupId).toBe('group-1')
    // newGroupNumber still carries the parsed poule number, but the server only
    // reads it when groupId is absent — it is a fallback, not a conflicting
    // instruction.
    expect(s.newGroupNumber).toBe(1)
    expect(s.teams).toHaveLength(4)
    expect(s.journees.map((j) => j.number)).toEqual([1, 2])
    expect(s.journees.flatMap((j) => j.matches)).toHaveLength(4)
  })

  test('reads a PDF on an engine with no async iteration over streams', async ({ page }) => {
    // WebKit does not implement it (https://bugs.webkit.org/show_bug.cgi?id=194379),
    // and pdfjs's own getTextContent() reads its text stream with
    // `for await (… of readableStream)`. On an iPhone that threw
    // "undefined is not a function" before a single line came back, so every
    // text-layer PDF — FFTT's own export included — was refused with
    // "Impossible de lire ce fichier" (#486). Chromium with the feature taken
    // away is that iPhone, as far as this path is concerned.
    await page.addInitScript(() => {
      delete (ReadableStream.prototype as Record<symbol, unknown>)[Symbol.asyncIterator]
    })

    await page.goto('/groupes')
    await expect(page.evaluate(() => Symbol.asyncIterator in ReadableStream.prototype)).resolves.toBe(false)
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attach(page, POULE_1_LINES)

    await expect(dialog.getByText('CHAMPIONNAT GRAND EST 1', { exact: true })).toBeVisible()
    await expect(dialog.getByText('2 journées · 4 matchs')).toBeVisible()
    await expect(dialog.getByText(/Impossible de lire/)).toHaveCount(0)
  })

  test('splits a document holding several poules into one row per poule', async ({ page }) => {
    // FFTT publishes every poule of a division in ONE file, one page each
    // (#486). Read whole, such a file used to import as a single poule
    // holding both pages' journées and only the first page's roster.
    let body: ImportBody | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: importedResult })
    })

    await page.goto('/groupes')
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attachPages(page, [POULE_1_LINES, POULE_2_LINES], 'ge1-p1.pdf')

    // One row per poule, each named after the poule it holds.
    await expect(dialog.getByText('ge1-p1.pdf · Poule 1')).toBeVisible()
    await expect(dialog.getByText('ge1-p1.pdf · Poule 2')).toBeVisible()
    await expect(dialog.getByText('2 journées · 4 matchs')).toHaveCount(2)
    // Each roster is its own: page 2's teams never appear under poule 1.
    await expect(dialog.getByText('RIXHEIM PPA n° 1 · Déjà présente')).toBeVisible()
    await expect(dialog.getByText('MOUSSEY TT n° 1 · Déjà présente')).toBeVisible()

    // Mapped independently: poule 1 exists, poule 2 is created under the same
    // division.
    await dialog.getByLabel('Division').nth(0).selectOption({ label: 'GE 1' })
    await dialog.getByLabel('Groupe').nth(0).selectOption({ label: 'Poule 1' })
    await dialog.getByLabel('Division').nth(1).selectOption({ label: 'GE 1' })
    await expect(dialog.getByLabel('Groupe').nth(1)).toHaveValue('')

    await dialog.getByRole('button', { name: 'Importer 8 matchs (2 poules)' }).click()
    await expect(dialog.getByText('4 matchs importés.')).toBeVisible()

    expect(body).toBeDefined()
    expect(body!.schedules).toHaveLength(2)
    const [first, second] = body!.schedules
    expect(first.groupId).toBe('group-1')
    expect(first.journees.flatMap((j) => j.matches)).toHaveLength(4)
    expect(second.divisionId).toBe('198609')
    expect(second.groupId).toBeNull()
    expect(second.newGroupNumber).toBe(2)
    expect(second.teams).toHaveLength(4)
    expect(second.journees.flatMap((j) => j.matches)).toHaveLength(4)
  })

  test('refuses a document where a team plays twice in one journée', async ({ page }) => {
    let called = false
    await page.route(IMPORT, (route) => { called = true; return route.fulfill({ json: emptyResult }) })

    await page.goto('/groupes')
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attach(page, REPEATED_TEAM_LINES, 'poule-1-incoherente.pdf')

    // An error, not a warning: the admin cannot override it (#299).
    await expect(dialog.getByText(/Ce fichier ne peut pas être importé/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Rien à importer' })).toBeDisabled()

    expect(called).toBe(false)
  })

  test('opts in to refreshing the slots of games already present', async ({ page }) => {
    let body: ImportBody | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({ json: { ...importedResult, createdGames: [], existingGames: 4, updatedGameSlots: 4 } })
    })

    await page.goto('/groupes')
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attach(page, POULE_1_LINES)

    // Ticked by default — the document is the authoritative source of the slot.
    // Named: the dialog also carries the removal opt-in since #422.
    const optIn = dialog.getByRole('checkbox', { name: /Mettre à jour la date/ })
    await expect(optIn).toBeChecked()

    await optIn.uncheck()
    await dialog.getByRole('button', { name: /^Importer 4 matchs/ }).click()
    await expect(body!.updateSlots).toBeFalsy()

    // And when left ticked, the flag reaches the API and the outcome is reported.
    await page.reload()
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()
    await attach(page, POULE_1_LINES)
    await dialog.getByRole('button', { name: /^Importer 4 matchs/ }).click()
    expect(body!.updateSlots).toBe(true)
    await expect(dialog.getByText('4 matchs recalés sur la date et l’heure du document.')).toBeVisible()
  })

  // #422: a reissued calendar ("ANNULE ET REMPLACE L'ÉDITION PRÉCÉDENTE")
  // states a poule whose composition changed. Removing what it no longer holds
  // is opt-in, and unticked by default — a document covering part of a poule,
  // or mapped to the wrong group, must never quietly delete the rest.
  test('opts in to removing what the calendar no longer holds', async ({ page }) => {
    let body: ImportBody | undefined
    await page.route(IMPORT, (route) => {
      body = route.request().postDataJSON()
      return route.fulfill({
        json: {
          ...importedResult, createdGames: [], existingGames: 4,
          deletedGames: ['g-old-1', 'g-old-2'], deletedMatchDays: [], departedTeams: 1,
        },
      })
    })

    await page.goto('/groupes')
    await page.getByRole('button', { name: 'Importer depuis un fichier' }).click()

    const dialog = page.getByRole('dialog')
    await attach(page, POULE_1_LINES)

    const removeObsolete = dialog.getByRole('checkbox', { name: /Supprimer ce que ce calendrier/ })
    await expect(removeObsolete).not.toBeChecked()
    await removeObsolete.check()
    await dialog.getByRole('button', { name: /^Importer 4 matchs/ }).click()

    expect(body!.removeObsolete).toBe(true)
    await expect(dialog.getByText(/2 matchs supprimés : absents de ce calendrier/)).toBeVisible()
    await expect(dialog.getByText('1 équipe retirée de la poule.')).toBeVisible()
  })

  test('warns when a file does not match the group it was opened from', async ({ page }) => {
    await page.goto('/groupes')
    await page.getByLabel('Division').selectOption({ label: 'GE 1' })
    // exact, and scoped to the group's row: the page header's "Importer depuis
    // un fichier" would otherwise match too (substring), opening the unscoped
    // modal instead of this group's.
    await page.getByRole('row', { name: /PPA Rixheim 1/ })
      .getByRole('button', { name: 'Depuis un fichier', exact: true }).click()

    const dialog = page.getByRole('dialog')
    // A Poule 2 document, opened from Poule 1's row.
    const otherPoule = POULE_1_LINES.map((l) =>
      l.startsWith('CHAMPIONNAT') ? 'CHAMPIONNAT GRAND EST 1 Poule 2' : l)
    await attach(page, otherPoule, 'poule-2.pdf')

    // Scoped to the group it was opened from, and says so rather than
    // silently importing another poule's calendar into it.
    await expect(dialog.getByText(
      /Ce document correspond à « CHAMPIONNAT GRAND EST 1 · Poule 2 », différent du groupe sélectionné/,
    )).toBeVisible()
    await expect(dialog.getByLabel('Groupe')).toHaveValue('group-1')
  })
})
