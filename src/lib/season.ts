// Season naming/id rules, aligned with the FFTT API (#217).
//
// FFTT identifies seasons by a numeric id following the pattern
// "endYear - 2000": season 26 = 2025/2026, season 27 = 2026/2027. We use the
// same id (as text) so our data can be matched against FFTT responses.

const SEASON_NAME_RE = /^(\d{4})\/(\d{4})$/

/** Parse a season display name ("2025/2026"). Returns null unless the years are consecutive. */
export function parseSeasonName(name: string): { startYear: number; endYear: number } | null {
  const m = SEASON_NAME_RE.exec(name.trim())
  if (!m) return null
  const startYear = Number(m[1])
  const endYear = Number(m[2])
  if (endYear !== startYear + 1) return null
  return { startYear, endYear }
}

/**
 * Derive the season id from a display name: FFTT-aligned ("2025/2026" → "26"),
 * and for another federation the same number behind its id ("agr-26", #645) —
 * the AGR's 2025/2026 is not the FFTT's. Null if the name is invalid.
 */
export function seasonIdFromName(name: string, federationId = 'fftt'): string | null {
  const parsed = parseSeasonName(name)
  if (!parsed) return null
  const n = String(parsed.endYear - 2000)
  return federationId === 'fftt' ? n : `${federationId}-${n}`
}

/** The chronological number of a season id, whatever its federation ("27", "agr-27" → 27). */
export function seasonNumber(seasonId: string): number {
  const n = Number(seasonId.slice(seasonId.lastIndexOf('-') + 1))
  return Number.isFinite(n) ? n : 0
}

/** Normalize an FFTT season name ("Saison 2025 / 2026") to our display name ("2025/2026"). */
export function seasonNameFromFftt(ffttName: string): string {
  return ffttName
    .replace(/^Saison\s*/i, '')
    .replace(/\s*\/\s*/, '/')
    .trim()
}

/** Extract the numeric id from an FFTT IRI ("/api/seasons/27" → "27"). */
export function seasonIdFromFftt(ffttIri: string): string {
  return ffttIri.slice(ffttIri.lastIndexOf('/') + 1)
}

/**
 * The season everything unqualified means: the one being played.
 *
 * Eligibility, and the category it reads, are questions about now — a club
 * asking "can this licensee play?" is not asking about 2023. Screens that show
 * history (a player's own page) name their season explicitly instead.
 */
export function activeSeasonId(
  seasons: Array<{ id: string; status: string; federationId?: string }>,
  federationId = 'fftt',
): string | undefined {
  // One active season per federation since #645. Categories and the licence
  // listing (#482, #488) are the FFTT's, hence the default.
  return seasons.find((s) => s.status === 'active' && (s.federationId ?? 'fftt') === federationId)?.id
}
