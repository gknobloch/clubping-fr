import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Club, Federation } from '@/types'
import { ClubAffiliations } from './ClubAffiliations'

// #643 — a club's other federations, on its own page. The write rules live in
// the API's suite (functions/api/federations.test.ts); here, the screen.

const FFTT: Federation = { id: 'fftt', displayName: 'Fédération française de tennis de table', shortName: 'FFTT', isImported: true, sortOrder: 0 }
const AGR: Federation = { id: 'agr', displayName: 'AGR Tennis de table — Section du Haut-Rhin', shortName: 'AGR', isImported: false, sortOrder: 1 }

const data = vi.hoisted(() => ({
  federations: [] as Federation[],
  setClubAffiliation: vi.fn(),
  removeClubAffiliation: vi.fn(),
}))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

const kembs = (over: Partial<Club> = {}): Club => ({
  id: 'club-fftt-06680140', affiliationNumber: '06680140', displayName: 'Kembs',
  isArchived: false, addresses: [], channels: [], ...over,
})

beforeEach(() => {
  data.federations = [FFTT, AGR]
  data.setClubAffiliation.mockReset()
  data.removeClubAffiliation.mockReset()
})

describe('ClubAffiliations', () => {
  it('says nothing while the FFTT is the only federation', () => {
    data.federations = [FFTT]
    const { container } = render(<ClubAffiliations club={kembs()} canEdit idPrefix="t" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the club\'s other federations with the name each prints', () => {
    render(<ClubAffiliations
      club={kembs({ affiliations: [{ federationId: 'agr', affiliationNumber: '680021', name: 'KEMBS ASL TT' }] })}
      canEdit={false}
      idPrefix="t"
    />)
    expect(screen.getByText('AGR')).toBeInTheDocument()
    expect(screen.getByText('680021')).toBeInTheDocument()
    expect(screen.getByText('KEMBS ASL TT')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter une fédération' })).not.toBeInTheDocument()
  })

  it('adds an affiliation, the name left blank when it is the club\'s own', async () => {
    const user = userEvent.setup()
    render(<ClubAffiliations club={kembs()} canEdit idPrefix="t" />)
    expect(screen.getByText('Aucune.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ajouter une fédération' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(AGR.displayName)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('N° affiliation'), ' 680021 ')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(data.setClubAffiliation).toHaveBeenCalledWith('club-fftt-06680140', {
      federationId: 'agr', affiliationNumber: '680021',
    })
  })

  it('offers no second affiliation to a federation the club is already in', () => {
    render(<ClubAffiliations
      club={kembs({ affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }] })}
      canEdit
      idPrefix="t"
    />)
    expect(screen.queryByRole('button', { name: 'Ajouter une fédération' })).not.toBeInTheDocument()
  })
})
