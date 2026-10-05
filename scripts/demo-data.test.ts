import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain ESM script, no type declarations by design
import {
  shiftDate,
  nextSaturday,
  journeeDates,
  isDemoId,
  assertDemoOnly,
  DEMO_USER,
  DEMO_AVAILABILITY,
  DEMO_PROFILE,
  DEMO_IDENTITY,
  DEMO_LAST_SEEN,
  KICK_OFF,
  KICK_OFF_DAY,
  DEMO_LINEUP,
  DEMO_PLAYED_LINEUP,
  PLAYED_JOURNEE,
  UPCOMING_JOURNEE,
  JOURNEES,
  DEMO_POULES,
  demoFixtures,
  PHASE_AVAILABILITY,
  LENT,
  DEMO_ADDRESSES,
  DEMO_TRAININGS,
  guidedDates,
  CANCELLED_SESSION,
  GUIDED_ANSWERS,
  GUIDED_SESSIONS,
  localToday,
} from './demo-data.mjs'
import { normalizeCategory } from '../src/lib/playerCategories'

// ---------------------------------------------------------------------------
// The demo club's calendar (#520)
//
// The dates are not the subject — the OFFSETS are. A calendar written with
// fixed dates goes stale by definition, which is how the demo club ended up
// with a journée on 18 May 2030: somebody needed "prochaines journées" to
// stop emptying.
//
// The guard is tested harder than anything else here, because this script
// writes to production and the club next door is real.
// ---------------------------------------------------------------------------

describe('shiftDate', () => {
  it('moves forward and back in whole days', () => {
    expect(shiftDate('2026-09-13', 7)).toBe('2026-09-20')
    expect(shiftDate('2026-09-13', -14)).toBe('2026-08-30')
  })

  it('crosses a month and a DST boundary without losing a day', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
    // Europe/Paris falls back on 25 October 2026.
    expect(shiftDate('2026-10-24', 2)).toBe('2026-10-26')
  })
})

describe('nextSaturday', () => {
  it.each([
    ['2026-09-13', '2026-09-19'], // a Sunday → six days out
    ['2026-09-18', '2026-09-19'], // a Friday → tomorrow
  ])('from %s lands on %s', (today, expected) => {
    expect(nextSaturday(today)).toBe(expected)
    expect(new Date(`${expected}T00:00:00Z`).getUTCDay()).toBe(6)
  })

  it('run on a Saturday, anchors the NEXT one', () => {
    // Otherwise the script would call today's match "still to come", and the
    // Accueil screen would advertise a fixture being played that afternoon.
    expect(nextSaturday('2026-09-19')).toBe('2026-09-26')
  })
})

describe('journeeDates', () => {
  const today = '2026-09-13'
  const dates = journeeDates(today)

  it('puts one journée behind today and the rest of the phase ahead', () => {
    expect(dates[1] < today).toBe(true)
    for (let n = 2; n <= JOURNEES; n++) expect(dates[n] > today).toBe(true)
  })

  it('dates every journée of the phase — the planning reads all of them (#634)', () => {
    expect(Object.keys(dates)).toHaveLength(JOURNEES)
  })

  it('puts journée 2 inside the coming week — the whole point', () => {
    // The Accueil hero card, the availability prompts and the line-up all
    // hang off a match being close.
    const days = (Date.parse(`${dates[2]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
    expect(days).toBeGreaterThan(0)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('leaves a fortnight between journées', () => {
    for (let n = 1; n < JOURNEES; n++) expect(shiftDate(dates[n], 14)).toBe(dates[n + 1])
  })

  it('never produces the same calendar twice from different days', () => {
    expect(journeeDates('2026-09-13')[2]).not.toBe(journeeDates('2026-09-20')[2])
  })
})

describe('the production guard', () => {
  it('accepts the demo club and the review account', () => {
    expect(isDemoId('demo-team-1')).toBe(true)
    expect(isDemoId('demo-md-1-2')).toBe(true)
    expect(isDemoId(DEMO_USER)).toBe(true)
  })

  it('rejects a real club, whose members play actual matches', () => {
    expect(isDemoId('team-06680011-27-1-5')).toBe(false)
    expect(isDemoId('club-fftt-06680011')).toBe(false)
    expect(isDemoId('p2-player-24')).toBe(false)
  })

  it('is not fooled by a name that merely contains "demo"', () => {
    expect(isDemoId('club-demo-fftt-1234')).toBe(false)
    expect(isDemoId('user-demo-someone-else')).toBe(false)
  })

  it('throws, naming what it refused', () => {
    expect(() => assertDemoOnly(['demo-team-1', 'team-06680011-27-1-5'])).toThrow(
      'team-06680011-27-1-5',
    )
  })

  it('passes a set that is entirely the demo club', () => {
    expect(() => assertDemoOnly(['demo-team-1', 'demo-g-1-2', DEMO_USER])).not.toThrow()
  })
})

describe('the squad’s answers for the coming match', () => {
  const statuses = Object.values(DEMO_AVAILABILITY) as string[]
  const count = (s: string) => statuses.filter((v) => v === s).length

  it('shows all three states at once', () => {
    // An empty panel — "0 disponibles · 6 sans réponse" — is what the screen
    // looks like when nobody uses the feature. A spread is the only way the
    // three states, and the count a captain reads, appear at all.
    expect(count('available')).toBe(3)
    expect(count('maybe')).toBe(1)
    expect(count('unavailable')).toBe(1)
  })

  it('leaves somebody silent, which is a state and not a value', () => {
    // "Sans réponse" is the ABSENCE of a row. The squad is six; five answer.
    expect(Object.keys(DEMO_AVAILABILITY)).toHaveLength(5)
  })

  it('has the captain answer for himself', () => {
    // Otherwise "Ma disponibilité" is blank on the first screen anyone sees.
    expect(DEMO_AVAILABILITY[DEMO_USER]).toBe('available')
  })

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(Object.keys(DEMO_AVAILABILITY))).not.toThrow()
  })

  it('uses only statuses the app understands', () => {
    for (const s of statuses) expect(['available', 'maybe', 'unavailable']).toContain(s)
  })
})

describe('what Camille Durand’s fiche shows', () => {
  const entries = Object.entries(
    DEMO_PROFILE as Record<string, { category: string; phone: string }>,
  )

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(entries.map(([id]) => id))).not.toThrow()
  })

  it('uses a category the app can read back', () => {
    // Stored verbatim and normalised on read (#482): a code nothing recognises
    // normalises to undefined, and the fiche prints nothing at all — which is
    // exactly the empty screen this is here to avoid.
    for (const [, { category }] of entries) {
      expect(normalizeCategory(category)).toBe(category)
    }
  })

  it('uses a phone number nobody can answer', () => {
    // ARCEP reserves 07 99 98 xx xx for fiction, the way +1 555-0100 is
    // reserved. This one goes on a public store listing, so "looks invented"
    // is not enough — it has to be unallocated.
    for (const [, { phone }] of entries) {
      expect(phone.replace(/\D/g, '')).toMatch(/^3379998\d{4}$/)
    }
  })
})

describe('the review account’s own line', () => {
  it('carries a classement, like every one of its team-mates', () => {
    // The ten demo players run 905 to 1520; a blank here is the one gap on the
    // Accueil card and at the head of the squad it captains.
    const points = Number(DEMO_IDENTITY.points)
    expect(points).toBeGreaterThan(900)
    expect(points).toBeLessThan(1600)
  })

  it('states it as text, which is what the column holds', () => {
    // FFTT sends a string and nothing here does arithmetic on it; a number
    // would be coerced on the way in and read back differently.
    expect(typeof DEMO_IDENTITY.points).toBe('string')
  })
})

describe('the club looks alive', () => {
  const days = Object.values(DEMO_LAST_SEEN) as number[]

  it('gives every member a visit', () => {
    // The absence of one renders as "Jamais connecté", and eleven of those
    // down the Joueurs list advertise a club that does not use the app.
    expect(Object.keys(DEMO_LAST_SEEN).length).toBeGreaterThanOrEqual(11)
    expect(days.every((d) => Number.isInteger(d) && d >= 0)).toBe(true)
  })

  it('keeps them inside the relative-wording window', () => {
    // Past 28 days src/lib/lastSeen.ts prints a bare date, which reads as a
    // record rather than as activity.
    expect(Math.max(...days)).toBeLessThan(28)
  })

  it('spreads them, rather than stamping one day on everybody', () => {
    expect(new Set(days).size).toBeGreaterThan(3)
    expect(Math.min(...days)).toBe(0)
  })

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(Object.keys(DEMO_LAST_SEEN))).not.toThrow()
  })
})

describe('the declared slot and the fixtures agree', () => {
  it('states the same hour the games carry', () => {
    // The team screen prints the team's DECLARED slot under « Calendrier »;
    // the fixtures under it carry the game's own time. Setting only the games
    // left that card saying 17h00 over a match at 16h00.
    expect(KICK_OFF).toBe('16h00')
    expect(KICK_OFF_DAY).toBe('Samedi')
  })
})

// ---------------------------------------------------------------------------
// The journée already played (#598)
//
// Left undeclared, it drifted: seed-demo.sql puts four players on it and
// production held five, so the journées matrix — one of the eight store
// screenshots — printed « Résumé — Compo 5/4 » in red onto both listings.
// That is the impossible line-up #583 added the row to catch, illustrating
// the feature by failing it.
//
// The size is the defect, so the size is what is pinned. The two names are
// pinned as well, because each carries a screen somewhere else in the set and
// a well-meaning edit would take it away silently.
// ---------------------------------------------------------------------------

describe('the journée already played', () => {
  it('fields exactly what the division asks for — the 5/4 is the bug', () => {
    expect(DEMO_PLAYED_LINEUP).toHaveLength(4)
  })

  it('names nobody twice', () => {
    expect(new Set(DEMO_PLAYED_LINEUP).size).toBe(DEMO_PLAYED_LINEUP.length)
  })

  it('names only demo rows — this writes to production', () => {
    for (const id of DEMO_PLAYED_LINEUP) expect(isDemoId(id)).toBe(true)
  })

  it('keeps Camille Durand, whose brûlage needs both matches', () => {
    // computeBrulage counts two games across the club's teams; her badge is
    // the subject of screenshot 07.
    expect(DEMO_PLAYED_LINEUP).toContain('demo-player-2')
    expect(DEMO_LINEUP).toContain('demo-player-2')
  })

  it('keeps the review account, so his card still reads « 1/1 » and not « 0/1 »', () => {
    expect(DEMO_PLAYED_LINEUP).toContain(DEMO_USER)
  })

  it('is a different journée from the one being composed', () => {
    expect(PLAYED_JOURNEE).not.toBe(UPCOMING_JOURNEE)
  })

  it('sits in the past of the calendar the offsets build', () => {
    const dates = journeeDates('2026-09-20')
    expect(dates[PLAYED_JOURNEE] < dates[UPCOMING_JOURNEE]).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The whole phase (#634)
//
// The planning de la phase reads every journée of one team's phase, so the
// demo phase grew from three journées to a poule's full six — and the
// fixtures are derived here, since a calendar that is only ever updated can
// never grow. The aller has to land exactly on the rows the database already
// held, or the upsert would turn the coming match into somebody else's.
// ---------------------------------------------------------------------------

type Fixture = {
  poule: string; number: number; gameId: string; matchDayId: string
  groupId: string; homeTeamId: string; awayTeamId: string
}

describe('demoFixtures', () => {
  const fixtures = demoFixtures() as Fixture[]

  it('keeps the aller the database already held', () => {
    const g = (id: string) => fixtures.find((f) => f.gameId === id)
    expect(g('demo-g-1-1')).toMatchObject({ homeTeamId: 'demo-team-1', awayTeamId: 'demo-opp-a1' })
    // The coming match is AWAY — which is why the opponents need a hall.
    expect(g('demo-g-1-2')).toMatchObject({ homeTeamId: 'demo-opp-b1', awayTeamId: 'demo-team-1' })
    expect(g('demo-g-1-3')).toMatchObject({ homeTeamId: 'demo-team-1', awayTeamId: 'demo-opp-c1' })
    expect(g('demo-g-2-2')).toMatchObject({ homeTeamId: 'demo-opp-b2', awayTeamId: 'demo-team-2' })
  })

  it('plays each opponent twice, once at each end', () => {
    for (const p of DEMO_POULES as { key: string; teamId: string; opponents: string[] }[]) {
      const own = fixtures.filter((f) => f.poule === p.key)
      expect(own).toHaveLength(JOURNEES)
      for (const opp of p.opponents) {
        expect(own.filter((f) => f.homeTeamId === opp && f.awayTeamId === p.teamId)).toHaveLength(1)
        expect(own.filter((f) => f.homeTeamId === p.teamId && f.awayTeamId === opp)).toHaveLength(1)
      }
    }
  })

  it('files each game under its own journée, and names only demo rows', () => {
    for (const f of fixtures) {
      expect(f.matchDayId).toBe(`demo-md-${f.poule}-${f.number}`)
      expect(() => assertDemoOnly([f.gameId, f.matchDayId, f.groupId, f.homeTeamId, f.awayTeamId])).not.toThrow()
    }
  })
})

describe('the squad’s answers across the phase', () => {
  const answers = PHASE_AVAILABILITY as Record<number, Record<string, string>>
  const later = Object.keys(answers).map(Number).filter((n) => n > UPCOMING_JOURNEE)

  it('covers every journée still to come', () => {
    for (let n = UPCOMING_JOURNEE + 1; n <= JOURNEES; n++) expect(answers[n]).toBeDefined()
  })

  it('thins out the further away a journée is, as a real squad does', () => {
    const counts = later.map((n) => Object.keys(answers[n]).length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
    // …and never empties: a blank column reads as a feature nobody uses.
    expect(Math.min(...counts)).toBeGreaterThan(0)
  })

  it('has the captain answer for every journée of his own phase', () => {
    for (const n of later) expect(answers[n][DEMO_USER]).toBe('available')
  })

  it('leaves no played match with a « sans réponse »', () => {
    const played = new Set([...DEMO_PLAYED_LINEUP, ...Object.keys(answers[PLAYED_JOURNEE] ?? {})])
    // The squad is the six DEMO_AVAILABILITY speaks for, plus the silent one.
    expect(played.size).toBe(Object.keys(DEMO_AVAILABILITY).length + 1)
  })

  it('names only demo rows and statuses the app knows', () => {
    for (const a of Object.values(answers)) {
      expect(() => assertDemoOnly(Object.keys(a))).not.toThrow()
      for (const s of Object.values(a)) expect(['available', 'maybe', 'unavailable']).toContain(s)
    }
  })
})

describe('the player lent to team 2', () => {
  const lent = LENT.lineup[0]

  it('is a full line-up for the division', () => {
    expect(LENT.lineup).toHaveLength(4)
    expect(new Set(LENT.lineup).size).toBe(4)
  })

  it('lends somebody who said yes, so the hatching has a oui under it', () => {
    expect((PHASE_AVAILABILITY as Record<number, Record<string, string>>)[LENT.journee][lent]).toBe('available')
  })

  it('lends somebody team 1 has not fielded — Camille Durand’s brûlage stays hers alone', () => {
    expect(DEMO_LINEUP).not.toContain(lent)
    expect(DEMO_PLAYED_LINEUP).not.toContain(lent)
    expect(LENT.lineup).not.toContain('demo-player-2')
  })

  it('happens on a journée still to come', () => {
    expect(LENT.journee).toBeGreaterThan(UPCOMING_JOURNEE)
  })
})

describe('the halls', () => {
  const addresses = DEMO_ADDRESSES as { id: string; clubId: string; city: string; label: string }[]

  it('gives every club of the demo poules one, the coming away match first', () => {
    const clubs = new Set(addresses.map((a) => a.clubId))
    for (const c of ['demo-club', 'demo-club-adv-a', 'demo-club-adv-b', 'demo-club-adv-c']) {
      expect(clubs.has(c)).toBe(true)
    }
    expect(addresses.filter((a) => a.clubId === 'demo-club-adv-b')).toHaveLength(1)
  })

  it('names a hall, which is what the venue line prints first', () => {
    for (const a of addresses) expect(a.label).not.toBe('Salle')
  })

  it('is in a town that does not exist — a tap opens a map', () => {
    for (const a of addresses) expect(a.city).toBe('Démoville')
  })

  it('names only demo rows', () => {
    expect(() => assertDemoOnly(addresses.flatMap((a) => [a.id, a.clubId]))).not.toThrow()
  })
})

describe('the trainings (#634)', () => {
  const today = '2026-10-05' // a Monday
  const dates = guidedDates(today) as string[]
  type T = { id: string; kind: string; weekday: number | null; managerIds: string[] }
  const trainings = DEMO_TRAININGS as T[]

  it('shows both kinds, which is the point of the list', () => {
    expect(trainings.map((t) => t.kind).sort()).toEqual(['guided', 'regular'])
  })

  it('gives the free slot a day, and the coached series a coach', () => {
    expect(trainings.find((t) => t.kind === 'regular')?.weekday).toBeGreaterThan(0)
    expect(trainings.find((t) => t.kind === 'guided')?.managerIds.length).toBeGreaterThan(0)
  })

  it('dates the coached sessions on Thursdays, strictly after today', () => {
    expect(dates).toHaveLength(GUIDED_SESSIONS)
    for (const d of dates) {
      expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(4)
      expect(d > today).toBe(true)
    }
    // Run on a Thursday, the first session is next week's, not tonight's.
    expect(guidedDates('2026-10-08')[0]).toBe('2026-10-15')
  })

  it('calls one off — not the next one, whose card carries the answers', () => {
    expect(CANCELLED_SESSION.index).toBeGreaterThan(0)
    expect(CANCELLED_SESSION.index).toBeLessThan(GUIDED_SESSIONS)
    expect(CANCELLED_SESSION.note.length).toBeGreaterThan(0)
  })

  it('has the review account answer the next session held', () => {
    expect((GUIDED_ANSWERS as Record<string, string>[])[0][DEMO_USER]).toBe('available')
    expect(GUIDED_ANSWERS.length).toBeLessThan(GUIDED_SESSIONS)
  })

  it('names only demo rows', () => {
    expect(() =>
      assertDemoOnly([
        ...trainings.flatMap((t) => [t.id, ...t.managerIds]),
        ...(GUIDED_ANSWERS as Record<string, string>[]).flatMap((a) => Object.keys(a)),
      ]),
    ).not.toThrow()
  })
})

describe('localToday', () => {
  it('reads the host calendar, not UTC', () => {
    // 00:30 in the host's zone on 5 October: still the 5th here, whatever UTC
    // says — `toISOString()` gave the 4th to every run east of Greenwich
    // between midnight and the offset.
    expect(localToday(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05')
    expect(localToday(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })
})
