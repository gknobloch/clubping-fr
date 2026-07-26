// Browser-side FFTT GraphQL client (#231 follow-up). FFTT blocks Cloudflare's
// egress IPs, so server-side fetches from Pages Functions fail systematically
// while the user's browser reaches apiv2 without trouble — and apiv2 sends
// `access-control-allow-origin: *`. FFTT-facing reads therefore run in the
// browser; the parsed payload is handed to our API, which stays authoritative
// over validation and persistence.

import { seasonIdFromFftt, seasonNameFromFftt } from './season'

const FFTT_GRAPHQL_URL = 'https://apiv2.fftt.com/api/graphql'
const TIMEOUT_MS = 15000

/** Run a GraphQL query against apiv2 from the browser; null when unreachable. */
export async function ffttGraphqlFromBrowser<T>(query: string): Promise<T | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(FFTT_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: T }
    return body.data ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Fetch a URL's raw text body from the browser; null when unreachable. Used for the dafunker XML endpoints (see ffttClub.ts, ffttGamesXml.ts). */
export async function fetchTextFromBrowser(url: string): Promise<string | null> {
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

/** The FFTT current season, normalized ("/api/seasons/27", "2026 - 2027"). */
export async function fetchFfttCurrentSeasonFromBrowser(): Promise<{ id: string; displayName: string } | null> {
  const data = await ffttGraphqlFromBrowser<{ seasons?: { edges?: Array<{ node?: { id?: string; name?: string } }> } }>(
    '{ seasons(current: true) { edges { node { id name } } } }',
  )
  const node = data?.seasons?.edges?.[0]?.node
  if (!node?.id || !node.name) return null
  return { id: seasonIdFromFftt(node.id), displayName: seasonNameFromFftt(node.name) }
}
