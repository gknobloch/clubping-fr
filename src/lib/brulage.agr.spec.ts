import { describe, it, expect } from 'vitest'
import { agrPickConsequence, computeBrulage, isPlayerEligibleForTeam, type BrulageContext } from './brulage'
import type { Game, GameSelection, MatchDay, Phase, Team } from '@/types'

// #651 — the AGR's rule (art. 26, 29, 92): a player is titulaire of one team,
// never plays below it, and the fourth match above it in the SEASON — both
// phases — makes them titulaire of the lowest higher team they played in.

const phases: Phase[] = [
  { id: 'p1', seasonId: 'agr-27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active' },
  { id: 'p2', seasonId: 'agr-27', name: 'Phase 2', displayName: '2026/2027 Phase 2', status: 'upcoming' },
]
const team = (phaseId: string, number: number, playerIds: string[] = []): Team => ({
  id: `${phaseId}-t${number}`, clubId: 'landser', phaseId, number, divisionId: `div-${number}`,
  groupId: `${phaseId}-g${number}`, gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '',
  playerIds, isArchived: false,
})
// Léo is titulaire of team 4.
const teams = [1, 2, 3, 4].flatMap((n) => [team('p1', n, n === 4 ? ['leo'] : []), team('p2', n, n === 4 ? ['leo'] : [])])
const ctx: BrulageContext = {
  teams, phases,
  divisions: [1, 2, 3, 4].map((n) => ({ id: `div-${n}`, competitionId: 'c-agr' })),
  competitions: [{ id: 'c-agr', federationId: 'agr' }],
}
const ffttCtx: BrulageContext = { ...ctx, competitions: [{ id: 'c-agr', federationId: 'fftt' }] }
const phase1 = teams.filter((t) => t.phaseId === 'p1')
const phase2 = teams.filter((t) => t.phaseId === 'p2')

/** Each team its own poule: journée `n` of team `t` in `phase`. */
const matchDays: MatchDay[] = teams.flatMap((t) =>
  Array.from({ length: 14 }, (_, i) => ({ id: `${t.groupId}-j${i + 1}`, groupId: t.groupId, number: i + 1, date: '2026-10-01' })))
const games: Game[] = matchDays.map((md) => ({ id: `g-${md.id}`, matchDayId: md.id, homeTeamId: 'x', awayTeamId: 'y' }))

/** Léo fielded in team `number` of `phase` on journée `j`. */
const played = (phase: string, number: number, j: number): GameSelection =>
  ({ gameId: `g-${phase}-g${number}-j${j}`, teamId: `${phase}-t${number}`, playerIds: ['leo'] })
const md = (phase: string, number: number, j: number) => `${phase}-g${number}-j${j}`

describe('AGR titularity (#651)', () => {
  it('keeps a declared titulaire out of the teams below theirs, and lets them play above', () => {
    const declared = [team('p1', 3, ['ana']), ...teams.filter((t) => t.id !== 'p1-t3')]
    const c = { ...ctx, teams: declared }
    const p1 = declared.filter((t) => t.phaseId === 'p1')
    expect(isPlayerEligibleForTeam('ana', p1.find((t) => t.number === 4)!, p1, matchDays, games, [], md('p1', 4, 1), c)).toBe(false)
    expect(isPlayerEligibleForTeam('ana', p1.find((t) => t.number === 1)!, p1, matchDays, games, [], md('p1', 1, 1), c)).toBe(true)
  })

  it('is not brûlé by three matches above, and is by the fourth — into the lowest higher team (art. 29’s example)', () => {
    const three = [played('p1', 1, 1), played('p1', 1, 2), played('p1', 2, 3)]
    expect(computeBrulage('leo', phase1, matchDays, games, three, null, ctx)).toEqual({ burnedIntoTeamNumber: null, burnedIntoTeamId: null })
    const four = [...three, played('p1', 3, 4)]
    expect(computeBrulage('leo', phase1, matchDays, games, four, null, ctx)).toEqual({ burnedIntoTeamNumber: 3, burnedIntoTeamId: 'p1-t3' })
    expect(isPlayerEligibleForTeam('leo', phase1[3], phase1, matchDays, games, four, md('p1', 4, 5), ctx)).toBe(false)
    expect(isPlayerEligibleForTeam('leo', phase1[2], phase1, matchDays, games, four, md('p1', 3, 5), ctx)).toBe(true)
  })

  it('counts the season, not the phase: phase 1’s matches above still count in phase 2', () => {
    const sels = [played('p1', 2, 1), played('p1', 2, 2), played('p1', 2, 3), played('p2', 2, 9)]
    expect(computeBrulage('leo', phase2, matchDays, games, sels, null, ctx).burnedIntoTeamNumber).toBe(2)
    // Before journée 9, the fourth has not been played yet.
    expect(isPlayerEligibleForTeam('leo', phase2[3], phase2, matchDays, games, sels, md('p2', 4, 9), ctx)).toBe(true)
  })

  it('makes an undeclared player titulaire of their first match’s team (art. 26)', () => {
    const sels = [{ ...played('p1', 2, 1), playerIds: ['zoe'] }]
    expect(isPlayerEligibleForTeam('zoe', phase1[2], phase1, matchDays, games, sels, md('p1', 3, 2), ctx)).toBe(false)
    expect(isPlayerEligibleForTeam('zoe', phase1[0], phase1, matchDays, games, sels, md('p1', 1, 2), ctx)).toBe(true)
    expect(isPlayerEligibleForTeam('zoe', phase1[3], phase1, matchDays, games, [], md('p1', 4, 1), ctx)).toBe(true)
  })

  it('says what the next pick above would do', () => {
    const three = [played('p1', 1, 1), played('p1', 1, 2), played('p1', 2, 3)]
    expect(agrPickConsequence('leo', phase1[2], phase1, matchDays, games, three, md('p1', 3, 4), ctx))
      .toEqual({ superiorGames: 4, becomesTitularOf: 3 })
    expect(agrPickConsequence('leo', phase1[0], phase1, matchDays, games, three.slice(0, 1), md('p1', 1, 4), ctx))
      .toEqual({ superiorGames: 2, becomesTitularOf: null })
    expect(agrPickConsequence('leo', phase1[3], phase1, matchDays, games, three, md('p1', 4, 4), ctx)).toBeNull()
  })

  it('leaves an FFTT team to the FFTT’s rule', () => {
    const two = [played('p1', 1, 1), played('p1', 1, 2)]
    expect(computeBrulage('leo', phase1, matchDays, games, two, null, ffttCtx).burnedIntoTeamNumber).toBe(1)
    expect(computeBrulage('leo', phase1, matchDays, games, two, null, ctx).burnedIntoTeamNumber).toBeNull()
  })
})
