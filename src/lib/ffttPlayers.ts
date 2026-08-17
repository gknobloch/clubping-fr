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
//       <nomclub>RIXHEIM PPA</nomclub><point>1731</point><pointm>1731</pointm>
//       <apointm>1752.34</apointm><initm>1763</initm>…</licence>…</liste>
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

import type { Player, PlayerPhasePoints } from '../types'
import { normalizeFfttName } from './ffttClub'

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

function text(node: ParentNode, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? ''
}

/** Parse an XML licence list — one record or a club's worth of them. */
export function parseClubLicencesXml(xml: string): FfttLicence[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  return Array.from(doc.querySelectorAll('licence')).flatMap((node) => {
    // Each record is itself a <licence> element holding a <licence> child —
    // querySelector('licence') on the record would match the record. Read the
    // child explicitly.
    const licence = Array.from(node.children)
      .find((c) => c.tagName.toLowerCase() === 'licence')?.textContent?.trim() ?? ''
    const lastName = text(node, 'nom')
    if (!licence || !lastName) return []
    return [{
      licence,
      lastName: normalizePersonName(lastName),
      firstName: normalizePersonName(text(node, 'prenom')),
      clubNumber: text(node, 'numclub'),
      clubName: normalizeFfttName(text(node, 'nomclub')),
      points: formatPoints(text(node, 'point')),
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

export type PlayerSyncFieldKey = 'lastName' | 'firstName' | 'licenseNumber' | 'points'

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
}

const FIELD_LABELS: Record<PlayerSyncFieldKey, string> = {
  lastName: 'Nom',
  firstName: 'Prénom',
  licenseNumber: 'N° licence',
  points: 'Points',
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
export function buildImportRows(
  licences: FfttLicence[],
  players: Player[],
  phasePoints: PlayerPhasePoints[],
  phaseId: string,
): PlayerImportRow[] {
  const byLicence = new Map(
    players.filter((p) => p.licenseNumber).map((p) => [p.licenseNumber.trim(), p]),
  )
  return licences.map((licence) => {
    const player = byLicence.get(licence.licence.trim())
    if (!player) {
      return { licence, status: 'new' as const, fields: playerSyncFields(licence) }
    }
    const fields = playerSyncFields(licence, {
      lastName: player.lastName,
      firstName: player.firstName,
      licenseNumber: player.licenseNumber,
      points: phasePoints.find((p) => p.phaseId === phaseId && p.playerId === player.id)?.points,
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
