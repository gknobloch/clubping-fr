import { describe, it, expect } from 'vitest'
import type { Address } from '../types'
import { buildMatchEvent, parseGameTime } from './calendar'

const address: Address = {
  id: 'a1',
  label: 'Salle des sports',
  street: '12 rue du Stade',
  postalCode: '68170',
  city: 'Rixheim',
  isDefault: true,
}

const base = {
  date: '2025-09-17',
  matchup: 'Rixheim PPA 4 – Mulhouse TT 6',
  matchDayNumber: 1,
  divisionLabel: 'GE 5',
  playersPerGame: 4,
}

describe('parseGameTime', () => {
  it('reads the stored "19h30" form', () => {
    expect(parseGameTime('19h30')).toEqual({ hours: 19, minutes: 30 })
  })

  it('reads a round hour written without minutes', () => {
    expect(parseGameTime('9h')).toEqual({ hours: 9, minutes: 0 })
  })

  it('returns null when the slot has no time yet', () => {
    expect(parseGameTime(undefined)).toBeNull()
    expect(parseGameTime('')).toBeNull()
  })

  it('returns null rather than a nonsense hour', () => {
    expect(parseGameTime('25h00')).toBeNull()
    expect(parseGameTime('19h70')).toBeNull()
    expect(parseGameTime('à confirmer')).toBeNull()
  })
})

describe('buildMatchEvent', () => {
  it('books three and a half hours for a 4-contre-4', () => {
    const e = buildMatchEvent({ ...base, time: '19h30', address })
    expect(e.allDay).toBe(false)
    expect(e.startDate).toEqual(new Date(2025, 8, 17, 19, 30))
    expect(e.endDate).toEqual(new Date(2025, 8, 17, 23, 0))
  })

  it('books half an hour less for a 3-contre-3', () => {
    const e = buildMatchEvent({ ...base, time: '19h30', playersPerGame: 3 })
    expect(e.endDate).toEqual(new Date(2025, 8, 17, 22, 30))
  })

  it('spills a late match over midnight rather than clamping it', () => {
    const e = buildMatchEvent({ ...base, time: '22h00' })
    expect(e.endDate).toEqual(new Date(2025, 8, 18, 1, 30))
  })

  it('falls back to an all-day event when the time is unknown', () => {
    const e = buildMatchEvent({ ...base })
    expect(e.allDay).toBe(true)
    expect(e.startDate).toEqual(new Date(2025, 8, 17, 0, 0))
    expect(e.endDate).toEqual(new Date(2025, 8, 17, 23, 59))
  })

  it('gives the calendar the full address, not the header label', () => {
    const e = buildMatchEvent({ ...base, time: '19h30', address, venueLabel: 'Rixheim' })
    expect(e.location).toBe('Salle des sports, 12 rue du Stade, 68170 Rixheim')
  })

  it('falls back to the venue label when the club has no address on file', () => {
    expect(buildMatchEvent({ ...base, venueLabel: 'Rixheim' }).location).toBe('Rixheim')
    expect(buildMatchEvent({ ...base }).location).toBeUndefined()
  })

  it('notes the journée and the division', () => {
    expect(buildMatchEvent({ ...base, time: '19h30' }).notes).toBe('Journée 1 · GE 5')
    expect(buildMatchEvent({ ...base, divisionLabel: undefined }).notes).toBe('Journée 1')
  })

  it('titles the event with the matchup as the header writes it', () => {
    expect(buildMatchEvent({ ...base }).title).toBe('Rixheim PPA 4 – Mulhouse TT 6')
  })
})
