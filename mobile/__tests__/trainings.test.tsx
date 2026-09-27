import { Alert, Linking } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { PHONE_WIDTH, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type {
  Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User,
} from '@shared/types'
import TrainingsScreen from '@/app/(tabs)/entrainements'
import { NextTrainingSection } from '@/components/NextTrainingSection'
import MonCompteScreen from '@/app/(tabs)/compte'
import { setNotificationPreferences } from '@/utils/push'
import { openMatchInCalendar } from '@/utils/addToCalendar'

// ---------------------------------------------------------------------------
// Entraînements dans l'app (#608) : la liste des séances, la réponse d'un
// membre attendu, l'annulation par l'administrateur sur place, et les
// préférences de notification par catégorie dans « Mon compte ».
//
// Les règles sont dans src/lib/trainings.spec.ts ; ici, ce que les écrans en
// font.
// ---------------------------------------------------------------------------

const mockAuth: { user: User | null } = { user: null }
const mockData: Record<string, unknown> = {}
const mockPush = jest.fn()

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))
jest.mock('@/utils/addToCalendar', () => ({ openMatchInCalendar: jest.fn(async () => {}) }))
jest.mock('@/utils/push', () => ({
  setNotificationsEnabled: jest.fn(async () => {}),
  setNotificationPreferences: jest.fn(async () => {}),
}))

const CLUB = 'c1'

const member = (id: string, first: string, last: string, over: Partial<User> = {}): User => ({
  id, role: 'player', isPlayer: true, clubId: CLUB, firstName: first, lastName: last, status: 'active', ...over,
})

const club: Club = {
  id: CLUB, affiliationNumber: '06680011', displayName: 'PPA Rixheim', isArchived: false, channels: [],
  addresses: [{ id: 'a1', label: 'Gymnase', street: '', postalCode: '', city: 'Rixheim', isDefault: true }],
}
const groups: MemberGroup[] = [{ id: 'g-jeunes', clubId: CLUB, displayName: 'Jeunes', memberIds: ['p2'] }]

const mardi: Training = {
  id: 't-mardi', clubId: CLUB, kind: 'regular', displayName: 'Libre du mardi',
  weekday: 2, startTime: '20:00', endTime: '22:00', memberGroupIds: [], managerIds: [],
}
const dirige: Training = {
  id: 't-dirige', clubId: CLUB, kind: 'guided', displayName: 'Dirigé jeunes',
  startTime: '18:30', memberGroupIds: ['g-jeunes'], managerIds: ['coach'], calendarToken: 'tok',
}

let fns: Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  setWindowSize(PHONE_WIDTH)
  // A Saturday: the next Tuesday is the 29th.
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
  jest.setSystemTime(new Date(2026, 8, 26, 10, 0))
  fns = {
    setTrainingAvailability: jest.fn(),
    setTrainingSessionState: jest.fn(),
  }
  const sessions: TrainingSession[] = [
    { trainingId: 't-dirige', date: '2026-09-30', cancelled: false },
    { trainingId: 't-mardi', date: '2026-10-06', cancelled: true, note: 'Gymnase fermé' },
  ]
  const answers: TrainingAvailability[] = [
    { trainingId: 't-dirige', date: '2026-09-30', playerId: 'p2', status: 'maybe' },
  ]
  Object.assign(mockData, {
    clubs: [club],
    users: [member('p1', 'Quentin', 'Colle'), member('p2', 'Enzo', 'Lotz')],
    players: [], teams: [], phases: [], playerPhasePoints: [],
    memberGroups: groups,
    competitions: [], competitionGroups: [], divisions: [], gameSelections: [], seasons: [], playerSeasonCategories: [],
    trainings: [mardi, dirige],
    trainingSessions: sessions,
    trainingAvailabilities: answers,
    refreshing: false,
    refresh: jest.fn(),
    ...fns,
  })
  mockAuth.user = member('p2', 'Enzo', 'Lotz')
})

afterEach(() => {
  jest.useRealTimers()
  resetWindowSize()
})

describe('la liste des séances', () => {
  it('déroule le créneau libre sur ses mardis, et garde le soir annulé avec son motif', () => {
    render(<TrainingsScreen />)
    expect(screen.getByTestId('training-t-mardi-2026-09-29')).toBeTruthy()
    expect(screen.getByTestId('training-cancelled-t-mardi-2026-10-06'))
      .toHaveTextContent('Annulée — Gymnase fermé')
    // Un créneau libre ne demande rien.
    expect(screen.queryByTestId('training-answer-t-mardi-2026-09-29-available')).toBeNull()
  })

  it('demande au membre attendu s’il vient, et enregistre sa réponse', () => {
    render(<TrainingsScreen />)
    fireEvent.press(screen.getByTestId('training-answer-t-dirige-2026-09-30-available'))
    expect(fns.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
  })

  it('retire la réponse quand on retouche celle qui est posée', () => {
    render(<TrainingsScreen />)
    fireEvent.press(screen.getByTestId('training-answer-t-dirige-2026-09-30-maybe'))
    expect(fns.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', null)
  })

  it('ne demande rien à qui la séance ne s’adresse pas, mais lui montre le décompte', () => {
    mockAuth.user = member('p1', 'Quentin', 'Colle')
    render(<TrainingsScreen />)
    expect(screen.queryByTestId('training-answer-t-dirige-2026-09-30-available')).toBeNull()
    expect(screen.getByTestId('training-tally-t-dirige-2026-09-30')).toHaveTextContent('1 peut-être')
  })

  it('ne donne à un joueur aucun moyen d’annuler', () => {
    render(<TrainingsScreen />)
    expect(screen.queryByTestId('training-cancel-t-mardi-2026-09-29')).toBeNull()
  })
})

describe('l’administrateur, dans le gymnase', () => {
  beforeEach(() => {
    mockAuth.user = member('ca', 'Virginie', 'Barlinge', { role: 'club_admin', isPlayer: false })
  })

  it('annule un mardi, avec un motif', () => {
    render(<TrainingsScreen />)
    fireEvent.press(screen.getByTestId('training-cancel-t-mardi-2026-09-29'))
    fireEvent.changeText(screen.getByTestId('training-cancel-note'), 'Tournoi')
    fireEvent.press(screen.getByTestId('training-cancel-confirm'))
    expect(fns.setTrainingSessionState).toHaveBeenCalledWith(CLUB, 't-mardi', '2026-09-29', {
      cancelled: true, note: 'Tournoi',
    })
  })

  it('rétablit un soir annulé', () => {
    render(<TrainingsScreen />)
    fireEvent.press(screen.getByTestId('training-restore-t-mardi-2026-10-06'))
    expect(fns.setTrainingSessionState).toHaveBeenCalledWith(CLUB, 't-mardi', '2026-10-06', { cancelled: false })
  })
})

/** Jest has no layout engine: give a carousel the width a column would have. */
const measure = (kind: 'regular' | 'guided') =>
  fireEvent(screen.getByTestId(`home-trainings-${kind}`), 'layout', { nativeEvent: { layout: { width: 343 } } })

/** Press one of the buttons an Alert was opened with. */
const pressAlert = (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Array<{ text: string; onPress?: () => void }>
  buttons.find((b) => b.text === label)?.onPress?.()
}

describe('l’accueil', () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}))

  it('un carrousel par sorte : les trois prochains mardis, et la séance dirigée', () => {
    render(<NextTrainingSection />)
    measure('regular')
    measure('guided')
    expect(screen.getByTestId('training-t-mardi-2026-09-29')).toBeTruthy()
    expect(screen.getByTestId('training-t-mardi-2026-10-13')).toBeTruthy()
    // The Tuesday called off stays in the row, saying so.
    expect(screen.getByTestId('training-cancelled-t-mardi-2026-10-06')).toHaveTextContent('Annulée — Gymnase fermé')
    expect(screen.getByTestId('home-trainings-regular-dots')).toBeTruthy()
    // One guided date: a card, not a carousel.
    expect(screen.queryByTestId('home-trainings-guided-dots')).toBeNull()
  })

  it('dit qu’il y en a plus que trois, et finit sur le chemin des autres', () => {
    render(<NextTrainingSection />)
    measure('regular')
    measure('guided')
    // Four Tuesdays in the slot's four weeks: three cards, then « +1 ».
    expect(screen.getByTestId('home-trainings-regular')).toHaveTextContent(/Entraînements libres · 4 à venir/)
    expect(screen.queryByTestId('training-t-mardi-2026-10-20')).toBeNull()
    const more = screen.getByTestId('home-trainings-regular-more')
    expect(more).toHaveTextContent(/\+1.*1 autre séance à venir/)
    fireEvent.press(more)
    expect(mockPush).toHaveBeenCalledWith('/entrainements')
    // Nothing of the kind for a column holding no more than it shows.
    expect(screen.queryByTestId('home-trainings-guided-more')).toBeNull()
    expect(screen.getByTestId('home-trainings-guided')).not.toHaveTextContent(/à venir/)
  })

  it('demande « Ma disponibilité », comme la carte du match', () => {
    render(<NextTrainingSection />)
    measure('guided')
    expect(screen.getByText('Ma disponibilité')).toBeTruthy()
    fireEvent.press(screen.getByTestId('training-answer-t-dirige-2026-09-30-available'))
    expect(fns.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
  })

  it('ajoute cette séance, ou toute la série, à l’agenda', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    render(<NextTrainingSection />)
    measure('guided')
    fireEvent.press(screen.getByTestId('training-calendar-t-dirige-2026-09-30'))
    pressAlert('Cette séance')
    expect(openMatchInCalendar).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dirigé jeunes' }))
    fireEvent.press(screen.getByTestId('training-calendar-t-dirige-2026-09-30'))
    pressAlert('Toute la série')
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/api\/trainings\/t-dirige\/calendar\.ics\?token=tok$/))
  })

  it('ne propose pas l’agenda pour un créneau libre, qui revient chaque semaine', () => {
    render(<NextTrainingSection />)
    measure('regular')
    expect(screen.queryByTestId('training-calendar-t-mardi-2026-09-29')).toBeNull()
  })

  it('ne donne que le créneau libre à qui aucune séance dirigée n’attend', () => {
    mockAuth.user = member('p1', 'Quentin', 'Colle')
    render(<NextTrainingSection />)
    expect(screen.getByTestId('home-trainings-regular')).toBeTruthy()
    expect(screen.queryByTestId('home-trainings-guided')).toBeNull()
  })

  it('n’offre pas d’annuler depuis l’accueil, même à un administrateur', () => {
    mockAuth.user = member('p2', 'Enzo', 'Lotz', { role: 'club_admin' })
    render(<NextTrainingSection />)
    measure('guided')
    expect(screen.queryByTestId('training-cancel-t-dirige-2026-09-30')).toBeNull()
  })

  it('ne montre rien quand aucune séance n’attend ce membre', () => {
    mockData.trainings = []
    render(<NextTrainingSection />)
    expect(screen.queryByTestId('home-next-training')).toBeNull()
  })
})

describe('le responsable d’une série dirigée', () => {
  it('annule une séance de sa série, et rien du créneau libre', () => {
    mockAuth.user = member('coach', 'Julien', 'Coach')
    render(<TrainingsScreen />)
    expect(screen.getByTestId('training-cancel-t-dirige-2026-09-30')).toBeTruthy()
    expect(screen.queryByTestId('training-cancel-t-mardi-2026-09-29')).toBeNull()
  })
})

describe('Mon compte — ce qu’on veut recevoir', () => {
  it('propose les trois catégories, dirigés activés et libres désactivés', () => {
    render(<MonCompteScreen />)
    expect(screen.getByTestId('notify-match-switch').props.value).toBe(true)
    expect(screen.getByTestId('notify-training_guided-switch').props.value).toBe(true)
    expect(screen.getByTestId('notify-training_regular-switch').props.value).toBe(false)
    // Le délai ne s'offre que pour une catégorie active, et jamais pour les matchs.
    expect(screen.getByTestId('notify-training_guided-lead-3').props.accessibilityState).toEqual({ selected: true })
    expect(screen.queryByTestId('notify-training_regular-lead-3')).toBeNull()
    expect(screen.queryByTestId('notify-match-lead-3')).toBeNull()
  })

  it('enregistre un changement de catégorie et de délai, et rien d’autre', () => {
    render(<MonCompteScreen />)
    fireEvent(screen.getByTestId('notify-training_regular-switch'), 'valueChange', true)
    expect(setNotificationPreferences).toHaveBeenCalledWith({ training_regular: { enabled: true } })
    fireEvent.press(screen.getByTestId('notify-training_guided-lead-1'))
    expect(setNotificationPreferences).toHaveBeenCalledWith({ training_guided: { leadDays: 1 } })
  })

  it('lit ce que le membre avait déjà choisi', () => {
    mockAuth.user = member('p2', 'Enzo', 'Lotz', {
      notificationPreferences: { training_regular: { enabled: true, leadDays: 1 } },
    })
    render(<MonCompteScreen />)
    expect(screen.getByTestId('notify-training_regular-switch').props.value).toBe(true)
    expect(screen.getByTestId('notify-training_regular-lead-1').props.accessibilityState).toEqual({ selected: true })
  })

  it('ne parle pas d’entraînements à un club qui n’en publie aucun', () => {
    mockData.trainings = []
    render(<MonCompteScreen />)
    expect(screen.getByTestId('notify-match')).toBeTruthy()
    expect(screen.queryByTestId('notify-training_guided')).toBeNull()
  })

  it('cache les catégories sous l’interrupteur général éteint', () => {
    mockAuth.user = member('p2', 'Enzo', 'Lotz', { notificationsEnabled: false })
    render(<MonCompteScreen />)
    expect(screen.queryByTestId('notify-match')).toBeNull()
  })
})
