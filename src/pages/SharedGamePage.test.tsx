import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// #747 — a shared match opens under the profile that plays it.

const auth = vi.hoisted(() => ({
  user: { id: 'benjamin', role: 'player', clubId: 'rix', firstName: 'Benjamin', lastName: 'Henaut' } as Record<string, unknown>,
  profiles: [] as Array<Record<string, unknown>>,
  switchProfile: vi.fn<(id: string) => Promise<void>>(async () => {}),
}))
const data = vi.hoisted(() => ({
  games: [{ id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2' }],
  teams: [
    { id: 't1', clubId: 'rix', number: 1, playerIds: ['sacha'], captainId: '' },
    { id: 't2', clubId: 'kembs', number: 2, playerIds: [], captainId: '' },
  ],
  clubs: [{ id: 'rix', displayName: 'Rixheim' }, { id: 'kembs', displayName: 'Kembs' }],
  gameSelections: [],
  players: [],
  users: [],
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

const { SharedGamePage } = await import('./SharedGamePage')

function Landed() {
  const location = useLocation()
  return <p data-testid="landed">{location.pathname + location.search}</p>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/match/:gameId" element={<SharedGamePage />} />
        <Route path="/journees/:gameId" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  )
}

const benjamin = { id: 'benjamin', role: 'player', clubId: 'rix', firstName: 'Benjamin', lastName: 'Henaut' }
const sacha = { id: 'sacha', role: 'player', clubId: 'rix', firstName: 'Sacha', lastName: 'Henaut' }

beforeEach(() => {
  auth.user = benjamin
  auth.profiles = [benjamin, sacha]
  auth.switchProfile.mockReset().mockImplementation(async (id: string) => {
    auth.user = auth.profiles.find((p) => p.id === id)!
  })
  data.teams[0].playerIds = ['sacha']
})

describe('SharedGamePage (#747)', () => {
  it('becomes the profile that plays, then opens its side of the match', async () => {
    renderAt('/match/g1?equipe=t2')
    await waitFor(() => expect(auth.switchProfile).toHaveBeenCalledWith('sacha'))
  })

  it('opens straight away on the current profile when it is the one in it', () => {
    data.teams[0].playerIds = ['benjamin']
    renderAt('/match/g1?equipe=t2')
    expect(screen.getByTestId('landed').textContent).toBe('/journees/g1?equipe=t1')
    expect(auth.switchProfile).not.toHaveBeenCalled()
  })

  it('asks when two reached profiles play in it', () => {
    data.teams[0].playerIds = ['sacha', 'benjamin']
    renderAt('/match/g1')
    expect(screen.getByText('Ouvrir le match en tant que…')).toBeTruthy()
    fireEvent.click(screen.getByText('Benjamin Henaut'))
    expect(screen.getByTestId('landed').textContent).toBe('/journees/g1?equipe=t1')
    expect(auth.switchProfile).not.toHaveBeenCalled()
  })

  it('still opens the match when the switch is refused', async () => {
    auth.switchProfile.mockRejectedValue(new Error('offline'))
    renderAt('/match/g1')
    expect((await screen.findByTestId('landed')).textContent).toBe('/journees/g1?equipe=t1')
  })

  it('says so for a match that does not exist', () => {
    renderAt('/match/nope')
    expect(screen.getByText('Match introuvable.')).toBeTruthy()
  })
})
