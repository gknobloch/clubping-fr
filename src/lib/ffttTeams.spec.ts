import { describe, expect, it } from 'vitest'
import { parsePoolOpponent, parsePoolOpponents, poolOpponentsQuery, type FfttPoolOpponentNode } from './ffttTeams'

const NODE: FfttPoolOpponentNode = {
  opponent: { team: { id: '/api/teams/3354', name: 'RIXHEIM PPA  2' } },
  pool: {
    id: '/api/pools/1502306',
    name: '9',
    group: {
      tour: {
        division: {
          id: '/api/divisions/234461', identifier: 'GE2P1', name: 'GE 2 Phase 1',
          phase: { id: '/api/phases/1' },
          parent: { id: '/api/divisions/234322' },
        },
      },
    },
  },
}

describe('parsePoolOpponent', () => {
  it('parses a standard engagement node', () => {
    expect(parsePoolOpponent(NODE)).toEqual({
      id: '3354',
      number: 2,
      phase: 1,
      divisionId: '234461',
      // Phase marker stripped: the division already belongs to a phase (#275).
      divisionName: 'GE 2',
      divisionIdentifier: 'GE2P1',
      divisionParentId: '234322',
      poolId: '1502306',
      poolNumber: 9,
      label: 'RIXHEIM PPA  2',
    })
  })

  it('is null when the division has no parent (#236)', () => {
    const t = parsePoolOpponent({
      ...NODE,
      pool: {
        ...NODE.pool!,
        group: { tour: { division: { id: '/api/divisions/1', name: 'GE 7 Phase 1', parent: null } } },
      },
    })
    expect(t?.divisionParentId).toBeNull()
  })

  it('reads parenthesised team numbers ("RIXHEIM PPA (5)")', () => {
    const t = parsePoolOpponent({
      ...NODE,
      opponent: { team: { id: '/api/teams/18098', name: 'RIXHEIM PPA (5)' } },
    })
    expect(t?.number).toBe(5)
    expect(t?.id).toBe('18098')
  })

  it('handles a missing phase or unreadable pool name', () => {
    const t = parsePoolOpponent({
      ...NODE,
      pool: { ...NODE.pool!, name: 'X', group: { tour: { division: { id: '/api/divisions/1', name: null } } } },
    })
    expect(t?.phase).toBeNull()
    expect(t?.poolNumber).toBeNull()
    expect(t?.divisionName).toBe('Division 1')
  })

  it('returns null without a team, pool, division, or team number', () => {
    expect(parsePoolOpponent({ ...NODE, opponent: null })).toBeNull()
    expect(parsePoolOpponent({ ...NODE, pool: null })).toBeNull()
    expect(parsePoolOpponent({ ...NODE, pool: { id: '/api/pools/1', group: null } })).toBeNull()
    expect(parsePoolOpponent({
      ...NODE, opponent: { team: { id: '/api/teams/1', name: 'SANS NUMERO' } },
    })).toBeNull()
  })
})

describe('parsePoolOpponents', () => {
  it('drops unusable nodes and orders by phase then team number', () => {
    const phase2 = {
      ...NODE,
      opponent: { team: { id: '/api/teams/9', name: 'RIXHEIM PPA 1' } },
      pool: {
        ...NODE.pool!,
        group: { tour: { division: { id: '/api/divisions/9', name: 'GE 1 Phase 2', phase: { id: '/api/phases/2' } } } },
      },
    }
    const out = parsePoolOpponents([{ node: phase2 }, { node: NODE }, { node: { ...NODE, opponent: null } }, {}])
    expect(out.map((t) => [t.phase, t.number])).toEqual([[1, 2], [2, 1]])
  })
})

describe('poolOpponentsQuery', () => {
  it('embeds the sanitized affiliation number', () => {
    const q = poolOpponentsQuery('06680011"x{}')
    expect(q).toContain('opponent_team_clubs_identifier: "06680011x"')
    expect(q).toContain('season_current: true')
  })

  it('requests the division parent (#236)', () => {
    expect(poolOpponentsQuery('06680011')).toContain('phase { id } parent { id }')
  })
})
