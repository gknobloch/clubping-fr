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
  weekday: 2, startTime: '20:00', endTime: '22:00', memberGroupIds: [], managerIds: [],
}
const dirige: Training = {
  id: 't-dirige', clubId: CLUB, kind: 'guided', displayName: 'Dirigé jeunes',
  startTime: '18:30', memberGroupIds: ['g-jeunes'], managerIds: [], calendarToken: 'tok',
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
  it('gives each kind its own carousel of the next three', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const regular = screen.getByRole('group', { name: 'Entraînements libres' })
    const guided = screen.getByRole('group', { name: 'Entraînements dirigés' })
    expect(within(regular).getByRole('article')).toHaveAccessibleName('Libre du mardi, mardi 29 septembre')
    const u = user()
    await u.click(within(regular).getByRole('button', { name: 'Séance suivante' }))
    // The Tuesday called off stays in the row, saying so.
    expect(within(regular).getByRole('article')).toHaveTextContent('Annulée — Gymnase fermé')
    // One guided date: a card, no stepping.
    expect(within(guided).queryByText(/\/\d/)).not.toBeInTheDocument()
    expect(within(guided).getByRole('article')).toHaveTextContent('mercredi 30 septembre · 18h30')
  })

  it('says there are more than three, and ends on the way to them', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const regular = screen.getByRole('group', { name: 'Entraînements libres' })
    // Four Tuesdays within the slot's four weeks: three cards, then « +1 ».
    expect(regular).toHaveTextContent('Entraînements libres · 4 à venir')
    expect(within(regular).getByText('1/4')).toBeInTheDocument()
    const u = user()
    for (let n = 0; n < 3; n++) await u.click(within(regular).getByRole('button', { name: 'Séance suivante' }))
    const more = within(regular).getByRole('link', { name: /\+1/ })
    expect(more).toHaveTextContent('1 autre séance à venir')
    expect(more).toHaveAttribute('href', '/entrainements')
    // Nothing of the kind for a column holding no more than it shows.
    expect(screen.getByRole('group', { name: 'Entraînements dirigés' })).not.toHaveTextContent('à venir')
  })

  it('asks « Ma disponibilité » on a guided session, as the match card does', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const guided = screen.getByRole('group', { name: 'Entraînements dirigés' })
    expect(within(guided).getByText('Ma disponibilité')).toBeInTheDocument()
    await user().click(within(guided).getByRole('button', { name: 'OUI' }))
    expect(data.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
    // Answering only: the calendar is run from its own page.
    expect(within(guided).queryByRole('button', { name: /^Actions/ })).not.toBeInTheDocument()
  })

  it('offers this session or the whole series to the agenda', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const guided = screen.getByRole('group', { name: 'Entraînements dirigés' })
    await user().click(within(guided).getByRole('button', { name: 'Ajouter à mon agenda' }))
    expect(within(guided).getByRole('menuitem', { name: 'Cette séance' })).toBeInTheDocument()
    expect(within(guided).getByRole('menuitem', { name: 'Toute la série (1 date)' })).toBeInTheDocument()
  })

  it('gives someone no guided session is for the regular slot alone', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    expect(screen.getByRole('group', { name: 'Entraînements libres' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Entraînements dirigés' })).not.toBeInTheDocument()
  })

  it('shows nothing when no session is waiting on this member', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = []
    const { container } = renderBlock()
    expect(container).toBeEmptyDOMElement()
  })
})
