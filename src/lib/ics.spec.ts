import { describe, it, expect } from 'vitest'
import { buildMatchEvent } from './calendar'
import { icsFileName, toIcs } from './ics'

const NOW = new Date(Date.UTC(2026, 7, 22, 9, 30, 0))
const base = {
  date: '2026-09-19',
  matchup: 'Rixheim PPA 1 – Illzach TTSJB 2',
  matchDayNumber: 1,
  divisionLabel: 'GE Elite',
  playersPerGame: 4,
}
const lines = (ics: string) => ics.split('\r\n')

describe('toIcs', () => {
  it('writes the slot as a floating local time, and the 3h30 of a 4-contre-4', () => {
    const ics = toIcs(buildMatchEvent({ ...base, time: '16h00' }), 'game-g1@clubping.fr', NOW)

    // No Z and no TZID: 16h00 in Alsace is 16h00 for everyone who plays there,
    // and a floating time says so without shipping a timezone database.
    expect(lines(ics)).toContain('DTSTART:20260919T160000')
    expect(lines(ics)).toContain('DTEND:20260919T193000')
    expect(lines(ics)).toContain('SUMMARY:Rixheim PPA 1 – Illzach TTSJB 2')
    expect(lines(ics)).toContain('UID:game-g1@clubping.fr')
    expect(lines(ics)).toContain('DTSTAMP:20260822T093000Z')
  })

  it('books the whole day when the slot has no confirmed time', () => {
    const ics = toIcs(buildMatchEvent({ ...base, time: undefined }), 'game-g1@clubping.fr', NOW)

    // DTEND is exclusive for a DATE value — the day after, or the match ends
    // the evening before it starts.
    expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20260919')
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260920')
    expect(ics).not.toContain('DTSTART:2026')
  })

  it('escapes the characters iCalendar reserves', () => {
    const ics = toIcs(
      buildMatchEvent({
        ...base,
        time: '16h00',
        matchup: 'Rixheim, PPA 1 – Illzach; TTSJB 2',
        venueLabel: 'Salle A\\B',
      }),
      'game-g1@clubping.fr',
      NOW,
    )

    expect(lines(ics)).toContain('SUMMARY:Rixheim\\, PPA 1 – Illzach\\; TTSJB 2')
    expect(lines(ics)).toContain('LOCATION:Salle A\\\\B')
  })

  it('carries the journée and the division as the event notes', () => {
    const ics = toIcs(buildMatchEvent({ ...base, time: '16h00' }), 'game-g1@clubping.fr', NOW)

    expect(lines(ics)).toContain('DESCRIPTION:Journée 1 · GE Elite')
  })

  it('folds a long line without splitting a multi-byte character', () => {
    const ics = toIcs(
      buildMatchEvent({
        ...base,
        time: '16h00',
        matchup: 'Équipe très longuement nommée de Rixheim – Équipe également très longuement nommée de Illzach',
      }),
      'game-g1@clubping.fr',
      NOW,
    )

    // Every line fits in 75 octets, and the unfolded text is intact — a split
    // through the middle of a "é" reaches the calendar as mojibake.
    for (const line of lines(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(ics.replace(/\r\n /g, '')).toContain(
      'SUMMARY:Équipe très longuement nommée de Rixheim – Équipe également très longuement nommée de Illzach',
    )
  })

  it('is a complete calendar, CRLF throughout', () => {
    const ics = toIcs(buildMatchEvent({ ...base, time: '16h00' }), 'game-g1@clubping.fr', NOW)

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('icsFileName', () => {
  it('names the file after the journée and the opponent', () => {
    expect(icsFileName(3, 'Illzach TTSJB 2')).toBe('club-ping-j3-illzach-ttsjb-2.ics')
  })

  it('strips accents and punctuation rather than leaving them in a file name', () => {
    expect(icsFileName(12, 'Étival CA 1')).toBe('club-ping-j12-etival-ca-1.ics')
    expect(icsFileName(1, '?')).toBe('club-ping-j1.ics')
  })
})
