import { describe, it, expect } from 'vitest'
import type { PlayerSeasonLicence } from '@/types'
import { clubLicences } from './seasonLicences'

// #488 — a licence not validated for the season is a fact the import already
// establishes and used to throw away. The care here is entirely about the third
// state: no row is not the same as no licence.

const rows: PlayerSeasonLicence[] = [
  { seasonId: '26', playerId: 'p1' },
  { seasonId: '26', playerId: 'p2' },
  { seasonId: '27', playerId: 'p3' },
]
const CLUB = ['p1', 'p2', 'p3']

describe('clubLicences', () => {
  it('says who the federation listed, and who it did not', () => {
    const { statusOf } = clubLicences(rows, '26', CLUB)
    expect(statusOf('p1')).toBe('validated')
    expect(statusOf('p3')).toBe('missing')
  })

  // The whole reason this is a three-state answer: a club that has never
  // imported must not have its entire roster flagged.
  it('has no opinion at all before the club has imported', () => {
    const { imported, statusOf, missing } = clubLicences([], '26', CLUB)
    expect(imported).toBe(false)
    expect(statusOf('p1')).toBe('unknown')
    expect(missing(CLUB)).toEqual([])
  })

  it('reads only its own club — another club having imported proves nothing', () => {
    const otherClub = clubLicences(rows, '26', ['p9'])
    expect(otherClub.imported).toBe(false)
    expect(otherClub.statusOf('p9')).toBe('unknown')
  })

  it('answers per season, since a licence is validated for one', () => {
    expect(clubLicences(rows, '27', CLUB).statusOf('p1')).toBe('missing')
    expect(clubLicences(rows, '27', CLUB).statusOf('p3')).toBe('validated')
  })

  it('has no opinion without a season either', () => {
    expect(clubLicences(rows, undefined, CLUB).statusOf('p1')).toBe('unknown')
  })

  it('picks the unlicensed out of a line-up, in the order given', () => {
    const { missing } = clubLicences(rows, '26', CLUB)
    expect(missing(['p3', 'p1', 'p2'])).toEqual(['p3'])
    expect(missing(['p1', 'p2'])).toEqual([])
  })
})
