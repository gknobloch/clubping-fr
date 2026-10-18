import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club, Phase, Player, Season } from '@/types'
import { AGR_PLAYER_LIST } from '@/lib/__fixtures__/agrPlayerList'

// #648 — a club's AGR player list, read off its PDF and passed through the
// import review the FFTT built.

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, token: null }) }))
const extract = vi.hoisted(() => ({ lines: [] as string[] }))
vi.mock('@/lib/pdfScheduleText', () => ({ extractPdfScheduleLines: async () => extract.lines }))

const { ImportFederationPlayersModal } = await import('./ImportFederationPlayersModal')

const landser: Club = {
  id: 'landser', affiliationNumber: '', displayName: 'Landser ASL', isArchived: false, addresses: [], channels: [],
  affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }],
}
const seasons: Season[] = [{ id: '27', displayName: '2026/2027', status: 'active' }]
const phases: Phase[] = [{ id: 'phase-agr-27-1', seasonId: '27', name: 'Phase 1', displayName: '2026/2027 Phase 1', status: 'active', federationId: 'agr' }]
const lucas: Player = {
  id: 'lucas', firstName: 'Lucas', lastName: 'Martin', licenseNumber: '', phone: '', status: 'active', clubId: 'landser',
  licences: [{ federationId: 'agr', number: '1251100' }],
}

function open(lines: string[]) {
  extract.lines = lines
  render(
    <DataProvider initialData={{
      divisions: [], clubs: [landser], seasons, phases, competitions: [], competitionGroups: [],
      federations: mockFederations, groups: [], teams: [], players: [lucas], playerSeasonCategories: [],
      playerSeasonLicences: [], memberGroups: [], trainings: [], trainingSessions: [], trainingAvailabilities: [],
      playerPhasePoints: [], matchDays: [], games: [], gameAvailabilities: [], gameSelections: [],
      users: [{ ...lucas, role: 'player', isPlayer: true }],
    }}>
      <ImportFederationPlayersModal clubId="landser" federationId="agr" onClose={() => {}} />
    </DataProvider>,
  )
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'liste.pdf', { type: 'application/pdf' })] } })
}

describe('ImportFederationPlayersModal', () => {
  it('reads the list, files the classement on the AGR phase, and imports the selection', async () => {
    open(AGR_PLAYER_LIST)
    expect(screen.getByText(/classement sur 2026\/2027 Phase 1/)).toBeInTheDocument()
    expect(await screen.findByText('6 licences')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Importer la sélection' }))
    // Five new licensees; Lucas, found on his AGR licence, gains his classement.
    expect(await screen.findByRole('status')).toHaveTextContent('5 joueurs créés · 1 mis à jour.')
  })

  it('refuses another club’s list', async () => {
    open(AGR_PLAYER_LIST.map((l) => (l === '( 680036 )' ? '( 680021 )' : l)))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette liste est celle de LANDSER ASL (n° 680021)')
  })
})
