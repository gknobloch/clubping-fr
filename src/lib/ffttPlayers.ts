// FFTT player import (#384), browser-side like every other FFTT/dafunker read
// (#229/#231/#247): FFTT and dafunker block Cloudflare's egress IPs, so the
// fetch runs in the user's browser and the parsed payload is handed to the
// app's own player-creation flow.
//
// One source, two scopes:
//
//   GET https://fftt.dafunker.com/v1/proxy/xml_licence_b.php?licence=<licence>
//   GET https://fftt.dafunker.com/v1/proxy/xml_licence_b.php?club=<numclub>
//     <liste><licence><idlicence/><licence>425881</licence><nom>CANAQUE</nom>
//       <prenom>Gregory</prenom><numclub>06680011</numclub>
//       <nomclub>RIXHEIM PPA</nomclub><point>1731</point><cat>V40</cat>
//       <pointm>1731</pointm><apointm>1752.34</apointm><initm>1763</initm>…
//     </licence>…</liste>
//     Same record either way — one for a licence, the club's whole list for a
//     club number — so one parser serves both. Note the two `licence` names:
//     the <licence> ELEMENT inside each record is the licence number, while
//     <idlicence> is FFTT's internal row id, which is not what anyone means by
//     "numéro de licence".
//
// There is a friendlier-looking JSON endpoint for a single licence,
// /v1/joueur/<licence>, and this first used it — but it answers without an
// `Access-Control-Allow-Origin` header, so the browser blocks the response and
// the import can only fail. The /v1/proxy/ endpoints send `*`. The same trap
// caught the games import (see ffttGamesXml.ts, where /v1/club/<n>/equipes had
// to give way to its /v1/proxy/ twin): on dafunker, only /v1/proxy/ is
// reachable from a page.
//
// Points come from `point` — the official ranking. `pointm` is the monthly
// figure, `apointm` the running average, `initm` the season's starting value;
// none of them is what the app shows.
//
// `cat` is the age category (#482), and it mixes two nomenclatures in one
// column: a letter for the young and the seniors, a five-year band for the
// veterans. It is stored exactly as sent and normalized on read — see
// src/lib/playerCategories.ts.

import type { Player, PlayerPhasePoints, PlayerSeasonCategory } from '../types'
import { normalizeFfttName } from './ffttClub'
import { categoryFor } from './seasonCategories'

const LICENCES_URL = 'https://fftt.dafunker.com/v1/proxy/xml_licence_b.php'
const TIMEOUT_MS = 15000

/** One licence as FFTT states it, normalized for our own storage. */
export interface FfttLicence {
  /** Licence number — the identity we match on. */
  licence: string
  /** Family name, normalized ("DE COATPONT" → "De Coatpont"). */
  lastName: string
  firstName: string
  /** Club affiliation number the licence belongs to. */
  clubNumber: string
  /** Club name as FFTT writes it, for the "wrong club" message. */
  clubName: string
  /** Official points (`point`), as text; empty when FFTT states none. */
  points: string
  /**
   * Age category as FFTT writes it — "S", "V45", sometimes "B2" (#482). Kept
   * verbatim: normalizing on the way in would throw away the only sign that
   * their export has changed. Empty when FFTT states none.
   */
  category: string
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Particles that stay lowercase inside a name ("De Coatpont" is the family
 * name; "de" in "Bertrand de Coatpont" is not). Only applied away from the
 * first segment — a name that *starts* with the particle keeps its capital,
 * which is the French convention for "Le Guen", "Du Pont", "De Coatpont".
 */
const PARTICLES = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'da', 'di', 'dos', 'del', 'della',
  'van', 'von', 'der', 'den', 'ter', 'ten', 'y',
])

const lower = (s: string) => s.toLocaleLowerCase('fr-FR')
const upperFirst = (s: string) =>
  s.charAt(0).toLocaleUpperCase('fr-FR') + lower(s.slice(1))

/**
 * A person's name as it should be stored: FFTT sends family names in caps
 * ("DE COATPONT"), which is a display convention, not a spelling.
 *
 * Deliberately NOT `normalizeFfttName` from ffttClub.ts: that one leaves
 * tokens of four letters or fewer untouched because they are club-type
 * abbreviations (TT, PPA, CSS), which would give "DE Coatpont" here. Compound
 * names keep their separators ("JEAN-PIERRE" → "Jean-Pierre", "D'ANGELO" →
 * "D'Angelo").
 */
export function normalizePersonName(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  return words
    .map((word, wordIndex) => {
      if (wordIndex > 0 && PARTICLES.has(lower(word))) return lower(word)
      // Split on hyphens and apostrophes, keeping them: each piece after one
      // starts a new word ("Jean-Pierre", "D'Angelo").
      return word
        .split(/([-'’])/)
        .map((piece) => (/^[-'’]$/.test(piece) ? piece : upperFirst(piece)))
        .join('')
    })
    .join(' ')
}

/**
 * Points as text: FFTT sends them as a JSON number (803.0) or as XML text
 * ("1731"). An integral value loses its decimal part — nobody writes "803.0"
 * points — and anything else is kept verbatim.
 */
export function formatPoints(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const stated = String(raw).trim()
  if (!stated) return ''
  const n = Number(stated)
  if (!Number.isFinite(n)) return ''
  // Integral values lose the decimal part JSON gives them (803.0 → "803");
  // anything else keeps every digit FFTT stated rather than being rounded.
  return Number.isInteger(n) ? String(n) : stated
}

/** Two club affiliation numbers, compared the way FFTT writes them. */
export function sameClubNumber(a: string | undefined, b: string | undefined): boolean {
  const clean = (s: string | undefined) => (s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const ca = clean(a)
  return ca !== '' && ca === clean(b)
}

// ---------------------------------------------------------------------------
// Fetching and parsing
// ---------------------------------------------------------------------------

const digits = (s: string) => s.replace(/[^0-9A-Za-z]/g, '')

/** The dafunker URL for one licence. */
export function dafunkerLicenceUrl(licence: string): string {
  return `${LICENCES_URL}?licence=${encodeURIComponent(digits(licence))}`
}

/** The dafunker URL listing every licence of a club. */
export function dafunkerClubLicencesUrl(clubNumber: string): string {
  return `${LICENCES_URL}?club=${encodeURIComponent(digits(clubNumber))}`
}

// ---------------------------------------------------------------------------
// Reading the XML without a DOM (#555)
// ---------------------------------------------------------------------------
//
// This used `DOMParser`, which the app does not have: React Native has no DOM
// at all, and the import is the same import on both — one FFTT answer, one way
// of reading it. (The same wall the API ran into, from the other side: see the
// note that sent `clubIdFromAffiliation` to entityIds.ts in #285.)
//
// A scanner rather than a regular expression, for one reason that is the whole
// difficulty of this particular document: a record is a `<licence>` element
// holding a `<licence>` child, so the name alone does not say which of the two
// a tag opens. Depth does, and only a scanner has it.

/** The handful of entities FFTT's own export actually emits. */
function decodeEntities(raw: string): string {
  return raw.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    const named: Record<string, string> = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    }
    return named[body.toLowerCase()] ?? whole
  })
}

const TAG = /<[!?]?\/?([A-Za-z_][\w.:-]*)([^>]*)>/g

/**
 * Every `<recordTag>` element sitting one level under the root, as a flat map
 * of its leaf children.
 *
 * Flat on purpose: an FFTT licence record is a row, and nothing in it nests.
 * A repeated child keeps the FIRST value, which is what `querySelector` did.
 */
export function parseFlatXmlRecords(
  xml: string,
  recordTag: string,
): Array<Record<string, string>> {
  const wanted = recordTag.toLowerCase()
  const records: Array<Record<string, string>> = []
  /** Open element names, outermost first. */
  const stack: string[] = []
  /** The record being filled, and the depth it sits at. */
  let record: Record<string, string> | null = null
  let recordDepth = -1
  /** The leaf being read, and where its text starts in `xml`. */
  let leaf: string | null = null
  let leafFrom = 0

  TAG.lastIndex = 0
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    const [whole, rawName, attrs] = m
    // Declarations, processing instructions and comments say nothing here.
    if (whole.startsWith('<!') || whole.startsWith('<?')) continue
    const name = rawName.toLowerCase()
    const closing = whole[1] === '/'
    const selfClosing = !closing && attrs.trimEnd().endsWith('/')

    if (closing) {
      // Drop back to whichever ancestor this closes — a stray close tag that
      // matches nothing leaves the stack alone rather than unwinding it.
      const at = stack.lastIndexOf(name)
      if (at === -1) continue
      if (leaf !== null && record && at === stack.length - 1 && name === leaf) {
        if (!(name in record)) record[name] = decodeEntities(xml.slice(leafFrom, m.index)).trim()
        leaf = null
      }
      if (record && at === recordDepth) {
        records.push(record)
        record = null
        recordDepth = -1
        leaf = null
      }
      stack.length = at
      continue
    }

    if (selfClosing) continue

    // Depth 1 is a child of the root: `<liste>` holds the records.
    if (record === null && stack.length === 1 && name === wanted) {
      record = {}
      recordDepth = 1
    } else if (record !== null && stack.length === recordDepth + 1) {
      leaf = name
      leafFrom = m.index + whole.length
    }
    stack.push(name)
  }
  return records
}

/** Parse an XML licence list — one record or a club's worth of them. */
export function parseClubLicencesXml(xml: string): FfttLicence[] {
  return parseFlatXmlRecords(xml, 'licence').flatMap((r) => {
    // Two fields are called "licence" here: the `<licence>` CHILD of the record
    // is the licence number, while `<idlicence>` is FFTT's internal row id,
    // which is not what anyone means by "numéro de licence".
    const licence = r.licence ?? ''
    const lastName = r.nom ?? ''
    if (!licence || !lastName) return []
    return [{
      licence,
      lastName: normalizePersonName(lastName),
      firstName: normalizePersonName(r.prenom ?? ''),
      clubNumber: r.numclub ?? '',
      clubName: normalizeFfttName(r.nomclub ?? ''),
      points: formatPoints(r.point ?? ''),
      category: (r.cat ?? '').toUpperCase(),
    }]
  })
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** One licence from the browser: the player, 'not_found', or null when unreachable. */
export async function fetchFfttPlayerFromBrowser(
  licence: string,
): Promise<FfttLicence | 'not_found' | null> {
  const xml = await fetchText(dafunkerLicenceUrl(licence))
  if (xml === null) return null
  // An unknown licence answers with an empty <liste/>, not an error.
  return parseClubLicencesXml(xml)[0] ?? 'not_found'
}

/** Every licence of a club from the browser; null when unreachable. */
export async function fetchClubLicencesFromBrowser(
  clubNumber: string,
): Promise<FfttLicence[] | null> {
  const xml = await fetchText(dafunkerClubLicencesUrl(clubNumber))
  if (xml === null) return null
  return parseClubLicencesXml(xml)
}

// ---------------------------------------------------------------------------
// Import preview (what would change)
// ---------------------------------------------------------------------------

export type PlayerSyncFieldKey = 'lastName' | 'firstName' | 'licenseNumber' | 'points' | 'category'

/** One reviewable field of a player import — same shape as the club one (#280). */
export interface PlayerSyncField {
  key: PlayerSyncFieldKey
  label: string
  /** What we hold today; null for a player being created. */
  current: string | null
  /** What FFTT offers; null when it states nothing. */
  incoming: string | null
  unchanged: boolean
  unavailable: boolean
}

/** What the app already knows about a player, for the before/after. */
export interface CurrentPlayerValues {
  lastName: string
  firstName: string
  licenseNumber: string
  /** Points recorded for the target phase, if any. */
  points?: string
  /** Category held today, as stored — the raw FFTT code (#482). */
  category?: string
}

const FIELD_LABELS: Record<PlayerSyncFieldKey, string> = {
  lastName: 'Nom',
  firstName: 'Prénom',
  licenseNumber: 'N° licence',
  points: 'Points',
  category: 'Catégorie',
}

/** Strip diacritics: "Hervé" → "Herve". */
const foldAccents = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Whether FFTT's spelling of a name is genuinely different from ours.
 *
 * FFTT stores names unaccented on both endpoints — "Herve", "Gregory",
 * "Clement" — which is a limitation of their export, not a spelling. Taking it
 * would strip the accents off half a French club at every import, so a name
 * that differs from ours by accents alone counts as unchanged. Everything else
 * still comes through: "DE COATPONT" → "De Coatpont" survives this test,
 * because it differs by case, not by accents.
 */
const nameChanged = (current: string, incoming: string) =>
  foldAccents(current) !== foldAccents(incoming)

function field(
  key: PlayerSyncFieldKey, incoming: string, current: string | null,
): PlayerSyncField {
  const isName = key === 'lastName' || key === 'firstName'
  const same = current !== null
    && (isName ? !nameChanged(current, incoming) : current === incoming)
  return {
    key,
    label: FIELD_LABELS[key],
    current,
    incoming: incoming || null,
    unchanged: same,
    unavailable: !incoming,
  }
}

/**
 * The field-by-field review of one licence. Omit `current` for a player being
 * created, which leaves every `current` null — the same convention as
 * `clubSyncFields` (#280).
 */
export function playerSyncFields(
  incoming: FfttLicence,
  current?: CurrentPlayerValues,
): PlayerSyncField[] {
  return [
    field('lastName', incoming.lastName, current?.lastName ?? null),
    field('firstName', incoming.firstName, current?.firstName ?? null),
    field('licenseNumber', incoming.licence, current?.licenseNumber ?? null),
    field('points', incoming.points, current ? current.points ?? null : null),
    field('category', incoming.category, current ? current.category ?? null : null),
  ]
}

export type PlayerImportStatus = 'new' | 'changed' | 'unchanged'

/** One line of the import preview. */
export interface PlayerImportRow {
  licence: FfttLicence
  /** Local player this licence matches, when there is one. */
  playerId?: string
  status: PlayerImportStatus
  fields: PlayerSyncField[]
  /**
   * A member the club already holds who is probably this licensee, found on
   * something short of a licence number (#474). The row still reads as `new`:
   * nothing is linked until the import is told to, and a `name` match is a
   * question put to the admin rather than an answer.
   */
  link?: { id: string; on: 'name'; name: string }
}

/** Key identifying one field of one licence in a preview's selection set. */
export const fieldKey = (licence: string, key: PlayerSyncFieldKey) => `${licence}:${key}`

/** The fields this row would actually write: something to say, and different. */
export function writableFields(fields: PlayerSyncField[]): PlayerSyncField[] {
  return fields.filter((f) => !f.unchanged && !f.unavailable)
}

/**
 * Turn FFTT licences into reviewable rows against what we hold.
 *
 * Matching is on the licence number, the only identity both sides share: a
 * name can be spelled differently on each side, which is half of what this
 * import is for.
 */
/**
 * A member the club already has who is probably this licensee, matched on
 * something less certain than a licence number (#474).
 *
 * The case that forced this: an approved club admin is a `users` row with no
 * licence and, when they hold none, `is_player = 0` — so they are not in
 * `players` at all and the licence match below cannot see them. Importing the
 * club's licensees then created the same person a second time.
 *
 * The name is all there is to go on. FFTT's licence record carries no address —
 * it has `nom`, `prenom`, `licence`, `club` and points, and nothing else — so
 * matching on e-mail is not available here however much one might want it.
 *
 * A name is not proof: two people in one club can share one, and merging them
 * would quietly fuse two members. So a name match is returned as a suggestion
 * for a human to confirm, and never linked on its own.
 */
export interface ImportCandidate {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  licenseNumber?: string
}

const nameKey = (first: string | undefined, last: string | undefined) =>
  `${(first ?? '').trim().toLocaleLowerCase('fr-FR')}|${(last ?? '').trim().toLocaleLowerCase('fr-FR')}`

/**
 * Who, among the club's members, this licence might already be — when the
 * licence number itself matched nobody.
 *
 * Anyone already holding a *different* licence is never offered: whoever they
 * are, they are not this licensee. One namesake is a suggestion; several is a
 * question this cannot answer, so it asks none of them rather than guessing.
 */
export function findImportCandidate(
  licence: Pick<FfttLicence, 'firstName' | 'lastName'>,
  candidates: ImportCandidate[],
): ImportCandidate | null {
  const wanted = nameKey(licence.firstName, licence.lastName)
  const sameName = candidates.filter(
    (c) => !(c.licenseNumber ?? '').trim() && nameKey(c.firstName, c.lastName) === wanted,
  )
  return sameName.length === 1 ? sameName[0] : null
}

export function buildImportRows(
  licences: FfttLicence[],
  players: Player[],
  phasePoints: PlayerPhasePoints[],
  phaseId: string,
  /** Club members outside `players` — non-playing admins, chiefly (#474). */
  candidates: ImportCandidate[] = [],
  /** A category is stated per season (#482), so it is read for `phaseId`'s. */
  seasonCategories: PlayerSeasonCategory[] = [],
  seasonId?: string,
): PlayerImportRow[] {
  const byLicence = new Map(
    players.filter((p) => p.licenseNumber).map((p) => [p.licenseNumber.trim(), p]),
  )
  return licences.map((licence) => {
    const player = byLicence.get(licence.licence.trim())
    if (!player) {
      // No licence match. Before creating a person, see whether the club
      // already holds them under no licence at all — an approved admin, most
      // likely, who gave no licence when they asked (#474).
      const suggestion = findImportCandidate(licence, candidates)
      if (suggestion) {
        return {
          licence,
          status: 'new' as const,
          fields: playerSyncFields(licence),
          link: {
            id: suggestion.id,
            on: 'name' as const,
            name: `${suggestion.firstName ?? ''} ${suggestion.lastName ?? ''}`.trim(),
          },
        }
      }
      return { licence, status: 'new' as const, fields: playerSyncFields(licence) }
    }
    const fields = playerSyncFields(licence, {
      lastName: player.lastName,
      firstName: player.firstName,
      licenseNumber: player.licenseNumber,
      points: phasePoints.find((p) => p.phaseId === phaseId && p.playerId === player.id)?.points,
      category: categoryFor(seasonCategories, seasonId, player.id),
    })
    return {
      licence,
      playerId: player.id,
      status: writableFields(fields).length ? ('changed' as const) : ('unchanged' as const),
      fields,
    }
  })
}

/**
 * Licensees we hold for this club that the FFTT list does not mention — a
 * departure, or a licence not renewed. Reported, never deleted: the club
 * decides what happens to someone's history, not an import.
 */
export function playersMissingFromFftt(licences: FfttLicence[], clubPlayers: Player[]): Player[] {
  const known = new Set(licences.map((l) => l.licence.trim()))
  return clubPlayers.filter((p) => !known.has((p.licenseNumber ?? '').trim()))
}

// ---------------------------------------------------------------------------
// What a reviewed import would write (#555)
// ---------------------------------------------------------------------------
//
// This lived inline in ImportPlayersModal until the app grew the same import
// (#555). It is the same question on both — "given these rows and these ticks,
// what lands in the database?" — and it has to be answered once, or the two
// screens will eventually write different things from the same review.
//
// It answers in rows, not in calls: nothing here knows about an API, a context
// or a fetch. Both platforms apply the result their own way, because the web
// writes optimistically through its DataContext and the app waits for the
// writes and reports on them.

/** A licensee the import would create — FFTT's name and licence, nothing else. */
export interface PlayerImportCreate {
  /** Minted by the caller, so points and a category can be filed under it. */
  id: string
  firstName: string
  lastName: string
  licenseNumber: string
  /** The club importing. A licensee is created in one, never in the abstract. */
  clubId: string
}

/** A licensee the import would correct, with only the ticked fields in it. */
export interface PlayerImportUpdate {
  id: string
  patch: { firstName?: string; lastName?: string }
}

/** Everything one reviewed import writes, and what it amounts to. */
export interface PlayerImportWrites {
  creates: PlayerImportCreate[]
  updates: PlayerImportUpdate[]
  points: PlayerPhasePoints[]
  categories: PlayerSeasonCategory[]
  /** How many licensees this creates — the count the button announces. */
  created: number
  /** How many it corrects. A player only gaining points counts here too. */
  updated: number
}

export interface PlayerImportTarget {
  /** The club being imported into. */
  clubId: string
  /** Phase the points are filed under. */
  phaseId: string
  /** Season the category is filed under — a category belongs to one (#482). */
  seasonId?: string
  /** Mints the id of a licensee being created. */
  newId: () => string
}

/**
 * The writes a review amounts to: the ticked fields of each row, and nothing
 * else.
 *
 * A row with no tick left on it is skipped outright — that is what "ignore
 * this licensee" means, and it is also what an untouched `unchanged` row
 * already was.
 */
export function playerImportWrites(
  rows: PlayerImportRow[],
  /** Ticked `licence:field` keys — see `fieldKey`. */
  selected: Set<string>,
  { clubId, phaseId, seasonId, newId }: PlayerImportTarget,
): PlayerImportWrites {
  const writes: PlayerImportWrites = {
    creates: [], updates: [], points: [], categories: [], created: 0, updated: 0,
  }

  for (const row of rows) {
    const picked = writableFields(row.fields)
      .filter((f) => selected.has(fieldKey(row.licence.licence, f.key)))
    if (picked.length === 0) continue
    const has = (key: PlayerSyncFieldKey) => picked.some((f) => f.key === key)

    let playerId = row.playerId
    if (!playerId) {
      // A new licensee: name and licence come from FFTT, and everything else is
      // ours to fill in later — FFTT states no e-mail and no phone.
      playerId = newId()
      writes.creates.push({
        id: playerId,
        firstName: row.licence.firstName,
        lastName: row.licence.lastName,
        licenseNumber: row.licence.licence,
        clubId,
      })
      writes.created += 1
    } else {
      const patch: PlayerImportUpdate['patch'] = {}
      if (has('lastName')) patch.lastName = row.licence.lastName
      if (has('firstName')) patch.firstName = row.licence.firstName
      if (Object.keys(patch).length) writes.updates.push({ id: playerId, patch })
      // Points and a category are corrections too: a player whose name we
      // already had right but whose ranking moved is one this import updated.
      if (Object.keys(patch).length || has('points') || has('category')) writes.updated += 1
    }
    if (has('points') && row.licence.points) {
      writes.points.push({ phaseId, playerId, points: row.licence.points })
    }
    // The category comes with the licence and is filed under the season it was
    // issued for, never over last season's (#482).
    if (has('category') && row.licence.category && seasonId) {
      writes.categories.push({ seasonId, playerId, category: row.licence.category })
    }
  }

  return writes
}

/**
 * Everything a fresh review starts ticked: exactly what is writable.
 *
 * Importing an identical value is a no-op, and there is nothing to decide about
 * a field FFTT left empty — so neither is offered, on either platform.
 */
export function defaultImportSelection(rows: PlayerImportRow[]): Set<string> {
  return new Set(
    rows.flatMap((r) => writableFields(r.fields).map((f) => fieldKey(r.licence.licence, f.key))),
  )
}
