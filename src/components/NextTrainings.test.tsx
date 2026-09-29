import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User } from '@/types'
import { NextTrainings } from '@/components/NextTrainings'

// #608 — the trainings on the web Accueil: the member's next five sessions,
// guided and regular mixed in date order, two to a page from md: up — a guided
// one answered on the spot, a regular evening shown called off or not.

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
  setViewport('desktop')
  for (const fn of [
    data.addTraining, data.updateTraining, data.deleteTraining, data.addTrainingDates,
    data.setTrainingSessionState, data.deleteTrainingDate, data.setTrainingAvailability,
  ]) fn.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** md: and up pages two cards at a time; below, one. */
function setViewport(kind: 'mobile' | 'desktop') {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: kind === 'desktop',
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

const renderBlock = () => render(<MemoryRouter><NextTrainings /></MemoryRouter>)
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

const block = () => screen.getByRole('region', { name: 'Prochains entraînements' })
const cards = () => within(block()).queryAllByRole('article').map((a) => a.getAttribute('aria-label'))
const next = (u: ReturnType<typeof user>) => u.click(within(block()).getByRole('button', { name: 'Séances suivantes' }))

describe('Prochains entraînements, on the Accueil', () => {
  it('mixes both kinds in date order, two to a page', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    expect(cards()).toEqual(['Libre du mardi, mardi 29 septembre', 'Dirigé jeunes, mercredi 30 septembre'])
    expect(within(block()).getByText('1/3')).toBeInTheDocument()
    const u = user()
    await next(u)
    expect(cards()).toEqual(['Libre du mardi, mardi 6 octobre', 'Libre du mardi, mardi 13 octobre'])
    // The Tuesday called off stays in the row, saying so.
    expect(within(block()).getAllByRole('article')[0]).toHaveTextContent('Annulée — Gymnase fermé')
    await next(u)
    // The fifth, and beside it: a weekly slot goes on, without a count nobody reads.
    expect(cards()).toEqual(['Libre du mardi, mardi 20 octobre'])
    const more = within(block()).getByRole('link', { name: /Et les suivantes/ })
    expect(more).toHaveAttribute('href', '/entrainements')
    expect(block()).not.toHaveTextContent('à venir')
  })

  it('pages one at a time below md:', () => {
    setViewport('mobile')
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    expect(cards()).toEqual(['Libre du mardi, mardi 29 septembre'])
    expect(within(block()).getByText('1/6')).toBeInTheDocument()
  })

  it('counts what is left when every series has a last date', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = [dirige]
    data.trainingSessions = ['2026-09-30', '2026-10-07', '2026-10-14', '2026-11-04', '2026-12-02', '2026-12-09', '2027-01-13']
      .map((date) => ({ trainingId: 't-dirige', date, cancelled: false }))
    renderBlock()
    const u = user()
    await next(u)
    await next(u)
    expect(cards()).toEqual(['Dirigé jeunes, mercredi 2 décembre'])
    expect(within(block()).getByRole('link', { name: /\+2/ })).toHaveTextContent('2 autres séances à venir')
  })

  it('ends on a lone card, and no « more », when there is nothing past five', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = [dirige]
    data.trainingSessions = ['2026-09-30', '2026-10-07', '2026-10-14']
      .map((date) => ({ trainingId: 't-dirige', date, cancelled: false }))
    renderBlock()
    expect(within(block()).getByText('1/2')).toBeInTheDocument()
    await next(user())
    expect(cards()).toEqual(['Dirigé jeunes, mercredi 14 octobre'])
    expect(within(block()).queryByRole('link', { name: /à venir|Et les suivantes/ })).not.toBeInTheDocument()
  })

  it('asks « Ma disponibilité » on a guided session, as the match card does', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const guided = within(block()).getByRole('article', { name: 'Dirigé jeunes, mercredi 30 septembre' })
    expect(within(guided).getByText('Ma disponibilité')).toBeInTheDocument()
    await user().click(within(guided).getByRole('button', { name: 'OUI' }))
    expect(data.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
    // Answering only: the calendar is run from its own page.
    expect(within(block()).queryByRole('button', { name: /^Actions/ })).not.toBeInTheDocument()
    // A regular evening asks nothing.
    const tuesday = within(block()).getByRole('article', { name: 'Libre du mardi, mardi 29 septembre' })
    expect(within(tuesday).queryByText('Ma disponibilité')).not.toBeInTheDocument()
  })

  it('offers this session or the whole series to the agenda', async () => {
    auth.user = { id: 'p2', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    const guided = within(block()).getByRole('article', { name: 'Dirigé jeunes, mercredi 30 septembre' })
    await user().click(within(guided).getByRole('button', { name: 'Ajouter à mon agenda' }))
    expect(within(guided).getByRole('menuitem', { name: 'Cette séance' })).toBeInTheDocument()
    expect(within(guided).getByRole('menuitem', { name: 'Toute la série (1 date)' })).toBeInTheDocument()
  })

  it('leads to every training at the bottom', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    renderBlock()
    // No guided session is for this member: the regular slot alone.
    expect(cards()).toEqual(['Libre du mardi, mardi 29 septembre', 'Libre du mardi, mardi 6 octobre'])
    expect(within(block()).getByRole('link', { name: 'Tous les entraînements' })).toHaveAttribute('href', '/entrainements')
  })

  it('shows nothing when no session is waiting on this member', () => {
    auth.user = { id: 'p1', role: 'player', clubId: CLUB, isPlayer: true }
    data.trainings = []
    const { container } = renderBlock()
    expect(container).toBeEmptyDOMElement()
  })
})
