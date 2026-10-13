import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import type { Club } from '@/types'
import { mockFederations } from '@/mock/data'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

const { ClubsPage } = await import('./ClubsPage')

// #613 — the clubs the imports created bare, filled from FFTT by hand.

const club = (id: string, affiliationNumber: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber, displayName: id, isArchived: false, addresses: [], channels: [], ...over,
})

const clubs = [
  club('club-home', '06680011', {
    addresses: [{ id: 'a1', label: 'Gymnase', street: '1 rue', postalCode: '68170', city: 'Rixheim', isDefault: true }],
  }),
  club('club-epinal', '06880001'),
  club('club-nowhere', '06880002'),
]

const detail = (numero: string, ville: string) =>
  `<liste><club><numero>${numero}</numero><nom>CLUB</nom><nomsalle>Gymnase Jean Moulin</nomsalle>` +
  `<adressesalle1>3 rue du Stade</adressesalle1><codepsalle>88000</codepsalle><villesalle>${ville}</villesalle></club></liste>`

function renderPage(url = '/clubs') {
  const data = {
    divisions: [], clubs, seasons: [], phases: [], competitions: [], competitionGroups: [], competitionEligibilities: [], federations: mockFederations,
    groups: [], teams: [], players: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: [],
  }
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DataProvider initialData={data}>
        <ClubsPage />
      </DataProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ClubsPage — completing addresses from FFTT (#613)', () => {
  it('says how many clubs have no address', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('2 clubs n\'ont aucune adresse')
    expect(screen.getByRole('button', { name: 'Importer depuis la FFTT' })).toBeInTheDocument()
  })

  it('offers neither the FFTT import nor its halls while another federation is listed', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderPage('/clubs?federation=agr')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer depuis la FFTT' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un club' })).toBeInTheDocument()
  })

  it('writes the hall FFTT gives, and says what it could not do', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('xml_club_detail')) {
        // FFTT knows Épinal's hall and nothing of the other club.
        return new Response(url.endsWith('06880001') ? detail('06880001', 'EPINAL') : '<liste></liste>')
      }
      if (url === '/api/clubs/club-epinal/fftt-venue') {
        const venue = JSON.parse(init!.body as string)
        return Response.json({ address: { id: 'addr-fftt-club-epinal', ...venue, isDefault: true } })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Compléter depuis la FFTT' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 adresse ajoutée · 1 club sans salle à la FFTT'),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/clubs/club-epinal/fftt-venue', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ label: 'Gymnase Jean Moulin', street: '3 rue du Stade', postalCode: '88000', city: 'Epinal' }),
    }))
    // The club that already had its address was never asked about.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('06680011'))).toBe(false)
    // Épinal's row now lists its hall.
    expect(screen.getByText('Gymnase Jean Moulin')).toBeInTheDocument()
  })
})
