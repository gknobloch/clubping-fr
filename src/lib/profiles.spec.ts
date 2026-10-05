import { describe, expect, it } from 'vitest'
import { hasOtherProfiles, profileName, profilesByClub } from './profiles'
import type { Profile } from '../types'

const p = (over: Partial<Profile> & Pick<Profile, 'id'>): Profile => ({ role: 'player', ...over })

describe('profilesByClub (#640)', () => {
  it('groups by club, clubs by name, the clubless last', () => {
    const groups = profilesByClub([
      p({ id: 'admin', role: 'general_admin', firstName: 'Benjamin' }),
      p({ id: 'sacha', firstName: 'Sacha', clubId: 'b', clubName: 'Rixheim PPA' }),
      p({ id: 'benjamin', firstName: 'Benjamin', clubId: 'a', clubName: 'CSS Bergheim' }),
      p({ id: 'lou', firstName: 'Lou', clubId: 'b', clubName: 'Rixheim PPA' }),
    ])
    expect(groups.map((g) => g.clubName)).toEqual(['CSS Bergheim', 'Rixheim PPA', 'Sans club'])
    expect(groups[1].profiles.map((x) => x.id)).toEqual(['lou', 'sacha'])
    expect(groups[2].clubId).toBeUndefined()
  })

  it('falls back on the id of a club it cannot name', () => {
    expect(profilesByClub([p({ id: 'x', clubId: 'club-1' })])[0].clubName).toBe('club-1')
  })
})

describe('hasOtherProfiles', () => {
  it('offers nothing to switch to with one profile', () => {
    expect(hasOtherProfiles([p({ id: 'a' })], 'a')).toBe(false)
    expect(hasOtherProfiles(undefined, 'a')).toBe(false)
    expect(hasOtherProfiles([p({ id: 'a' }), p({ id: 'b' })], 'a')).toBe(true)
  })
})

describe('profileName', () => {
  it('reads the name, and the role when there is none', () => {
    expect(profileName(p({ id: 'a', firstName: 'Sacha', lastName: 'Henaut' }))).toBe('Sacha Henaut')
    expect(profileName(p({ id: 'g', role: 'general_admin' }))).toBe('Administrateur')
  })
})
