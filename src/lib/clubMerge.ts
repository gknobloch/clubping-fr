// Two rows for one club, and which of them stays (#730).
//
// Shared domain logic — keep this module free of any browser/RN/Node deps:
// the API runs the same refusal before it writes anything.
//
// The AGR calendar import created bare clubs next to ones that already
// existed — « Landser ASL » beside the onboarded « ASL Landser », « Kembs ASL
// TT » beside the FFTT's « Kembs TT ». One holds the members, the other the
// teams. Merging moves everything onto one row and deletes the other.
import { clubIdFromAffiliation } from './entityIds'
import { clubIdForAffiliation } from './federations'

type MergeableClub = {
  id: string
  displayName: string
  affiliationNumber: string
  affiliations?: ReadonlyArray<{ federationId: string; affiliationNumber: string }>
}

/**
 * How firmly a club's id is its own: derived from its FFTT number (the FFTT
 * imports look a club up by `club-fftt-…`), then from another federation's
 * (`club-agr-680036`, the id onboarding gave Landser), then anything else —
 * the random id an import mints for a club it creates.
 */
function idRank(club: MergeableClub): number {
  if (clubIdFromAffiliation(club.affiliationNumber) === club.id) return 3
  if ((club.affiliations ?? []).some((a) => clubIdForAffiliation(a.federationId, a.affiliationNumber) === club.id)) return 2
  return club.affiliationNumber.trim() ? 1 : 0
}

/**
 * Which row stays when `source` is merged into `target`. The target, unless
 * the source's id is the one the imports would look for: deleting that row
 * would have the next FFTT import recreate it beside the survivor.
 */
export function clubMergeKeeper<C extends MergeableClub>(source: C, target: C): { keep: C; remove: C } {
  return idRank(source) > idRank(target) ? { keep: source, remove: target } : { keep: target, remove: source }
}

export interface ClubMergeContext {
  teams: ReadonlyArray<{ clubId: string; phaseId: string; number: number }>
  memberGroups: ReadonlyArray<{ clubId: string; displayName: string }>
  competitionGroups: ReadonlyArray<{ clubId: string; competitionId: string }>
  /** Both clubs' profiles: a person with one in each would end up twice in one club (#766). */
  profiles: ReadonlyArray<{ clubId?: string; personId?: string; firstName?: string; lastName?: string }>
}

export type ClubMergeRefusal =
  | { reason: 'same_club'; message: string }
  | { reason: 'fftt_numbers'; message: string }
  | { reason: 'federation_numbers'; message: string }
  | { reason: 'team_numbers'; message: string }
  | { reason: 'group_names'; message: string }
  | { reason: 'competition_groups'; message: string }
  | { reason: 'same_person'; message: string }

const groupKey = (name: string) => name.trim().toLowerCase()

/**
 * Why `remove` cannot be folded into `keep` without someone deciding
 * something first — or null. Each refusal is a choice the merge would
 * otherwise make silently: which of two numbers is right, which of two teams
 * numbered 1 plays, whose « Bureau » survives.
 */
export function clubMergeRefusal(
  keep: MergeableClub, remove: MergeableClub, ctx: ClubMergeContext,
): ClubMergeRefusal | null {
  if (keep.id === remove.id) return { reason: 'same_club', message: 'Choisissez un autre club.' }

  const a = keep.affiliationNumber.trim()
  const b = remove.affiliationNumber.trim()
  if (a && b && a !== b) {
    return {
      reason: 'fftt_numbers',
      message: `Deux numéros FFTT différents (${a} et ${b}) : ce sont deux clubs.`,
    }
  }
  for (const r of remove.affiliations ?? []) {
    const k = (keep.affiliations ?? []).find((x) => x.federationId === r.federationId)
    if (k && k.affiliationNumber.trim() && r.affiliationNumber.trim() && k.affiliationNumber.trim() !== r.affiliationNumber.trim()) {
      return {
        reason: 'federation_numbers',
        message: `Deux numéros d’affiliation différents dans la même fédération (${k.affiliationNumber} et ${r.affiliationNumber}).`,
      }
    }
  }

  const kept = new Set(ctx.teams.filter((t) => t.clubId === keep.id).map((t) => `${t.phaseId}|${t.number}`))
  const clash = ctx.teams.find((t) => t.clubId === remove.id && kept.has(`${t.phaseId}|${t.number}`))
  if (clash) {
    return {
      reason: 'team_numbers',
      message: `Les deux clubs ont une équipe ${clash.number} dans la même phase : renumérotez ou supprimez l’une d’elles d’abord.`,
    }
  }

  const names = new Set(ctx.memberGroups.filter((g) => g.clubId === keep.id).map((g) => groupKey(g.displayName)))
  const sameName = ctx.memberGroups.find((g) => g.clubId === remove.id && names.has(groupKey(g.displayName)))
  if (sameName) {
    return {
      reason: 'group_names',
      message: `Les deux clubs ont un groupe « ${sameName.displayName} » : renommez l’un des deux d’abord.`,
    }
  }

  const reserved = new Set(ctx.competitionGroups.filter((g) => g.clubId === keep.id).map((g) => g.competitionId))
  if (ctx.competitionGroups.some((g) => g.clubId === remove.id && reserved.has(g.competitionId))) {
    return {
      reason: 'competition_groups',
      message: 'Les deux clubs réservent une même compétition à un groupe : levez l’une des deux réservations d’abord.',
    }
  }

  // One person, a profile in each (#766): « Ajouter à un autre club » into the
  // AGR's copy of Bootzheim, then this merge, left Agathe Da Costa twice in one
  // club — twice in Joueurs, among the administrators and in her switcher.
  // Which profile stays is a decision: one never used is deleted (#733), and
  // the other is the one she signs in with.
  const keptPeople = new Set(ctx.profiles.filter((p) => p.clubId === keep.id && p.personId).map((p) => p.personId))
  const twice = ctx.profiles.filter((p) => p.clubId === remove.id && p.personId && keptPeople.has(p.personId))
  if (twice.length) {
    const who = [...new Set(twice.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ') || 'un membre'))]
    return {
      reason: 'same_person',
      message: `${who.join(', ')} ${who.length > 1 ? 'ont' : 'a'} un profil dans chacun des deux clubs : supprimez ou archivez l’un des deux d’abord.`,
    }
  }
  return null
}
