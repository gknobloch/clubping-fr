import { describe, it, expect } from 'vitest'
import type { User } from '@/types'
import { getDisplayNameForUser, getRoleLabel } from './data'

// #315 — e-mail became optional, and it was the last-resort label here.
describe('getDisplayNameForUser', () => {
  const base: User = { id: 'u1', role: 'player', isPlayer: true }

  it('prefers the name, whether or not there is an address', () => {
    expect(getDisplayNameForUser({ ...base, firstName: 'Ivan', lastName: 'Meyer' })).toBe('Ivan Meyer')
    expect(
      getDisplayNameForUser({ ...base, firstName: 'Ivan', lastName: 'Meyer', email: 'a@b.c' }),
    ).toBe('Ivan Meyer')
  })

  it('falls back to the address when there is no name', () => {
    expect(getDisplayNameForUser({ ...base, email: 'a@b.c' })).toBe('a@b.c')
  })

  it('never renders "undefined" for a member with neither', () => {
    expect(getDisplayNameForUser(base)).toBe('Utilisateur sans nom')
  })
})

describe('getRoleLabel', () => {
  it('returns French labels for all roles', () => {
    expect(getRoleLabel('general_admin')).toBe('Administrateur général')
    expect(getRoleLabel('club_admin')).toBe('Administrateur de club')
    expect(getRoleLabel('player')).toBe('Joueur')
  })
})
