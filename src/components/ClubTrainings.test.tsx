import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User } from '@/types'
import { ClubTrainings } from './ClubTrainings'

// #608 — a club's training series, on the club's page: who creates and edits
// them, who adds a guided series' dates, and how the dates are entered.

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

const renderPage = () => render(<MemoryRouter><ClubTrainings clubId={CLUB} variant="section" /></MemoryRouter>)
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('a club admin', () => {
  beforeEach(() => { auth.user = { id: 'ca', role: 'club_admin', clubId: CLUB, isPlayer: false } })

  it('lists the series with who runs them', () => {
    data.trainings = [mardi, { ...dirige, managerIds: ['p2'] }]
    renderPage()
    expect(screen.getByText(/Tous les mardis, 20h – 22h/)).toBeInTheDocument()
    expect(screen.getByText('Responsable : Enzo Lotz')).toBeInTheDocument()
  })

  it('names who runs a guided series', async () => {
    auth.user = { id: 'ca', role: 'club_admin', clubId: CLUB, isPlayer: false }
    data.addTraining.mockResolvedValue({ ok: true, training: { ...dirige, id: 't-new' } })
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: '+ Nouvel entraînement' }))
    await u.type(screen.getByLabelText('Nom'), 'Dirigé adultes')
    await u.selectOptions(screen.getByRole('combobox', { name: 'Ajouter un responsable' }), 'p2')
    expect(screen.getByRole('button', { name: 'Retirer Enzo Lotz' })).toBeInTheDocument()
    await u.type(screen.getByLabelText('Première séance'), '2026-10-01')
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(data.addTraining).toHaveBeenCalledWith(CLUB, expect.objectContaining({ managerIds: ['p2'] }))
  })



  it('creates a guided series with its weekly run of dates', async () => {
    data.addTraining.mockResolvedValue({ ok: true, training: { ...dirige, id: 't-new' } })
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: '+ Nouvel entraînement' }))
    await u.type(screen.getByLabelText('Nom'), 'Dirigé adultes')
    await u.click(screen.getByRole('button', { name: 'Jeunes' }))
    await u.type(screen.getByLabelText('Première séance'), '2026-10-01')
    await u.type(screen.getByLabelText(/jusqu’au/), '2026-10-15')
    expect(screen.getByText(/3 séances/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(data.addTraining).toHaveBeenCalledWith(CLUB, expect.objectContaining({
      kind: 'guided', displayName: 'Dirigé adultes', memberGroupIds: ['g-jeunes'], startTime: '20:00',
    }))
    expect(data.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-new', ['2026-10-01', '2026-10-08', '2026-10-15'])
  })


  it('creates a guided series on dates picked in a calendar', async () => {
    data.addTraining.mockResolvedValue({ ok: true, training: { ...dirige, id: 't-new' } })
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: '+ Nouvel entraînement' }))
    await u.type(screen.getByLabelText('Nom'), 'Dirigé irrégulier')
    await u.click(screen.getByLabelText('Dates au choix'))
    const calendar = screen.getByRole('group', { name: 'Dates des séances' })
    // Opens on this month; the past cannot be picked.
    expect(within(calendar).getByText('Septembre 2026')).toBeInTheDocument()
    expect(within(calendar).getByRole('button', { name: 'vendredi 25 septembre' })).toBeDisabled()
    await u.click(within(calendar).getByRole('button', { name: 'mardi 29 septembre' }))
    await u.click(within(calendar).getByRole('button', { name: 'Mois suivant' }))
    await u.click(within(calendar).getByRole('button', { name: 'jeudi 8 octobre' }))
    await u.click(within(calendar).getByRole('button', { name: 'jeudi 22 octobre' }))
    // A second tap takes a date back out.
    await u.click(within(calendar).getByRole('button', { name: 'jeudi 22 octobre' }))
    expect(screen.getByText(/2 séances/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(data.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-new', ['2026-09-29', '2026-10-08'])
  })


  it('adds dates to a series without offering the ones it has', async () => {
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: 'Actions — Dirigé jeunes' }))
    await u.click(screen.getByRole('menuitem', { name: 'Ajouter des dates' }))
    await u.click(screen.getByLabelText('Dates au choix'))
    const calendar = screen.getByRole('group', { name: 'Dates des séances' })
    expect(within(calendar).getByRole('button', { name: 'mercredi 30 septembre — déjà prévue' })).toBeDisabled()
    await u.click(within(calendar).getByRole('button', { name: 'mardi 29 septembre' }))
    await u.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(data.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-dirige', ['2026-09-29'])
  })


  it('keeps the form open on a refusal, saying why', async () => {
    data.addTraining.mockResolvedValue({ ok: false, message: 'Vérifiez les horaires : la fin doit suivre le début.' })
    const u = user()
    renderPage()
    await u.click(screen.getByRole('button', { name: '+ Nouvel entraînement' }))
    await u.click(screen.getByLabelText('Entraînement libre'))
    await u.type(screen.getByLabelText('Nom'), 'Libre')
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('horaires')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('the manager of a guided series', () => {
  it('adds its dates, and nothing of the series itself', async () => {
    auth.user = { id: 'coach', role: 'player', clubId: CLUB, isPlayer: true }
    const u = user()
    renderPage()
    expect(screen.queryByRole('button', { name: '+ Nouvel entraînement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions — Libre du mardi' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Actions — Dirigé jeunes' }))
    expect(screen.getByRole('menuitem', { name: 'Ajouter des dates' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Supprimer' })).not.toBeInTheDocument()
  })
})

describe('a member', () => {
  it('reads the series, and nothing to run', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderPage()
    expect(screen.getByText('Dirigé jeunes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions/ })).not.toBeInTheDocument()
  })

  it('is spared the section when the club has no training', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = []
    const { container } = renderPage()
    expect(container).toBeEmptyDOMElement()
  })
})
