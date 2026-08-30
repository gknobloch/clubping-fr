import { describe, it, expect, vi } from 'vitest'
import {
  activeMatchDayNumber,
  deriveMatchDayDate,
  gameDate,
  gameSchedule,
  gameTime,
  getPhaseMatchDays,
  formatMatchDayRange,
  isSlotConfirmed,
  isoWeekRange,
  playersCommittedElsewhere,
  upcomingMatchDays,
} from './matchdays'
import type { Team, Game, MatchDay, GameSelection, Division, Group } from '../types'

const team = (id: string, number: number): Team => ({
  id, clubId: 'club-1', phaseId: 'phase-1', number, divisionId: 'div-1', groupId: 'group-1',
  gameLocationId: '', defaultDay: '', defaultTime: '', captainId: '', playerIds: [], isArchived: false,
})

describe('playersCommittedElsewhere', () => {
  const clubTeams = [team('team-1', 1), team('team-2', 2)]
  const matchDays: MatchDay[] = [{ id: 'md-1', groupId: 'group-1', number: 1, date: '2026-01-01' }]
  const games: Game[] = [
    { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'opp-1' },
    { id: 'g2', matchDayId: 'md-1', homeTeamId: 'team-2', awayTeamId: 'opp-2' },
  ]

  it('maps a player selected for another club team on the same round to that team number', () => {
    const selections: GameSelection[] = [
      { gameId: 'g1', teamId: 'team-1', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.get('p1')).toBe(1)
  })

  it('ignores selections for the current team itself', () => {
    const selections: GameSelection[] = [
      { gameId: 'g2', teamId: 'team-2', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere('team-2', 1, clubTeams, games, matchDays, selections)
    expect(committed.has('p1')).toBe(false)
  })

  it('ignores selections from a different round', () => {
    const otherRoundMd: MatchDay = { id: 'md-2', groupId: 'group-1', number: 2, date: '2026-01-08' }
    const otherRoundGame: Game = { id: 'g3', matchDayId: 'md-2', homeTeamId: 'team-1', awayTeamId: 'opp-1' }
    const selections: GameSelection[] = [
      { gameId: 'g3', teamId: 'team-1', playerIds: ['p1'] },
    ]
    const committed = playersCommittedElsewhere(
      'team-2', 1, clubTeams, [...games, otherRoundGame], [...matchDays, otherRoundMd], selections,
    )
    expect(committed.has('p1')).toBe(false)
  })
})

// Games own their date (#271); match_days.date is derived from them client-side
// the same way the server recomputes it — see matchDayDateRecomputeStmt.
describe('deriveMatchDayDate', () => {
  const g = (id: string, matchDayId: string, date?: string): Game =>
    ({ id, matchDayId, homeTeamId: 'team-1', awayTeamId: 'team-2', date })

  it('returns the earliest date among the match day\'s dated games', () => {
    const games = [g('g1', 'md-1', '2026-09-20'), g('g2', 'md-1', '2026-09-19'), g('g3', 'md-1', '2026-09-21')]
    expect(deriveMatchDayDate(games, '2026-09-01')).toBe('2026-09-19')
  })

  it('falls back to the current date when no game has one yet (empty shell)', () => {
    expect(deriveMatchDayDate([], '2026-09-01')).toBe('2026-09-01')
    expect(deriveMatchDayDate([g('g1', 'md-1')], '2026-09-01')).toBe('2026-09-01')
  })

  it('ignores undated games alongside dated ones', () => {
    const games = [g('g1', 'md-1'), g('g2', 'md-1', '2026-09-19')]
    expect(deriveMatchDayDate(games, '2026-09-01')).toBe('2026-09-19')
  })

  it('returns a single game\'s own date', () => {
    expect(deriveMatchDayDate([g('g1', 'md-1', '2026-09-19')], '2026-09-01')).toBe('2026-09-19')
  })
})

describe('gameDate', () => {
  const md: MatchDay = { id: 'md-1', groupId: 'group-1', number: 1, date: '2026-09-01' }

  it('prefers the game\'s own date', () => {
    const game: Game = { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'team-2', date: '2026-09-20' }
    expect(gameDate(game, md)).toBe('2026-09-20')
  })

  it('falls back to the match day\'s (derived) date when the game has none', () => {
    const game: Game = { id: 'g1', matchDayId: 'md-1', homeTeamId: 'team-1', awayTeamId: 'team-2' }
    expect(gameDate(game, md)).toBe('2026-09-01')
  })
})

describe('isoWeekRange', () => {
  it('gives Monday to Sunday of the week containing the date', () => {
    // dim. 8 nov. 2026 -> lun. 2 nov. – dim. 8 nov.
    expect(isoWeekRange('2026-11-08')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(isoWeekRange('2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(isoWeekRange('2026-11-05')).toEqual({ start: '2026-11-02', end: '2026-11-08' })
  })

  it('crosses a month and a year boundary', () => {
    expect(isoWeekRange('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
  })

  it('returns null for a malformed date', () => {
    expect(isoWeekRange('')).toBeNull()
    expect(isoWeekRange('08/11/2026')).toBeNull()
  })
})

describe('gameSchedule', () => {
  const md = { date: '2026-11-08' }
  const known = { defaultDay: 'Jeudi', defaultTime: '19h30' }
  const unknown = { defaultDay: '', defaultTime: '' }

  it('shows the real slot for a home fixture on a known playing day', () => {
    expect(gameSchedule({ date: '2026-11-05', time: undefined }, md, known))
      .toEqual({ date: '2026-11-05', time: '19h30', week: null })
  })

  it('falls back to the journée date for a game that has none of its own', () => {
    // Manually created fixtures carry no date; they must not be treated as
    // unconfirmed just for that.
    expect(gameSchedule({ date: undefined, time: undefined }, md, known))
      .toEqual({ date: '2026-11-08', time: '19h30', week: null })
    expect(gameSchedule(undefined, md, known))
      .toEqual({ date: '2026-11-08', time: '19h30', week: null })
  })

  it('falls back to the journée week when the home club’s day is unknown', () => {
    // The reported case: an away game at an auto-created opponent.
    expect(gameSchedule({ date: '2026-11-08', time: undefined }, md, unknown))
      .toEqual({ date: null, time: '', week: { start: '2026-11-02', end: '2026-11-08' } })
  })

  it('never borrows a time when the slot is unknown', () => {
    const s = gameSchedule({ date: '2026-11-08', time: undefined }, md, undefined)
    expect(s.time).toBe('')
    expect(s.date).toBeNull()
  })

  it('an explicit game time pins the slot, whatever the teams say', () => {
    expect(gameSchedule({ date: '2026-11-07', time: '14h00' }, md, unknown))
      .toEqual({ date: '2026-11-07', time: '14h00', week: null })
  })

  it('uses the HOME team’s default time, not the viewer’s', () => {
    expect(gameSchedule({ date: '2026-11-06', time: undefined }, md, { defaultDay: 'Vendredi', defaultTime: '20h00' }).time)
      .toBe('20h00')
  })
})

describe('isSlotConfirmed', () => {
  const md = { date: '2026-11-08' }
  const known = { defaultDay: 'Jeudi', defaultTime: '19h30' }
  const unknown = { defaultDay: '', defaultTime: '' }

  it('is true once the receiving club has a playing day', () => {
    expect(isSlotConfirmed({ date: '2026-11-05', time: undefined }, md, known)).toBe(true)
  })

  it('is true for a fixture that carries its own time, whoever receives', () => {
    expect(isSlotConfirmed({ date: '2026-11-07', time: '14h00' }, md, unknown)).toBe(true)
  })

  it('is false at a club the import created', () => {
    // The FFTT's nominal week-end date, which no one has confirmed: every
    // screen marks it, and none offers it to a calendar (#429).
    expect(isSlotConfirmed({ date: '2026-11-08', time: undefined }, md, unknown)).toBe(false)
    expect(isSlotConfirmed({ date: '2026-11-08', time: undefined }, md, undefined)).toBe(false)
  })
})

describe('gameTime', () => {
  const md = { date: '2026-11-08' }
  const known = { defaultDay: 'Jeudi', defaultTime: '19h30' }
  const unknown = { defaultDay: '', defaultTime: '' }

  it('is the game’s own time when it has one', () => {
    expect(gameTime({ date: '2026-11-07', time: '14h00' }, md, known)).toBe('14h00')
  })

  it('falls back to the receiving club’s default', () => {
    expect(gameTime({ date: '2026-11-05', time: undefined }, md, known)).toBe('19h30')
  })

  it('is empty when the receiving club’s playing day is unknown', () => {
    // Away at a club the import created: no screen in either app may print an
    // hour here, and #427 is what stops them disagreeing about it.
    expect(gameTime({ date: '2026-11-08', time: undefined }, md, unknown)).toBe('')
    expect(gameTime({ date: '2026-11-08', time: undefined }, md, undefined)).toBe('')
  })
})

// #306 — these three moved here from mobile/utils so the web card list and the
// native Journées screen agree on what "Journée N" is. Round numbers repeat
// across divisions, so grouping by number is the whole point.
describe('getPhaseMatchDays', () => {
  const divisions = [
    { id: 'div-1', phaseId: 'phase-1' },
    { id: 'div-2', phaseId: 'phase-1' },
    { id: 'div-9', phaseId: 'phase-2' },
  ] as unknown as Division[]
  const groups = [
    { id: 'grp-1', divisionId: 'div-1' },
    { id: 'grp-2', divisionId: 'div-2' },
    { id: 'grp-9', divisionId: 'div-9' },
  ] as unknown as Group[]

  const mds: MatchDay[] = [
    { id: 'a1', groupId: 'grp-1', number: 1, date: '2026-01-10' },
    { id: 'b1', groupId: 'grp-2', number: 1, date: '2026-01-11' },
    { id: 'a2', groupId: 'grp-1', number: 2, date: '2026-01-17' },
    { id: 'z1', groupId: 'grp-9', number: 1, date: '2026-03-01' },
  ]

  it('groups a round across divisions and spans its dates', () => {
    const groupsOut = getPhaseMatchDays('phase-1', mds, groups, divisions)
    expect(groupsOut.map((g) => g.number)).toEqual([1, 2])
    expect(groupsOut[0].matchDays.map((m) => m.id).sort()).toEqual(['a1', 'b1'])
    // The round spans both divisions' dates, so a Sat/Sun round reads as one.
    expect(groupsOut[0].startDate).toBe('2026-01-10')
    expect(groupsOut[0].endDate).toBe('2026-01-11')
  })

  it('ignores match-days from another phase', () => {
    const ids = getPhaseMatchDays('phase-1', mds, groups, divisions).flatMap((g) =>
      g.matchDays.map((m) => m.id)
    )
    expect(ids).not.toContain('z1')
  })

  it('returns nothing for a phase with no match-days', () => {
    expect(getPhaseMatchDays('phase-3', mds, groups, divisions)).toEqual([])
  })

  // #450 — the header used to span every poule of the phase, at the poule's
  // own date. Both are a step away from the cards the screen lists.
  describe('scoped to a club', () => {
    const scopedMds: MatchDay[] = [
      // The club's poule, and a poule it has no team in whose round 1 is
      // months off — a mis-imported date, but one the club can do nothing
      // about and should never see.
      { id: 'a1', groupId: 'grp-1', number: 1, date: '2026-01-10' },
      { id: 'b1', groupId: 'grp-2', number: 1, date: '2026-05-18' },
      { id: 'a2', groupId: 'grp-1', number: 2, date: '2026-01-17' },
    ]
    const scopedGames: Game[] = [
      { id: 'g1', matchDayId: 'a1', homeTeamId: 'team-1', awayTeamId: 'opp-1' },
      { id: 'g2', matchDayId: 'b1', homeTeamId: 'opp-2', awayTeamId: 'opp-3' },
      { id: 'g3', matchDayId: 'a2', homeTeamId: 'opp-1', awayTeamId: 'team-1' },
    ]
    const scope = { games: scopedGames, teamIds: ['team-1'] }

    it('spans only the rounds the club actually plays', () => {
      const out = getPhaseMatchDays('phase-1', scopedMds, groups, divisions, scope)
      expect(out[0].startDate).toBe('2026-01-10')
      expect(out[0].endDate).toBe('2026-01-10')
      // The other poule's match-day still belongs to the round: the cards are
      // filtered by team, not by which poules the round is drawn from.
      expect(out[0].matchDays.map((m) => m.id).sort()).toEqual(['a1', 'b1'])
    })

    it('reads each game\u2019s own date, not its poule\u2019s', () => {
      const postponed: Game[] = [{ ...scopedGames[0], date: '2026-01-13' }, ...scopedGames.slice(1)]
      const out = getPhaseMatchDays('phase-1', scopedMds, groups, divisions, {
        ...scope,
        games: postponed,
      })
      expect(out[0].startDate).toBe('2026-01-13')
      expect(out[0].endDate).toBe('2026-01-13')
    })

    it('falls back to the poules\u2019 dates for a round the club sits out', () => {
      const out = getPhaseMatchDays('phase-1', scopedMds, groups, divisions, {
        games: [scopedGames[1]],
        teamIds: ['team-1'],
      })
      expect(out[0].startDate).toBe('2026-01-10')
      expect(out[0].endDate).toBe('2026-05-18')
    })
  })
})

describe('formatMatchDayRange', () => {
  it('names the month once for a single date', () => {
    expect(formatMatchDayRange('2026-10-17', '2026-10-17')).toBe('sam. 17 oct.')
  })

  it('drops the month from the start within one month', () => {
    expect(formatMatchDayRange('2026-10-15', '2026-10-17')).toBe('jeu. 15 – sam. 17 oct.')
  })

  it('keeps the month on both ends across two months (#450)', () => {
    // "mar. 13 – sam. 18 mai" reads as 13 to 18 May.
    expect(formatMatchDayRange('2026-10-13', '2027-05-18')).toBe('mar. 13 oct. – mar. 18 mai')
  })
})

describe('activeMatchDayNumber', () => {
  const group = (number: number, endDate: string) => ({
    number, matchDays: [], startDate: endDate, endDate,
  })

  it('is null with nothing scheduled', () => {
    expect(activeMatchDayNumber([])).toBeNull()
  })

  it('keeps a finished Saturday round active through the Sunday after it', () => {
    vi.useFakeTimers()
    try {
      // Round ended Sat 10 Jan 2026; we are on Sun 11 Jan, still the same week.
      vi.setSystemTime(new Date('2026-01-11T09:00:00Z'))
      expect(activeMatchDayNumber([group(1, '2026-01-10'), group(2, '2026-01-17')])).toBe(1)
      // Monday 12 Jan: round 1's week is over, so round 2 takes over.
      vi.setSystemTime(new Date('2026-01-12T09:00:00Z'))
      expect(activeMatchDayNumber([group(1, '2026-01-10'), group(2, '2026-01-17')])).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the last round once every one is past', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-01T09:00:00Z'))
      expect(activeMatchDayNumber([group(1, '2026-01-10'), group(2, '2026-01-17')])).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

// #474 — a newly onboarded club admin, whose club has no team at all, was shown
// three journées and twelve matches on the home screen: the list took every
// journée in the database and counted every game in it.
describe('upcomingMatchDays (#474)', () => {
  const md = (id: string, date: string, number = 1) => ({ id, date, number })
  const game = (matchDayId: string, homeTeamId: string, awayTeamId: string) => ({
    matchDayId, homeTeamId, awayTeamId,
  })
  const teams = [
    { id: 't-mine', clubId: 'club-mine' },
    { id: 't-other', clubId: 'club-other' },
    { id: 't-third', clubId: 'club-third' },
  ]
  const matchDays = [md('j1', '2026-09-14'), md('j2', '2026-09-16'), md('j3', '2026-09-19')]
  const games = [
    game('j1', 't-other', 't-third'),
    game('j1', 't-third', 't-other'),
    game('j2', 't-mine', 't-other'),
    game('j3', 't-other', 't-third'),
  ]
  const today = '2026-09-01'

  it('shows a club only the journées it actually plays in', () => {
    const rows = upcomingMatchDays(matchDays, games, teams, { scope: { clubId: 'club-mine' }, today })
    expect(rows.map((r) => r.matchDay.id)).toEqual(['j2'])
    expect(rows[0].games).toBe(1)
  })

  // The case that was reported: a club with nothing in it yet.
  it('shows a club with no team nothing at all', () => {
    expect(upcomingMatchDays(matchDays, games, teams, { scope: { clubId: 'club-empty' }, today })).toEqual([])
  })

  it('counts only the club’s own matches, not the whole journée', () => {
    const busy = [...games, game('j2', 't-other', 't-third')]
    const rows = upcomingMatchDays(matchDays, busy, teams, { scope: { clubId: 'club-mine' }, today })
    expect(rows[0].games).toBe(1)
  })

  it('counts a match whether the club is at home or away', () => {
    const away = [game('j1', 't-other', 't-mine')]
    const rows = upcomingMatchDays(matchDays, away, teams, { scope: { clubId: 'club-mine' }, today })
    expect(rows.map((r) => r.matchDay.id)).toEqual(['j1'])
  })

  // A general admin oversees everything, so their view is unscoped — including
  // a journée with no games recorded against it yet.
  it('leaves the general admin’s view whole', () => {
    const rows = upcomingMatchDays(matchDays, games, teams, { scope: 'all', today })
    expect(rows.map((r) => r.matchDay.id)).toEqual(['j1', 'j2', 'j3'])
    expect(rows[0].games).toBe(2)
  })

  it('drops what is past and keeps the soonest three', () => {
    const many = [
      md('old', '2026-08-01'), md('a', '2026-09-14'), md('b', '2026-09-16'),
      md('c', '2026-09-19'), md('d', '2026-09-26'),
    ]
    const rows = upcomingMatchDays(many, [], teams, { scope: 'all', today })
    expect(rows.map((r) => r.matchDay.id)).toEqual(['a', 'b', 'c'])
  })

  // Inferring the scope from a club id is what broke this once: a general
  // admin carrying a junk `club_id` was scoped to a club that does not exist,
  // and lost the whole list.
  it('gives a club that does not exist nothing, rather than everything', () => {
    expect(upcomingMatchDays(matchDays, games, teams, { scope: { clubId: 'NULL' }, today })).toEqual([])
    expect(upcomingMatchDays(matchDays, games, teams, { scope: { clubId: '' }, today })).toEqual([])
  })

  it('keeps today itself, which has not happened yet', () => {
    const rows = upcomingMatchDays([md('now', today)], [], teams, { scope: 'all', today })
    expect(rows).toHaveLength(1)
  })
})
