// FFTT games (calendar) import (#231), dafunker XML transport — replaces the
// apiv2 GraphQL transport, which turned out unreliable. Fetched from the
// browser like the other FFTT/dafunker imports (ffttClient.ts, ffttClub.ts):
// FFTT/dafunker block Cloudflare's egress IPs.
//
// Unlike apiv2's divisionPoolsQuery, this endpoint only returns one pool at a
// time — `D1` alone (no `cx_poule`) always returns just the division's first
// pool, never the whole division (confirmed empirically; an earlier draft of
// this file assumed otherwise). Reaching a specific pool requires its
// dafunker-space id as `cx_poule`, which only ever aligns with local
// Group.id for groups created by the original teams-import flow (#229) — see
// selectPoolForGroup in ffttGames.ts for the other two id-space origins.
// Fetching is therefore two-tier (see fetchGamesPreview in DataContext.tsx):
// try `cx_poule=<Group.id>` directly first (fast, correct for #229-origin
// groups), then fall back to apiv2's whole-division fetch for any group it
// didn't resolve. dafunker validates that `cx_poule` actually belongs to the
// given `D1` (a mismatched pair returns an empty `<liste/>`, not another
// division's data), so a wrong guess only ever comes back empty — never a
// false positive.
//
// Source: GET https://fftt.dafunker.com/v1/proxy/xml_result_equ.php?force=1&D1=<FFTT division id>[&cx_poule=<dafunker pool id>]
//   <liste><tour><libelle>Poule 9 - tour n°1 du 20/09/2026</libelle>
//     <equa/><equb/><scorea/><scoreb/>
//     <lien><![CDATA[renc_id=6491248&is_retour=0&phase=1&res_1=&res_2=
//       &equip_1=ETIVAL+4&equip_2=ROSENAU+TT++2&equip_id1=1075&equip_id2=2017
//       &clubnum_1=06880123&clubnum_2=06680125]]></lien>
//     <dateprevue>20/09/2026</dateprevue><datereelle>20/09/2026</datereelle>
//   </tour>...</liste>
// The XML declares encoding="ISO-8859-1" but the body is actually UTF-8
// (confirmed by inspecting raw bytes); the browser's default UTF-8 text
// decoding is correct as-is. Scores are never imported (app-wide policy).

import { teamNumberFromName, type FfttMatch, type FfttMatchTeam, type FfttPool } from './ffttGames'

const RESULTS_URL = 'https://fftt.dafunker.com/v1/proxy/xml_result_equ.php'

/**
 * The dafunker results URL for a division's schedule. Without `cxPoule`,
 * this only returns the division's first pool — pass it (the pool's
 * dafunker-space id) to target a specific pool.
 */
export function dafunkerResultsUrl(divisionId: string, cxPoule?: string): string {
  const safeDivision = divisionId.replace(/\D/g, '') || '0'
  const safePool = cxPoule?.replace(/\D/g, '')
  return `${RESULTS_URL}?force=1&D1=${safeDivision}` + (safePool ? `&cx_poule=${safePool}` : '')
}

const LIBELLE_RE = /Poule\s+(\d+)\s*-\s*tour\s*n[°o]\s*(\d+)/i

/**
 * Unescape `<![CDATA[...]]>` sections into plain escaped XML text before
 * parsing. Real browsers' DOMParser handles CDATA natively, but this keeps
 * parsing robust to XML-parser quirks (e.g. happy-dom, used by the test
 * suite, fails to parse the whole document once it hits a CDATA section).
 */
function unwrapCdata(xml: string): string {
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner: string) =>
    inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  )
}

/** "20/09/2026" → "2026-09-20"; empty string when unparseable. */
function parseFrenchDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

function text(node: ParentNode, tag: string): string {
  return node.querySelector(tag)?.textContent?.trim() ?? ''
}

function parseTeam(side: '1' | '2', params: URLSearchParams): FfttMatchTeam | null {
  const teamId = params.get(`equip_id${side}`)
  const rawName = params.get(`equip_${side}`)
  if (!teamId || !rawName) return null
  const teamName = rawName.replace(/\s+/g, ' ').trim()
  return {
    teamId,
    teamName,
    teamNumber: teamNumberFromName(teamName),
    clubIdentifier: params.get(`clubnum_${side}`) ?? '',
    // dafunker's results endpoint doesn't carry a club display name; the API
    // already falls back to deriving one from the team name when creating a
    // club (functions/api/[[path]].ts).
    clubName: '',
  }
}

/** Parse one <tour> element, or null when unusable (malformed libelle/CDATA/date). */
function parseTour(tour: Element): { poolNumber: number; match: FfttMatch } | null {
  const lm = text(tour, 'libelle').match(LIBELLE_RE)
  if (!lm) return null

  const params = new URLSearchParams(text(tour, 'lien'))
  const rencId = params.get('renc_id')
  const home = parseTeam('1', params)
  const away = parseTeam('2', params)
  if (!rencId || !home || !away) return null

  const date = parseFrenchDate(text(tour, 'datereelle')) || parseFrenchDate(text(tour, 'dateprevue'))
  if (!date) return null

  return { poolNumber: Number(lm[1]), match: { id: rencId, round: Number(lm[2]), date, home, away } }
}

/**
 * Parse an xml_result_equ.php response — one pool's worth of tours, or the
 * division's first pool when `cx_poule` was omitted — into FfttPools, grouped
 * by poule number (there's normally only one, but grouping is harmless if a
 * response ever mixes pools). The pool id is synthesized from the poule
 * number since this endpoint carries no separate numeric pool id; it's only
 * used within this fetch's own matching pass (selectPoolForGroup), so that's
 * safe.
 */
export function parseDafunkerResultsXml(xml: string): FfttPool[] {
  const doc = new DOMParser().parseFromString(unwrapCdata(xml), 'application/xml')
  if (doc.querySelector('parsererror')) return []

  const byPool = new Map<number, FfttMatch[]>()
  for (const tour of Array.from(doc.querySelectorAll('tour'))) {
    const parsed = parseTour(tour)
    if (!parsed) continue
    const list = byPool.get(parsed.poolNumber) ?? []
    list.push(parsed.match)
    byPool.set(parsed.poolNumber, list)
  }

  return [...byPool.entries()]
    .sort(([a], [b]) => a - b)
    .map(([poolNumber, matches]) => ({
      id: String(poolNumber),
      poolNumber,
      matches: matches.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id, undefined, { numeric: true })),
    }))
}
