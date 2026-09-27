import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User } from '@/types'
import { NextTrainings } from '@/components/NextTrainings'

// #608 — the week's trainings on the web Accueil: the next guided session the
// member is expected at, to answer on the spot, and the next evening of their
// regular slot, called off or not.

const CLUB = 'club-1'

const data = vi.hoisted(() => ({
  clubs: [] as Club[],
  users: [] as User[],
  memberGroups: [] as MemberGroup[],
  trainings: [] as Training[],
  trainingSessions: [] as TrainingSession[],
  trainingAvailabilities: [] as TrainingAvailability[],
  addTraining: vi.fn(),
  updateTraining: vi.fn(),
  deleteTraining: vi.fn(),
  addTrainingDates: vi.fn(),
  setTrainingSessionState: vi.fn(),
  deleteTrainingDate: vi.fn(),
  setTrainingAvailability: vi.fn(),
}))
const auth = vi.hoisted(() => ({ user: null as unknown }))

vi.mock('@/contexts/AuthContext', () => ({
  DEV_LOGIN: false,
  useAuth: () => ({ user: auth.user, token: null, logout: vi.fn() }),
}))
vi.mock('@/contexts/DataContext', () => ({ useAppData: () => data }))

const member = (id: string, first: string, last: string, over: Partial<User> = {}): User => ({
  id, role: 'player', isPlayer: true, clubId: CLUB, firstName: first, lastName: last, status: 'active', ...over,
})

const mardi: Training = {
  id: 't-mardi', clubId: CLUB, kind: 'regular', displayName: 'Libre du mardi',
  weekday: 2, startTime: '20:00', endTime: '22:00', memberGroupIds: [],
}
const dirige: Training = {
  id: 't-dirige', clubId: CLUB, kind: 'guided', displayName: 'Dirigé jeunes',
  startTime: '18:30', memberGroupIds: ['g-jeunes'],
}

beforeEach(() => {
  // A Saturday: the next Tuesday is the 29th.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 26, 10, 0))
  data.clubs = [{
    id: CLUB, affiliationNumber: '1', displayName: 'PPA Rixheim', isArchived: false, channels: [],
    addresses: [{ id: 'a1', label: 'Gymnase', street: '', postalCode: '', city: 'Rixheim', isDefault: true }],
  }]
  data.users = [
    member('p1', 'Quentin', 'Colle'),
    member('p2', 'Enzo', 'Lotz'),
    member('ca', 'Virginie', 'Barlinge', { role: 'club_admin', isPlayer: false }),
  ]
  data.memberGroups = [{ id: 'g-jeunes', clubId: CLUB, displayName: 'Jeunes', memberIds: ['p2'] }]
  data.trainings = [mardi, dirige]
  data.trainingSessions = [
    { trainingId: 't-dirige', date: '2026-09-30', cancelled: false },
    { trainingId: 't-mardi', date: '2026-10-06', cancelled: true, note: 'Gymnase fermé' },
  ]
  data.trainingAvailabilities = []
  for (const fn of [
    data.addTraining, data.updateTraining, data.deleteTraining, data.addTrainingDates,
    data.setTrainingSessionState, data.deleteTrainingDate, data.setTrainingAvailability,
  ]) fn.mockReset()
})

afterEach(() => vi.useRealTimers())

const renderBlock = () => render(<MemoryRouter><NextTrainings /></MemoryRouter>)
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('Prochains entraînements, on the Accueil', () => {
  it('asks about the guided session and states the Tuesday, by date', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const section = screen.getByRole('region', { name: 'Prochains entraînements' })
    expect(within(section).getByRole('link', { name: /Libre du mardi.*mardi 29 septembre à 20h/ })).toBeInTheDocument()
    const guided = within(section).getByRole('article', { name: 'Dirigé jeunes, mercredi 30 septembre' })
    expect(guided).toHaveTextContent('mercredi 30 septembre · 18h30')
    await user().click(within(guided).getByRole('button', { name: 'OUI' }))
    expect(data.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
    // Answering only: the calendar is run from its own page.
    expect(within(section).queryByRole('button', { name: /^Actions/ })).not.toBeInTheDocument()
  })

  it('gives someone no guided session is for the Tuesday alone', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Libre du mardi/ })).toBeInTheDocument()
  })

  it('says so when this Tuesday is off', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainingSessions = [{ trainingId: 't-mardi', date: '2026-09-29', cancelled: true, note: 'Tournoi' }]
    renderBlock()
    expect(screen.getByRole('link', { name: /annulé : Tournoi/ })).toBeInTheDocument()
  })

  it('shows nothing when the week holds nothing for this member', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = []
    const { container } = renderBlock()
    expect(container).toBeEmptyDOMElement()
  })
})
