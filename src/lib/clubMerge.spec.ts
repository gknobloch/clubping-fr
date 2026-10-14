import { describe, expect, it } from 'vitest'
import { clubMergeKeeper, clubMergeRefusal, type ClubMergeContext } from './clubMerge'

// #730 — two rows for one club, as the AGR calendar import left them.

const club = (id: string, displayName: string, affiliationNumber = '', affiliations: Array<{ federationId: string; affiliationNumber: string }> = []) =>
  ({ id, displayName, affiliationNumber, affiliations })
const kembs = club('club-fftt-06680140', 'Kembs TT', '06680140')
const kembsAgr = club('club-1-dfavb', 'Kembs ASL TT', '', [{ federationId: 'agr', affiliationNumber: '' }])
const landser = club('club-agr-680036', 'ASL Landser', '', [{ federationId: 'agr', affiliationNumber: '680036' }])
const landserImported = club('club-2-o1zd8', 'Landser ASL', '', [{ federationId: 'agr', affiliationNumber: '680036' }])
const empty: ClubMergeContext = { teams: [], memberGroups: [], competitionGroups: [] }

describe('clubMergeKeeper', () => {
  it('keeps the row whose id the imports look up, whichever was picked', () => {
    expect(clubMergeKeeper(kembsAgr, kembs).keep.id).toBe(kembs.id)
    expect(clubMergeKeeper(kembs, kembsAgr).keep.id).toBe(kembs.id)
    expect(clubMergeKeeper(landser, landserImported).keep.id).toBe(landser.id)
  })

  it('keeps the target between two rows of equal standing', () => {
    const a = club('a', 'A')
    const b = club('b', 'B')
    expect(clubMergeKeeper(a, b)).toEqual({ keep: b, remove: a })
  })
})

describe('clubMergeRefusal', () => {
  it('lets Landser’s two rows merge', () => {
    expect(clubMergeRefusal(landser, landserImported, empty)).toBeNull()
  })

  it('refuses two FFTT numbers, or two numbers in one federation', () => {
    expect(clubMergeRefusal(kembs, club('club-fftt-06680011', 'Rixheim PPA', '06680011'), empty)?.reason).toBe('fftt_numbers')
    expect(clubMergeRefusal(landser, club('x', 'Kembs', '', [{ federationId: 'agr', affiliationNumber: '680021' }]), empty)?.reason)
      .toBe('federation_numbers')
  })

  it('refuses two teams of one number in one phase, but not across phases', () => {
    const teams = [
      { clubId: kembs.id, phaseId: '27-1', number: 1 },
      { clubId: kembsAgr.id, phaseId: 'agr-27-1', number: 1 },
    ]
    expect(clubMergeRefusal(kembs, kembsAgr, { ...empty, teams })).toBeNull()
    expect(clubMergeRefusal(kembs, kembsAgr, { ...empty, teams: [...teams, { clubId: kembsAgr.id, phaseId: '27-1', number: 1 }] })?.reason)
      .toBe('team_numbers')
  })

  it('refuses two groups of one name, and one competition reserved on both sides', () => {
    expect(clubMergeRefusal(kembs, kembsAgr, {
      ...empty, memberGroups: [{ clubId: kembs.id, displayName: 'Bureau' }, { clubId: kembsAgr.id, displayName: ' bureau' }],
    })?.reason).toBe('group_names')
    expect(clubMergeRefusal(kembs, kembsAgr, {
      ...empty, competitionGroups: [{ clubId: kembs.id, competitionId: 'c' }, { clubId: kembsAgr.id, competitionId: 'c' }],
    })?.reason).toBe('competition_groups')
  })
})
