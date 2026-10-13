import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/contexts/DataContext'
import { mockFederations } from '@/mock/data'
import type { Club } from '@/types'

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: true,
  useAuth: () => ({ user: { id: 'ga', role: 'general_admin', isPlayer: false } }),
}))

const { ClubsPage } = await import('./ClubsPage')
const { ClubDetailPage } = await import('./ClubDetailPage')

// #643 — the clubs list tags every affiliation and filters on one federation.

const club = (id: string, displayName: string, over: Partial<Club> = {}): Club => ({
  id, affiliationNumber: '', displayName, isArchived: false, addresses: [], channels: [], ...over,
})

const clubs = [
  club('club-fftt-06680011', 'Rixheim PPA', { affiliationNumber: '06680011' }),
  club('club-fftt-06680140', 'Kembs TT', {
    affiliationNumber: '06680140',
    affiliations: [{ federationId: 'agr', affiliationNumber: '680021' }],
  }),
  club('club-agr-680036', 'Landser ASL', { affiliations: [{ federationId: 'agr', affiliationNumber: '680036' }] }),
]

function renderPage(path = '/clubs', page: React.ReactNode = <ClubsPage />) {
  const data = {
    divisions: [], clubs, seasons: [], phases: [], competitions: [], competitionGroups: [], competitionEligibilities: [],
    federations: mockFederations,
    groups: [], teams: [], players: [], playerSeasonCategories: [], playerSeasonLicences: [], memberGroups: [],
    trainings: [], trainingSessions: [], trainingAvailabilities: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: [],
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider initialData={data}>{page}</DataProvider>
    </MemoryRouter>,
  )
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!

describe('ClubsPage — federations (#643)', () => {
  it('tags every affiliation, the FFTT included', () => {
    renderPage()
    expect(within(rowOf('Rixheim PPA')).getByText('FFTT')).toBeInTheDocument()
    expect(within(rowOf('Kembs TT')).getByText('FFTT')).toBeInTheDocument()
    expect(within(rowOf('Kembs TT')).getByText('AGR')).toBeInTheDocument()
    expect(within(rowOf('Landser ASL')).queryByText('FFTT')).not.toBeInTheDocument()
  })

  it('shows the clubs of one federation — Kembs in both lists', () => {
    renderPage()
    // The switch of every other list (#700), « Tous » first.
    expect(screen.getByRole('radio', { name: 'Tous' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'AGR' }))
    expect(screen.queryByText('Rixheim PPA')).not.toBeInTheDocument()
    expect(screen.getByText('Kembs TT')).toBeInTheDocument()
    expect(screen.getByText('Landser ASL')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'FFTT' }))
    expect(screen.getByText('Rixheim PPA')).toBeInTheDocument()
    expect(screen.getByText('Kembs TT')).toBeInTheDocument()
    expect(screen.queryByText('Landser ASL')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Tous' }))
    expect(screen.getByText('Landser ASL')).toBeInTheDocument()
  })

  it('reads the filter from the URL, and ignores a federation it does not know', () => {
    renderPage('/clubs?federation=agr')
    expect(screen.queryByText('Rixheim PPA')).not.toBeInTheDocument()

    renderPage('/clubs?federation=ufolep')
    expect(screen.getAllByText('Rixheim PPA').length).toBeGreaterThan(0)
  })
})

describe('A club’s page — the FFTT sync for a club of the FFTT (#698)', () => {
  const detail = (id: string) =>
    renderPage(`/clubs/${id}`, <Routes><Route path="/clubs/:clubId" element={<ClubDetailPage />} /></Routes>)

  it('is not offered to a club of the AGR alone, which lacks no FFTT number', () => {
    detail('club-agr-680036')
    expect(screen.queryByRole('heading', { name: 'Synchronisation FFTT' })).not.toBeInTheDocument()
  })

  it('stays for a club in both', () => {
    detail('club-fftt-06680140')
    expect(screen.getByRole('heading', { name: 'Synchronisation FFTT' })).toBeInTheDocument()
  })
})
