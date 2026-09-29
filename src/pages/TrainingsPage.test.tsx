import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User } from '@/types'
import { TrainingsPage } from './TrainingsPage'

// #608 — the club's trainings on the web. The write rules are the API's suite;
// here, the screen: who is asked to answer, who runs the calendar, and that a
// date called off stays on screen, saying so.

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
  startTime: '18:30', memberGroupIds: ['g-jeunes'], managerIds: ['coach'], calendarToken: 'tok',
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

// happy-dom ships no localStorage here (see offlineCache.spec.ts), and the
// series' fold is remembered in it — so each test brings a fresh one.
beforeEach(() => {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  })
})

const renderPage = () => render(<MemoryRouter><TrainingsPage /></MemoryRouter>)
const card = (name: string) => screen.getByRole('article', { name })
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('a member reading the calendar', () => {
  it('lists the coming sessions, a regular slot expanded to its Tuesdays', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    expect(card('Libre du mardi, mardi 29 septembre')).toHaveTextContent('20h – 22h · Gymnase')
    expect(card('Libre du mardi, mardi 29 septembre')).toHaveTextContent('Tout le club')
    expect(card('Dirigé jeunes, mercredi 30 septembre')).toHaveTextContent('Jeunes')
    expect(screen.queryByRole('button', { name: 'Nouvel entraînement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions/ })).not.toBeInTheDocument()
  })

  it('keeps a Tuesday called off on screen, saying why, and asks nothing of a regular slot', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    expect(card('Libre du mardi, mardi 6 octobre')).toHaveTextContent('Annulée — Gymnase fermé')
    expect(within(card('Libre du mardi, mardi 29 septembre')).queryByText('Ma disponibilité')).not.toBeInTheDocument()
  })

  it('asks whoever is expected at a guided session, and records their own answer', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    const session = card('Dirigé jeunes, mercredi 30 septembre')
    expect(within(session).getByText('1 sans réponse ▾')).toBeInTheDocument()
    await user().click(within(session).getByRole('button', { name: 'OUI' }))
    expect(data.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
  })

  it('gives a member no way to the series\' management', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    expect(screen.queryByRole('button', { name: 'Gérer les séries' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nouvel entraînement/ })).not.toBeInTheDocument()
  })

  it('does not ask someone the session is not for', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    expect(within(card('Dirigé jeunes, mercredi 30 septembre')).queryByText('Ma disponibilité')).not.toBeInTheDocument()
  })
})

describe('the list (#608)', () => {
  beforeEach(() => { auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true } })

  it('shows ten sessions, then ten more at a time, far past a month', async () => {
    data.trainingSessions = [{ trainingId: 't-dirige', date: '2026-12-10', cancelled: false }]
    const u = user()
    renderPage()
    expect(screen.getAllByRole('article')).toHaveLength(10)
    await u.click(screen.getByRole('button', { name: 'Voir plus' }))
    expect(screen.getAllByRole('article')).toHaveLength(20)
    // Past the first Tuesday of November, and on to a coach's December.
    expect(card('Libre du mardi, mardi 3 novembre')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Voir plus' }))
    expect(card('Dirigé jeunes, jeudi 10 décembre')).toBeInTheDocument()
  })


})

describe('the manager of a guided series (#608)', () => {
  beforeEach(() => { auth.user = { id: 'coach', role: 'player', clubId: CLUB, isPlayer: true } })

  it('calls off a session of their series, and nothing of the regular slot', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Actions — Dirigé jeunes, mercredi 30 septembre' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions — Libre du mardi, mardi 29 septembre' })).not.toBeInTheDocument()
    // And has the way to the series, on the club's page.
    expect(screen.getByRole('button', { name: 'Gérer les séries' })).toBeInTheDocument()
  })
})

describe('a club admin running it', () => {
  beforeEach(() => { auth.user = { id: 'ca', role: 'club_admin', clubId: CLUB, isPlayer: false } })

  it('calls one Tuesday off, with a reason', async () => {
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: 'Actions — Libre du mardi, mardi 29 septembre' }))
    await u.click(screen.getByRole('menuitem', { name: 'Annuler la séance' }))
    await u.type(screen.getByLabelText(/Motif/), 'Tournoi')
    await u.click(screen.getByRole('button', { name: 'Annuler la séance' }))
    expect(data.setTrainingSessionState).toHaveBeenCalledWith(CLUB, 't-mardi', '2026-09-29', {
      cancelled: true, note: 'Tournoi',
    })
  })

  it('restores a date called off', async () => {
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: 'Actions — Libre du mardi, mardi 6 octobre' }))
    await u.click(screen.getByRole('menuitem', { name: 'Rétablir la séance' }))
    expect(data.setTrainingSessionState).toHaveBeenCalledWith(CLUB, 't-mardi', '2026-10-06', { cancelled: false })
  })





})
