import { describe, expect, it } from 'vitest'
import { hasOtherProfiles, managedSession, profileClubName, profileFederations, profileName, profileSections } from './profiles'
import type { Profile } from '../types'

const p = (over: Partial<Profile> & Pick<Profile, 'id'>): Profile => ({ role: 'player', ...over })

describe('profileSections (#749)', () => {
  it('lists the person’s clubs by name, the general administration, then the clubless', () => {
    const { own, managed } = profileSections([
      p({ id: 'ghost', firstName: 'Gilles' }),
      p({ id: 'ga', role: 'general_admin', firstName: 'Gilles' }),
      p({ id: 'rix', firstName: 'Gilles', clubId: 'r', clubName: 'Rixheim PPA' }),
      p({ id: 'lan', firstName: 'Gilles', clubId: 'l', clubName: 'ASL Landser' }),
    ])
    expect(own.map((x) => x.id)).toEqual(['lan', 'rix', 'ga', 'ghost'])
    expect(managed).toEqual([])
  })

  it('sets the delegated profiles apart, by name', () => {
    const { own, managed } = profileSections([
      p({ id: 'nathan', firstName: 'Nathan', clubId: 'r', clubName: 'Rixheim PPA', signedIn: true }),
      p({ id: 'sacha', firstName: 'Sacha', clubId: 'b', clubName: 'CSS Bergheim', managed: true }),
      p({ id: 'chloe', firstName: 'Chloé', clubId: 'r', clubName: 'Rixheim PPA', managed: true }),
    ])
    expect(own.map((x) => x.id)).toEqual(['nathan'])
    expect(managed.map((x) => x.id)).toEqual(['chloe', 'sacha'])
  })
})

describe('profileClubName', () => {
  it('names the club, the general administration, or falls back', () => {
    expect(profileClubName(p({ id: 'a', clubId: 'r', clubName: 'Rixheim PPA' }))).toBe('Rixheim PPA')
    expect(profileClubName(p({ id: 'g', role: 'general_admin', clubId: 'r' }))).toBe('Administration générale')
    expect(profileClubName(p({ id: 'x', clubId: 'club-1' }))).toBe('club-1')
    expect(profileClubName(p({ id: 'y' }))).toBe('Sans club')
  })
})

describe('managedSession (#749)', () => {
  const nathan = p({ id: 'nathan', clubId: 'r', signedIn: true })
  const nathanLan = p({ id: 'nathan-lan', clubId: 'l' })
  const chloe = p({ id: 'chloe', clubId: 'r', managed: true })

  it('is nothing on one’s own profile', () => {
    expect(managedSession([nathan, chloe], 'nathan')).toBeNull()
    expect(managedSession(undefined, 'nathan')).toBeNull()
  })

  it('names whose profile it is, and leads back to the one that signed in', () => {
    expect(managedSession([nathanLan, chloe, nathan], 'chloe')).toEqual({ current: chloe, home: nathan })
  })

  it('leads back to an own profile when the server did not say which signed in', () => {
    const lan = p({ id: 'nathan-lan', clubId: 'l' })
    expect(managedSession([chloe, lan], 'chloe')).toEqual({ current: chloe, home: lan })
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

describe('profileFederations (#767)', () => {
  const federations = [{ id: 'fftt', shortName: 'FFTT' }, { id: 'agr', shortName: 'AGR' }]
  const clubs = [
    { id: 'rixheim', affiliationNumber: '06680011' },
    { id: 'landser', affiliationNumber: '', affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] },
    { id: 'bootzheim', affiliationNumber: '06670183', affiliations: [{ federationId: 'agr', affiliationNumber: '670011' }] },
  ]
  const at = (clubId: string): Profile => ({ id: `p-${clubId}`, role: 'club_admin', clubId })

  it('names the federations of the profile’s club, the FFTT first', () => {
    expect(profileFederations(at('rixheim'), clubs, federations)).toEqual(['FFTT'])
    expect(profileFederations(at('landser'), clubs, federations)).toEqual(['AGR'])
    expect(profileFederations(at('bootzheim'), clubs, federations)).toEqual(['FFTT', 'AGR'])
  })

  it('says nothing with a single federation, for the general administration, or for a club not loaded', () => {
    expect(profileFederations(at('bootzheim'), clubs, federations.slice(0, 1))).toEqual([])
    expect(profileFederations({ id: 'ga', role: 'general_admin' }, clubs, federations)).toEqual([])
    expect(profileFederations(at('unknown'), clubs, federations)).toEqual([])
  })
})
