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
 * already belongs to a phase, so "GE 3 Phase 1" and "GE Elite P1" are stored
 * as "GE 3" and "GE Elite". Both spellings appear in real FFTT data — the
 * long "Phase N" form for the numbered divisions, the short "PN" form for
 * Elite. A name with no marker is returned unchanged.
 */
export function divisionDisplayName(name: string): string {
  // The marker must carry a "Phase"/"P" of its own, so a division whose name
  // simply ends in a number ("GE 3") is left alone.
  return name.replace(/\s+(?:phase\s*[1-9]|p[1-9])\s*$/i, '').trim()
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
