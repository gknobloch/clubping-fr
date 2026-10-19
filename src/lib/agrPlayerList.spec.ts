import { describe, expect, it } from 'vitest'
import { isAgrPlayerList, parseAgrPlayerListLines, type AgrPlayerList } from './agrPlayerList'
import { AGR_PLAYER_LIST } from './__fixtures__/agrPlayerList'

// #648 — an AGR club's licensees, read off its PDF.

const parse = (lines: string[]) => parseAgrPlayerListLines(lines) as AgrPlayerList

describe('parseAgrPlayerListLines', () => {
  it('reads the club and its affiliation number', () => {
    expect(parse(AGR_PLAYER_LIST)).toMatchObject({ clubName: 'LANDSER ASL', affiliationNumber: '680036', unread: [] })
  })

  it('reads each licensee as a licence record: number, names, the classement as points', () => {
    const { licences } = parse(AGR_PLAYER_LIST)
    expect(licences).toHaveLength(6)
    expect(licences[1]).toEqual({
      licence: '1525800', lastName: 'Bühler', firstName: 'Christian',
      clubNumber: '680036', clubName: 'LANDSER ASL', points: '30', category: '',
    })
  })

  it('keeps a family name of several words, and a first name of two', () => {
    expect(parse(AGR_PLAYER_LIST).licences[4]).toMatchObject({ lastName: 'De la Fontaine', firstName: 'Jean Pierre' })
  })

  it('reads « NC » and a women’s classement, kept as printed (#765)', () => {
    const lines = [...AGR_PLAYER_LIST]
    lines.splice(3, 0, '1525697 CUCUAT Lucas NC', '1487657 DA COSTA OLIVEIRA Juliette 80-D')
    const { licences, unread } = parse(lines)
    expect(unread).toEqual([])
    expect(licences.slice(0, 2)).toMatchObject([
      { licence: '1525697', lastName: 'Cucuat', firstName: 'Lucas', points: 'NC' },
      { licence: '1487657', lastName: 'Da Costa Oliveira', firstName: 'Juliette', points: '80-D' },
    ])
  })

  it('shows a line it cannot read rather than dropping it', () => {
    const lines = [...AGR_PLAYER_LIST]
    lines[3] = '351100 Bernard Nicolas 70'
    expect(parse(lines).unread).toEqual(['351100 Bernard Nicolas 70'])
  })

  it('refuses what is not an AGR list', () => {
    expect(isAgrPlayerList(AGR_PLAYER_LIST)).toBe(true)
    expect(isAgrPlayerList(['Championnat MESSIEURS'])).toBe(false)
    expect(parseAgrPlayerListLines(['Bonjour'])).toEqual({ error: expect.any(String) })
  })
})
