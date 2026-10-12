// Is « Prom. HONNEUR » our « Promotion Honneur »? (#647)
//
// Shared domain logic — the import dialog proposes a division with it, and
// the API finds one with it when the dialog names none. Keep this module free
// of any browser/RN/Node deps.
//
// The AGR's calendars write a division the way its secretary types it:
// abbreviated (« Prom. », « Exc. », « Div. »), in capitals, with or without
// its article (« Promotion d'Excellence »), its number in Roman numerals
// (« DIVISION I »). A division created by hand is « Promotion Honneur ». Both
// must land on one key, or the import creates a second division beside the
// first — which is what happened to Promotion Honneur.

const WORDS: Record<string, string[]> = {
  prom: ['promotion'], promo: ['promotion'], exc: ['excellence'], exce: ['excellence'], excel: ['excellence'],
  hon: ['honneur'], div: ['division'], pe: ['promotion', 'excellence'], ph: ['promotion', 'honneur'],
  i: ['1'], ii: ['2'], iii: ['3'], iv: ['4'],
}
const ARTICLES = new Set(['d', 'de', 'du', 'des', 'l', 'la', 'le'])

/** The words a division name stands for, abbreviations expanded: « Prom. HONNEUR » → promotion honneur. */
export function divisionNameKey(name: string): string {
  const words = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // « D2 » is Division 2 — read before « d » goes as an article.
    .replace(/\bd\s*(\d)\b/g, 'division $1')
    .replace(/(\d)([a-z])|([a-z])(\d)/g, '$1$3 $2$4')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !ARTICLES.has(w))
    .flatMap((w) => WORDS[w] ?? [w])
  // « Division d'Honneur » is the Honneur division (art. 22).
  const key = words.join(' ')
  return key === 'division honneur' ? 'honneur' : key === 'division excellence' ? 'excellence' : key
}

/** The division among these that a calendar's name means, if any. */
export function matchDivisionName<D extends { displayName: string }>(name: string, divisions: readonly D[]): D | undefined {
  const wanted = divisionNameKey(name)
  return wanted ? divisions.find((d) => divisionNameKey(d.displayName) === wanted) : undefined
}
