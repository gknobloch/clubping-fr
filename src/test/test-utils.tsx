/* eslint-disable react-refresh/only-export-components -- test utils, not app components */
import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import {
  mockDivisions,
  mockClubs,
  mockSeasons,
  mockPhases,
  mockGroups,
  mockTeams,
  mockPlayers,
  mockPlayerPhasePoints,
  mockMatchDays,
  mockGames,
  mockGameAvailabilities,
  mockGameSelections,
  mockUsers,
  mockCompetitions,
  mockCompetitionEligibilities,
} from '@/mock/data'

const testData = {
  divisions: mockDivisions,
  competitions: mockCompetitions,
  competitionEligibilities: mockCompetitionEligibilities,
  clubs: mockClubs,
  seasons: mockSeasons,
  phases: mockPhases,
  groups: mockGroups,
  teams: mockTeams,
  players: mockPlayers,
  playerPhasePoints: mockPlayerPhasePoints,
  matchDays: mockMatchDays,
  games: mockGames,
  gameAvailabilities: mockGameAvailabilities,
  gameSelections: mockGameSelections,
  users: mockUsers,
}

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider initialData={testData}>{children}</DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: AllProviders,
    ...options,
  })
}

export * from '@testing-library/react'
export { customRender as render }
