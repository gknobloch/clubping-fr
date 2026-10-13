import { describe, expect, it } from 'vitest'
import { clubNameFromFederation, isShouting } from './ffttNames'

// #704 — the clubs an import creates are named for people, as the FFTT club
// import names them.

describe('clubNameFromFederation', () => {
  it('spells a name printed in capitals for people', () => {
    expect(clubNameFromFederation('INGERSHEIM ST ALOYSE')).toBe('Ingersheim St Aloyse')
    expect(clubNameFromFederation('MUNTZENHEIM TENNIS DE TABLE')).toBe('Muntzenheim Tennis de Table')
    expect(clubNameFromFederation(' LUTTERBACH SG ')).toBe('Lutterbach SG')
  })

  it('keeps a name somebody wrote', () => {
    expect(clubNameFromFederation('ASL Landser')).toBe('ASL Landser')
    expect(clubNameFromFederation('Illzach Saint Jean-Baptiste')).toBe('Illzach Saint Jean-Baptiste')
  })

  it('tells a name in capitals from one with no letters at all', () => {
    expect(isShouting('RIEDISHEIM')).toBe(true)
    expect(isShouting('Riedisheim')).toBe(false)
    expect(isShouting('06680140')).toBe(false)
  })
})
