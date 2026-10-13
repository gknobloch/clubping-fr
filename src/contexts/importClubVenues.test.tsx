import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Club, DataState } from '@/types'
import { DataProvider, useAppData } from '@/contexts/DataContext'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ token: null, logout: vi.fn() }),
}))

// #613 — a club an import creates is created bare; the import then reads its
// hall from FFTT on its own, without the summary waiting on it.

const empty: DataState = {
  divisions: [], competitions: [], competitionGroups: [], competitionEligibilities: [], federations: [],
  clubs: [], seasons: [], phases: [], groups: [], teams: [], players: [],
  playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
  trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [],
  matchDays: [], games: [], gameAvailabilities: [], gameSelections: [], users: [],
}

const opponent: Club = {
  id: 'club-fftt-06880001', affiliationNumber: '06880001', displayName: 'Epinal',
  isArchived: false, addresses: [], channels: [],
}

const importResult = {
  createdPhases: [], createdDivisions: [], createdGroups: [], createdClubs: [opponent], createdTeams: [],
  groups: [], createdMatchDays: [], updatedMatchDays: [], createdGames: [],
  skippedSchedules: [], existingGames: 0, skippedMatches: 0, skippedMatchDetails: [],
}

function Probe() {
  const { clubs, importScheduleDocuments } = useAppData()
  const epinal = clubs.find((c) => c.id === opponent.id)
  return (
    <>
      <button type="button" onClick={() => void importScheduleDocuments([])}>import</button>
      <p data-testid="venue">{epinal ? (epinal.addresses[0]?.city ?? 'sans adresse') : 'absent'}</p>
    </>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('an import fills the halls of the clubs it creates (#613)', () => {
  it('reads FFTT for each new club and writes its hall', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/schedule-documents/import') return Response.json(importResult)
      if (url.includes('xml_club_detail') && url.endsWith('06880001')) {
        return new Response(
          '<liste><club><numero>06880001</numero><nom>EPINAL</nom><nomsalle>Gymnase</nomsalle>' +
          '<adressesalle1>3 rue du Stade</adressesalle1><codepsalle>88000</codepsalle><villesalle>EPINAL</villesalle></club></liste>',
        )
      }
      if (url === `/api/clubs/${opponent.id}/fftt-venue`) {
        return Response.json({ address: { id: 'addr-fftt', ...JSON.parse(init!.body as string), isDefault: true } })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<DataProvider initialData={empty}><Probe /></DataProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => expect(screen.getByTestId('venue')).toHaveTextContent('Epinal'))
  })

  it('keeps the club, bare, when FFTT does not answer', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/schedule-documents/import') return Response.json(importResult)
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<DataProvider initialData={empty}><Probe /></DataProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('xml_club_detail'))).toBe(true))
    expect(screen.getByTestId('venue')).toHaveTextContent('sans adresse')
    // Nothing was written for a hall nobody read.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('fftt-venue'))).toBe(false)
  })
})
