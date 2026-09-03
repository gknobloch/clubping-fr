// Age categories, as the FFTT states them (#482).
//
// Shared domain logic — keep this module free of any browser/RN/Node deps so
// the mobile app can compile it from ../src. The type import is type-only.
//
// `xml_licence_b.php` sends the category in <cat>, mixing two nomenclatures in
// one column: a letter for the young and the seniors (P, B, M, C, J, S,
// sometimes suffixed — "B2", "J1"), and a five-year band for the veterans
// (V40 … V90). We store what FFTT wrote and normalize on read, so a code we
// have never seen costs nothing: it normalizes to nothing and the player is
// simply uncategorized.

/** The canonical categories, oldest-eligible first — youngest to oldest. */
export const PLAYER_CATEGORIES = [
  'P', 'B', 'M', 'C', 'J', 'S',
  'V40', 'V45', 'V50', 'V55', 'V60', 'V65', 'V70', 'V75', 'V80', 'V85', 'V90',
] as const

export type PlayerCategory = (typeof PLAYER_CATEGORIES)[number]

const LABELS: Record<PlayerCategory, string> = {
  P: 'Poussin',
  B: 'Benjamin',
  M: 'Minime',
  C: 'Cadet',
  J: 'Junior',
  S: 'Senior',
  V40: 'Vétéran 40',
  V45: 'Vétéran 45',
  V50: 'Vétéran 50',
  V55: 'Vétéran 55',
  V60: 'Vétéran 60',
  V65: 'Vétéran 65',
  V70: 'Vétéran 70',
  V75: 'Vétéran 75',
  V80: 'Vétéran 80',
  V85: 'Vétéran 85',
  V90: 'Vétéran 90',
}

const VETERAN_BANDS: Array<{ code: PlayerCategory; from: number }> = PLAYER_CATEGORIES
  .filter((c) => c.startsWith('V'))
  .map((c) => ({ code: c, from: Number(c.slice(1)) }))

const isCategory = (v: string): v is PlayerCategory =>
  (PLAYER_CATEGORIES as readonly string[]).includes(v)

/**
 * A raw FFTT code as one of ours, or undefined when it says nothing we know.
 *
 * The youth suffixes are dropped ("B2" → "B"): FFTT runs nothing that separates
 * a first-year benjamin from a second-year one, so a mapping keyed on them
 * would ask an admin a question with no answer. The veteran bands are kept
 * apart for the opposite reason — "vétérans 50 et plus" is a real competition,
 * and a single "V" would make it inexpressible. A band between two of ours
 * (V42, were it ever sent) rounds DOWN to the one it belongs to: someone is a
 * V40 until they are a V45, never the other way round.
 */
export function normalizeCategory(raw: string | undefined | null): PlayerCategory | undefined {
  const code = (raw ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  if (!code) return undefined
  if (code.startsWith('V')) {
    const stated = code.slice(1)
    // A bare "V" is a veteran with no band stated — the youngest one.
    if (stated === '') return 'V40'
    const years = Number(stated)
    if (!Number.isFinite(years)) return undefined
    let band: PlayerCategory | undefined
    for (const b of VETERAN_BANDS) if (years >= b.from) band = b.code
    return band
  }
  const letter = code[0]
  return isCategory(letter) ? letter : undefined
}

/** French label of a category — "V45" reads as "Vétéran 45". */
export function categoryLabel(category: PlayerCategory): string {
  return LABELS[category]
}

/**
 * How a category should be written for a member, from whatever FFTT stored:
 * the label, followed by the raw code when it carries more than we kept
 * ("Benjamin (B2)"). Empty string when there is no category at all.
 */
export function categoryDisplay(raw: string | undefined | null): string {
  const category = normalizeCategory(raw)
  if (!category) return ''
  const stated = (raw ?? '').trim().toUpperCase()
  return stated && stated !== category
    ? `${LABELS[category]} (${stated})`
    : LABELS[category]
}

/**
 * How a set of admitted categories reads in a list.
 *
 * The empty set is not "nobody" but "anyone" — a competition that names no
 * category restricts none — and saying so in words is the only way a reader
 * can tell an unconfigured competition from a closed one.
 */
export function categoriesSummary(categories: PlayerCategory[]): string {
  return categories.length === 0 ? 'Toutes les catégories' : categories.join(', ')
}

/** Categories in canonical order, for a picker. */
export function orderedCategories(): Array<{ code: PlayerCategory; label: string }> {
  return PLAYER_CATEGORIES.map((code) => ({ code, label: LABELS[code] }))
}

/** The picked categories in canonical order, whatever order they were ticked in. */
export function orderedCategoryPicks(picked: PlayerCategory[]): PlayerCategory[] {
  return PLAYER_CATEGORIES.filter((code) => picked.includes(code))
}
