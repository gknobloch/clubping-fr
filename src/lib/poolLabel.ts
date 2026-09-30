import type { Group, Team } from '../types'

/** «P. 28» — the poule a team plays in, shown next to its division badge. */
export function poolLabel(team: Pick<Team, 'groupId'>, groups: Pick<Group, 'id' | 'number'>[]): string | undefined {
  const g = groups.find((x) => x.id === team.groupId)
  return g ? `P. ${g.number}` : undefined
}
