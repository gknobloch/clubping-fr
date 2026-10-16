import { describe, it, expect } from 'vitest'
import {
  gameShareMessage, gameSharePath, gameShareUrl, parseGameSharePath, sharedGameOpening, whatsAppShareUrl,
} from './gameShare'
import type { Club, Game, GameSelection, MatchDay, Profile, Team } from '@/types'

const team = (id: string, clubId: string, number: number, extra: Partial<Team> = {}): Team => ({
  id, clubId, number, phaseId: 'p', divisionId: 'd', groupId: 'g', gameLocationId: '',
  defaultDay: 'Samedi', defaultTime: '20h', captainId: '', playerIds: [], isArchived: false,
  ...extra,
})
const profile = (id: string, clubId?: string): Profile => ({ id, role: 'player', clubId })

const game: Game = { id: 'g-1', matchDayId: 'md-5', homeTeamId: 'rix-1', awayTeamId: 'kembs-2' }
const matchDay: MatchDay = { id: 'md-5', groupId: 'g', number: 5, date: '2026-10-17' }
const clubs = [
  { id: 'rix', displayName: 'Rixheim' },
  { id: 'kembs', displayName: 'Kembs' },
] as Club[]

describe('the link', () => {
  it('names the match and the sender’s team', () => {
    expect(gameSharePath({ gameId: 'g-1', teamId: 'rix-1' })).toBe('/match/g-1?equipe=rix-1')
    expect(gameShareUrl({ gameId: 'g-1' })).toBe('https://clubping.fr/match/g-1')
    expect(gameShareUrl({ gameId: 'g 1' }, 'http://localhost:5173/')).toBe('http://localhost:5173/match/g%201')
  })

  it('is read back from a universal link, the app scheme or a bare path', () => {
    const shared = { gameId: 'g-1', teamId: 'rix-1' }
    expect(parseGameSharePath('https://clubping.fr/match/g-1?equipe=rix-1')).toEqual(shared)
    expect(parseGameSharePath('clubping://match/g-1?equipe=rix-1')).toEqual(shared)
    expect(parseGameSharePath('clubping:///match/g-1?equipe=rix-1')).toEqual(shared)
    expect(parseGameSharePath('/match/g-1?utm=x&equipe=rix-1#top')).toEqual(shared)
    expect(parseGameSharePath('match/g%201')).toEqual({ gameId: 'g 1' })
  })

  it('names nothing anywhere else', () => {
    expect(parseGameSharePath('https://clubping.fr/journees/g-1')).toBeNull()
    expect(parseGameSharePath('/match/')).toBeNull()
    expect(parseGameSharePath('/match/a/b')).toBeNull()
    expect(parseGameSharePath('https://clubping.fr/')).toBeNull()
  })
})

describe('the message', () => {
  const teams = [team('rix-1', 'rix', 1), team('kembs-2', 'kembs', 2, { defaultDay: '' })]

  it('says the fixture, home first, then when, then the link', () => {
    expect(gameShareMessage({ game, matchDay, teams, clubs, url: 'https://clubping.fr/match/g-1' })).toBe(
      'Journée 5 · Rixheim 1 – Kembs 2\nSamedi 17 octobre à 20h\nhttps://clubping.fr/match/g-1',
    )
  })

  it('gives the week when the receiving club’s day is unknown', () => {
    const away = { ...game, homeTeamId: 'kembs-2', awayTeamId: 'rix-1' }
    expect(gameShareMessage({ game: away, matchDay, teams, clubs, url: 'u' })).toBe(
      'Journée 5 · Kembs 2 – Rixheim 1\nSemaine du lundi 12 octobre\nu',
    )
  })

  it('goes to WhatsApp encoded', () => {
    expect(whatsAppShareUrl('a b\nc')).toBe('https://wa.me/?text=a%20b%0Ac')
  })
})

describe('whose profile opens a shared match', () => {
  const shared = { gameId: 'g-1', teamId: 'rix-1' }
  const open = (opts: {
    teams: Team[]
    profiles: Profile[]
    current: Profile
    selections?: GameSelection[]
  }) => sharedGameOpening({
    shared, game, teams: opts.teams, gameSelections: opts.selections ?? [],
    profiles: opts.profiles, currentProfile: opts.current,
  })

  it('switches to the profile of the club that plays it — an AGR match opened on the FFTT profile', () => {
    // Gilles: Rixheim (FFTT) and Landser (AGR); the app was left on Rixheim.
    const agr: Game = { id: 'g-1', matchDayId: 'md-5', homeTeamId: 'landser-1', awayTeamId: 'kembs-agr-1' }
    const teams = [team('landser-1', 'landser', 1, { playerIds: ['gilles-landser'] }), team('kembs-agr-1', 'kembs', 1)]
    const rix = profile('gilles-rix', 'rix')
    expect(sharedGameOpening({
      shared, game: agr, teams, gameSelections: [],
      profiles: [rix, profile('gilles-landser', 'landser')], currentProfile: rix,
    })).toEqual({ kind: 'open', profileId: 'gilles-landser', teamId: 'landser-1' })
  })

  it('stays when the current profile is the one in it, on its own side', () => {
    const teams = [team('rix-1', 'rix', 1), team('kembs-2', 'kembs', 2, { playerIds: ['me'] })]
    const me = profile('me', 'kembs')
    expect(open({ teams, profiles: [me], current: me }))
      .toEqual({ kind: 'open', profileId: 'me', teamId: 'kembs-2' })
  })

  it('picks the delegated profile that plays, when the parent does not', () => {
    const teams = [team('rix-1', 'rix', 1, { playerIds: ['sacha'] }), team('kembs-2', 'kembs', 2)]
    const parent = profile('benjamin', 'rix')
    expect(open({ teams, profiles: [parent, profile('sacha', 'rix')], current: parent }))
      .toEqual({ kind: 'open', profileId: 'sacha', teamId: 'rix-1' })
  })

  it('asks when two reached profiles are in the team, the current one first', () => {
    const teams = [team('rix-1', 'rix', 1, { playerIds: ['sacha', 'benjamin'] }), team('kembs-2', 'kembs', 2)]
    const parent = profile('benjamin', 'rix')
    expect(open({ teams, profiles: [profile('sacha', 'rix'), parent], current: parent })).toEqual({
      kind: 'ask',
      candidates: [
        { profileId: 'benjamin', teamId: 'rix-1' },
        { profileId: 'sacha', teamId: 'rix-1' },
      ],
    })
  })

  it('counts a captain and a renfort named in the line-up as in it', () => {
    const teams = [team('rix-1', 'rix', 1, { captainId: 'cap' }), team('kembs-2', 'kembs', 2)]
    const other = profile('other', 'x')
    expect(open({ teams, profiles: [other, profile('cap', 'rix')], current: other }))
      .toEqual({ kind: 'open', profileId: 'cap', teamId: 'rix-1' })
    const selections = [{ gameId: 'g-1', teamId: 'kembs-2', playerIds: ['renfort'] }]
    expect(open({ teams, profiles: [other, profile('renfort', 'kembs')], current: other, selections }))
      .toEqual({ kind: 'open', profileId: 'renfort', teamId: 'kembs-2' })
  })

  it('falls back to a profile of one of the clubs, keeping the current one if it is', () => {
    const teams = [team('rix-1', 'rix', 1), team('kembs-2', 'kembs', 2)]
    const admin = profile('admin', 'kembs')
    expect(open({ teams, profiles: [profile('x', 'rix'), admin], current: admin }))
      .toEqual({ kind: 'open', profileId: 'admin', teamId: 'kembs-2' })
    const general = profile('general')
    expect(open({ teams, profiles: [general, admin], current: general }))
      .toEqual({ kind: 'open', profileId: 'admin', teamId: 'kembs-2' })
  })

  it('opens on the current profile and the sender’s side when nobody reached is in it', () => {
    const teams = [team('rix-1', 'rix', 1), team('kembs-2', 'kembs', 2)]
    const me = profile('me', 'elsewhere')
    expect(sharedGameOpening({
      shared: { gameId: 'g-1', teamId: 'kembs-2' }, game, teams, gameSelections: [],
      profiles: [], currentProfile: me,
    })).toEqual({ kind: 'open', profileId: 'me', teamId: 'kembs-2' })
    expect(sharedGameOpening({
      shared: { gameId: 'g-1' }, game, teams, gameSelections: [], profiles: [], currentProfile: me,
    })).toEqual({ kind: 'open', profileId: 'me', teamId: 'rix-1' })
  })
})
