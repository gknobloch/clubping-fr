import { describe, it, expect } from 'vitest'
import { townFromClubName } from './clubTown'

describe('townFromClubName (#611)', () => {
  it.each([
    // The town, then what the club calls itself — FFTT's usual order.
    ['RIXHEIM PPA', 'Rixheim'],
    ['STRASBOURG EMTT', 'Strasbourg'],
    ['KEMBS TT', 'Kembs'],
    ['SPICHEREN C.S.N', 'Spicheren'],
    ['COLMAR C.C.C. T.T.', 'Colmar'],
    ['MULHOUSE TENNIS DE TABLE', 'Mulhouse'],
    ['THANN TENNIS DE TABLE CLUB', 'Thann'],
    ["VAL D'OZON TENNIS DE TABLE", "Val d'Ozon"],
    // The other way round.
    ['CSS BERGHEIM', 'Bergheim'],
    ['TENNIS DE TABLE DE WITTENHEIM', 'Wittenheim'],
    ['ASPTT MULHOUSE', 'Mulhouse'],
    // Names already spelled for people, as the app stores them.
    ['PPA Rixheim', 'Rixheim'],
    ['Colmar MJC', 'Colmar'],
    ['Etival', 'Etival'],
    // Towns with a joint, and a short word of their own left in capitals.
    ['SAINT-LOUIS', 'Saint-Louis'],
    ['WILLER SUR THUR', 'Willer sur Thur'],
    ['NORT SUR ERDRE N.A.C.T.T.', 'Nort sur Erdre'],
    ['VILLENEUVE EN RETZ   TT', 'Villeneuve en Retz'],
    ['SOULTZ SOUS FORETS', 'Soultz sous Forets'],
    ['STRASBOURG ST JEAN', 'Strasbourg St Jean'],
    ['BERNERIE (LA)', 'Bernerie (La)'],
    // A team number is not part of anywhere.
    ['PARIS 13 TENNIS DE TABLE', 'Paris'],
  ])('%s → %s', (name, town) => {
    expect(townFromClubName(name)).toBe(town)
  })

  it('gives nothing when the name holds no town', () => {
    expect(townFromClubName('TT')).toBeUndefined()
    expect(townFromClubName('A.S.C. TENNIS DE TABLE')).toBeUndefined()
    expect(townFromClubName('')).toBeUndefined()
  })
})
