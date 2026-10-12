// Which club a federation's calendar means by a name (#647).
//
// Shared domain logic — keep this module free of any browser/RN/Node deps.
//
// An AGR calendar names clubs the AGR's way — « LANDSER ASL », « KEMBS ASL
// TT » — with no number to match on. The import remembers that name on the
// club (`club_federations.name`), so the second calendar finds them all; the
// first leans on the display name. Whatever is not found the admin attaches
// by hand, or creates bare: this is a suggestion, never a decision.
import type { Club } from '../types'

const key = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

type Matchable = Pick<Club, 'id' | 'displayName' | 'affiliations' | 'isArchived'>

/**
 * The club a name most likely is: the one whose name in this federation it is;
 * else a club of the federation with that display name (Landser before its AGR
 * name is known); else any club with that display name. Undefined: create it.
 */
export function matchFederationClub<C extends Matchable>(
  name: string, clubs: readonly C[], federationId: string,
  /**
   * The calendar's organisation (#692): a club filed under another one of the
   * federation's is not a candidate — « SG » or « ASL » exist on both sides of
   * the Haut-Rhin and the Bas-Rhin. A club with no organisation stays one.
   */
  organizationId?: string,
): C | undefined {
  const k = key(name)
  const elsewhere = (c: C) => {
    const org = (c.affiliations ?? []).find((a) => a.federationId === federationId)?.organizationId
    return !!organizationId && !!org && org !== organizationId
  }
  const live = clubs.filter((c) => !c.isArchived && !elsewhere(c))
  const inFederation = (c: C) => (c.affiliations ?? []).some((a) => a.federationId === federationId)
  return live.find((c) => (c.affiliations ?? []).some((a) => a.federationId === federationId && a.name && key(a.name) === k))
    ?? live.find((c) => inFederation(c) && key(c.displayName) === k)
    ?? live.find((c) => key(c.displayName) === k)
}
