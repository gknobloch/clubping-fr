/**
 * Finding one name in a club's list (#454).
 *
 * Past a dozen licenciés, "autres joueurs" stops being a list you read and
 * becomes one you scroll, so every picker gets a name filter. The rule lives
 * here rather than in each screen because the two apps have to agree on what
 * counts as a match — a captain who types "muller" on the phone and on the web
 * should see the same person.
 *
 * Matching is deliberately forgiving: accents and case are stripped, and the
 * words may come in any order, because "Jean Muller" and "muller jean" are the
 * same search to the person typing it. Every word must match something, so a
 * second word narrows rather than widens.
 *
 * Structurally typed rather than importing `Player`: this is one of the
 * `@shared/lib` modules the mobile app compiles from ../src.
 */

/** French UI label of the filter, identical on both apps. */
export const PLAYER_SEARCH_LABEL = 'Rechercher un joueur'

/**
 * Below this many names, the filter is not offered: it would cost a row of
 * screen and a keyboard to save nothing.
 */
export const PLAYER_SEARCH_THRESHOLD = 10

/** Lower-case, accent-free form used on both sides of the comparison. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Does this player answer to `query`? An empty query matches everyone, which
 * is what lets a screen pass the raw input straight through.
 */
export function matchesPlayerSearch(
  player: { firstName: string; lastName: string },
  query: string,
): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeForSearch(`${player.firstName} ${player.lastName}`)
  return words.every((word) => haystack.includes(word))
}

/** `matchesPlayerSearch` over a list, preserving its order. */
export function filterPlayersBySearch<T extends { firstName: string; lastName: string }>(
  players: T[],
  query: string,
): T[] {
  if (normalizeForSearch(query) === '') return players
  return players.filter((p) => matchesPlayerSearch(p, query))
}
