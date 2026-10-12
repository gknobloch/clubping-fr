import { describe, expect, it } from 'vitest'
import { divisionIdsOfOrganization, filtersLocally, localOrganizationOptions } from './organizationFilter'
import type { Organization } from '@/types'

// #692 — the Organisation filter from our own data.

const orgs: Organization[] = [
  { id: '12', type: 'League', identifier: 'L06', name: 'Grand Est', federationId: 'fftt' },
  { id: '68', type: 'Committee', identifier: 'D68', name: 'Haut-Rhin', federationId: 'fftt' },
  { id: 'agr-68', type: 'Committee', identifier: '68', name: 'Haut-Rhin', federationId: 'agr' },
  { id: 'agr-67', type: 'Committee', identifier: '67', name: 'Bas-Rhin', federationId: 'agr' },
]

describe('filtersLocally', () => {
  it('always for the AGR; for the FFTT once every division knows its organisation', () => {
    expect(filtersLocally([], 'agr')).toBe(true)
    expect(filtersLocally([{ organizationId: '12' }, {}], 'fftt')).toBe(false)
    expect(filtersLocally([{ organizationId: '12' }, { organizationId: '68' }], 'fftt')).toBe(true)
    expect(filtersLocally([], 'fftt')).toBe(false)
  })
})

describe('localOrganizationOptions', () => {
  it('offers the AGR both of its committees, and the FFTT those its divisions name', () => {
    expect(localOrganizationOptions(orgs, [], 'agr').map((o) => o.name)).toEqual(['Bas-Rhin', 'Haut-Rhin'])
    expect(localOrganizationOptions(orgs, [{ organizationId: '12' }], 'fftt').map((o) => o.id)).toEqual(['12'])
  })

  it('picks a phase’s divisions by organisation', () => {
    const divisions = [{ id: 'exc', organizationId: 'agr-68' }, { id: 'bas', organizationId: 'agr-67' }, { id: 'x' }]
    expect([...divisionIdsOfOrganization(divisions, 'agr-68')]).toEqual(['exc'])
  })
})
