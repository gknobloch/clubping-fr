// FFTT divisions import logic (#219), shared by the API and the web UI.

/** A division node as returned by the FFTT divisions GraphQL query. */
export interface FfttDivision {
  /** Numeric FFTT id as text (extracted from the "/api/divisions/N" IRI). */
  id: string
  /** FFTT identifier, e.g. "GE3P1". */
  identifier: string
  /** Display name, e.g. "GE 3 Phase 1". */
  name: string
  /** FFTT id of the division directly above this one; null for the top one. */
  parentId: string | null
}

/** Extract the numeric id from an FFTT IRI ("/api/divisions/234020" → "234020"). */
export function ffttIdFromIri(iri: string): string {
  return iri.slice(iri.lastIndexOf('/') + 1)
}

// ---------------------------------------------------------------------------
// Import configuration
// ---------------------------------------------------------------------------

/**
 * The FFTT contest the divisions import reads — and, today, the only one it
 * can read (#482).
 *
 * `contests(… identifier: "1")` is what the import asks for, so every division
 * it has ever created belongs to one competition: the men's team championship
 * ("FED_Championnat de France par Equipes Masculin"). That is not an accident
 * to be tidied away but the fact that lets the import file its divisions under
 * a competition without asking anyone — see `competitionForContest`.
 *
 * The day FFTT's youth or women's championships are imported, this stops being
 * a constant and becomes a parameter of the import; naming it is what makes
 * that one edit rather than a hunt through a template literal.
 */
export const FFTT_CHAMPIONSHIP_CONTEST_IDENTIFIER = '1'

/**
 * The federation's own contest identifiers, from three live listings. Unlike
 * the regional ones these are stable, unique, and mean the same thing in every
 * organisation — the same identifier carries the same FFTT id everywhere,
 * which is what shows a contest is one global entity and not one per league.
 *
 * Kept as documentation rather than as a filter: nothing in the code treats a
 * regional contest differently, and a hard-coded list of what is "real" would
 * be wrong the first time a league runs something this misses.
 *
 *   1  Championnat de France par Equipes Masculin
 *   2  Championnat de France par Equipes Féminin
 *   3  Championnat par Equipes Corporatif
 *   4  Championnat par Equipes Jeunes
 *   N  Interclubs Jeunes        K  Coupe Nationale Vétérans
 *   V  Championnat de France Vétérans   E  Championnat de France Corporatifs
 *   I  Critérium Fédéral        H  Finales par classement   A  Finales Individuelles
 */

/**
 * Whether a string has the shape of an FFTT contest identifier.
 *
 * It used to guard a GraphQL string literal, and that is no longer true of
 * anything: the contest is now picked out of the listing in JavaScript, by id,
 * so no value from a request reaches a query as text at all. Two reasons for
 * that change, and this is the lesser one — the greater is that an identifier
 * does not identify a contest ("TO" names two in one listing), so a filtered
 * query could not have said which was meant.
 *
 * What remains is a cheap sanity check on the identifier an older client may
 * still send. Real ones look like "1", "4", "TO", "L06-V", "FRC-Q", "OPR21".
 */
export function isFfttContestIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(value)
}

/** Players per game when no override matches. */
export const PLAYERS_PER_GAME_DEFAULT = 4

/**
 * Overrides by FFTT identifier prefix (checked in declaration order).
 * "GE7P1" / "GE7P2" → the GE 7 division plays 3-player games.
 */
export const PLAYERS_PER_GAME_BY_IDENTIFIER_PREFIX: Record<string, number> = {
  GE7: 3,
}

export function playersPerGameFor(identifier: string): number {
  for (const [prefix, players] of Object.entries(PLAYERS_PER_GAME_BY_IDENTIFIER_PREFIX)) {
    if (identifier.startsWith(prefix)) return players
  }
  return PLAYERS_PER_GAME_DEFAULT
}

// ---------------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------------

/**
 * Strip the phase marker FFTT bakes into a division name (#275): a division
 * already belongs to a phase, so "GE 3 Phase 1" is stored as "GE 3". All three
 * spellings below occur in real data (checked against a production export):
 *   "GE 3 Phase 1"                   -> "GE 3"
 *   "GE Elite P1"                    -> "GE Elite"
 *   "L03_Regionale 1 Messieurs_Ph1"  -> "L03_Regionale 1 Messieurs"
 * A name with no marker is returned unchanged.
 */
export function divisionDisplayName(name: string): string {
  // The marker must carry a "Phase"/"Ph"/"P" of its own, so a division whose
  // name simply ends in a number ("GE 3", "Nationale 3") is left alone.
  return name.replace(/[\s_]+(?:phase\s*[1-9]|ph?[1-9])\s*$/i, '').trim()
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Order divisions top-to-bottom following the parent chain: each node's
 * `parentId` points to the division directly above it, so the top division has
 * no parent. Real data is imperfect (e.g. "GE 7" has no parent and no
 * children), so:
 * - roots that have children come first (the genuine top of a chain),
 * - orphan roots are appended after the chains,
 * - nodes whose parent is not in the list (or in a cycle) are appended last,
 * each group sorted by identifier for determinism.
 */
export function orderDivisions(divisions: FfttDivision[]): FfttDivision[] {
  const byIdentifier = (a: FfttDivision, b: FfttDivision) =>
    a.identifier.localeCompare(b.identifier, undefined, { numeric: true })

  const childrenOf = new Map<string, FfttDivision[]>()
  const roots: FfttDivision[] = []
  for (const d of divisions) {
    if (d.parentId === null) {
      roots.push(d)
    } else {
      childrenOf.set(d.parentId, [...(childrenOf.get(d.parentId) ?? []), d])
    }
  }

  const ordered: FfttDivision[] = []
  const seen = new Set<string>()
  const visit = (d: FfttDivision) => {
    if (seen.has(d.id)) return
    seen.add(d.id)
    ordered.push(d)
    for (const child of (childrenOf.get(d.id) ?? []).sort(byIdentifier)) visit(child)
  }

  for (const root of roots.filter((r) => childrenOf.has(r.id)).sort(byIdentifier)) visit(root)
  for (const root of roots.filter((r) => !childrenOf.has(r.id)).sort(byIdentifier)) visit(root)
  for (const rest of divisions.filter((d) => !seen.has(d.id)).sort(byIdentifier)) visit(rest)

  return ordered
}

// ---------------------------------------------------------------------------
// Manual reordering (#236)
// ---------------------------------------------------------------------------

type RankedDivision = { id: string; parentId?: string }

/**
 * Whether `division` can move up one rank. Reordering is always an adjacent
 * swap, and a division with a parent is locked relative to it — it can never
 * end up ranked above its own parent — so it's blocked exactly when the
 * division directly above (by rank) is its parent. `inPhase` must already be
 * sorted by rank ascending and scoped to the same phase.
 */
export function canMoveDivisionUp(division: RankedDivision, inPhase: RankedDivision[]): boolean {
  const idx = inPhase.findIndex((d) => d.id === division.id)
  if (idx <= 0) return false
  return inPhase[idx - 1].id !== division.parentId
}

/**
 * Symmetric to canMoveDivisionUp: a division can never end up ranked below
 * one of its own children, so moving down is blocked exactly when the
 * division directly below is a child of `division`.
 */
export function canMoveDivisionDown(division: RankedDivision, inPhase: RankedDivision[]): boolean {
  const idx = inPhase.findIndex((d) => d.id === division.id)
  if (idx < 0 || idx >= inPhase.length - 1) return false
  return inPhase[idx + 1].parentId !== division.id
}
