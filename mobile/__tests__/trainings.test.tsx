import { Alert, Linking } from 'react-native'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { PHONE_WIDTH, TABLET_SMALL, resetWindowSize, setWindowSize } from '@/__tests__/support/window'
import type {
  Club, MemberGroup, Training, TrainingAvailability, TrainingSession, User,
} from '@shared/types'
import TrainingsScreen from '@/app/(tabs)/entrainements'
import ClubScreen from '@/app/(tabs)/club'
import { NextTrainingSection } from '@/components/NextTrainingSection'
import { MyAvailability } from '@/components/MyAvailability'
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
    addTraining: jest.fn(async (_club: string, draft: Record<string, unknown>) => ({
      ok: true, training: { ...draft, id: 't-new', clubId: CLUB },
    })),
    updateTraining: jest.fn(async (_club: string, id: string, draft: Record<string, unknown>) => ({
      ok: true, training: { ...draft, id, clubId: CLUB },
    })),
    deleteTraining: jest.fn(),
    addTrainingDates: jest.fn(),
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

describe('la liste, dix par dix', () => {
  it('montre dix séances, puis dix de plus, bien au-delà d’un mois', () => {
    mockData.trainingSessions = [{ trainingId: 't-dirige', date: '2026-12-10', cancelled: false }]
    render(<TrainingsScreen />)
    // Ten Tuesdays, the 29th of September to the 1st of December.
    expect(screen.getByTestId('training-t-mardi-2026-12-01')).toBeTruthy()
    expect(screen.queryByTestId('training-t-mardi-2026-12-08')).toBeNull()
    fireEvent.press(screen.getByTestId('trainings-more'))
    expect(screen.getByTestId('training-t-mardi-2026-12-08')).toBeTruthy()
    expect(screen.getByTestId('training-t-dirige-2026-12-10')).toBeTruthy()
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

/** Jest has no layout engine: give the carousel the width the block would have. */
const measure = (width = 343) =>
  fireEvent(screen.getByTestId('home-trainings'), 'layout', { nativeEvent: { layout: { width } } })

/** Press one of the buttons an Alert was opened with. */
const pressAlert = (label: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Array<{ text: string; onPress?: () => void }>
  buttons.find((b) => b.text === label)?.onPress?.()
}

/** The session cards a page holds, by testID. */
const pageCards = (i: number) =>
  within(screen.getByTestId(`home-trainings-page-${i}`))
    .queryAllByTestId(/^training-t-[a-z]+-\d{4}-\d\d-\d\d$/)
    .map((el) => el.props.testID)

describe('l’accueil', () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}))

  it('un seul carrousel, les deux sortes mêlées dans l’ordre des dates, une séance par page', () => {
    render(<NextTrainingSection />)
    measure()
    expect(pageCards(0)).toEqual(['training-t-mardi-2026-09-29'])
    expect(pageCards(1)).toEqual(['training-t-dirige-2026-09-30'])
    // The Tuesday called off stays in the row, saying so.
    expect(screen.getByTestId('training-cancelled-t-mardi-2026-10-06')).toHaveTextContent('Annulée — Gymnase fermé')
    // Five sessions, then the « more » card: six pages.
    expect(screen.getByTestId('home-trainings-page-5')).toBeTruthy()
    expect(screen.queryByTestId('home-trainings-page-6')).toBeNull()
    expect(screen.getByTestId('home-trainings-dots')).toBeTruthy()
  })

  it('deux par page sur une tablette, la dernière portant ce qui reste', () => {
    setWindowSize(TABLET_SMALL)
    render(<NextTrainingSection />)
    measure(760)
    expect(pageCards(0)).toEqual(['training-t-mardi-2026-09-29', 'training-t-dirige-2026-09-30'])
    expect(pageCards(1)).toEqual(['training-t-mardi-2026-10-06', 'training-t-mardi-2026-10-13'])
    expect(pageCards(2)).toEqual(['training-t-mardi-2026-10-20'])
    // The fifth shares its page with the « more » card, and every card is half the block.
    expect(within(screen.getByTestId('home-trainings-page-2')).getByTestId('home-trainings-more')).toBeTruthy()
    expect(screen.getByTestId('home-trainings-more')).toHaveStyle({ width: (760 - 12) / 2 })
    expect(screen.queryByTestId('home-trainings-page-3')).toBeNull()
  })

  it('dit qu’un créneau continue, sans compte que personne ne lit', () => {
    render(<NextTrainingSection />)
    measure()
    expect(screen.getByTestId('home-next-training')).not.toHaveTextContent(/à venir/)
    const more = screen.getByTestId('home-trainings-more')
    expect(more).toHaveTextContent(/Et les suivantes/)
    fireEvent.press(more)
    expect(mockPush).toHaveBeenCalledWith('/entrainements')
  })

  it('compte ce qui reste quand chaque série a une fin', () => {
    mockData.trainings = [dirige]
    mockData.trainingSessions = ['2026-09-30', '2026-10-07', '2026-10-14', '2026-11-04', '2026-12-02', '2026-12-09', '2027-01-13']
      .map((date) => ({ trainingId: 't-dirige', date, cancelled: false }))
    render(<NextTrainingSection />)
    measure()
    expect(screen.getByTestId('home-trainings-more')).toHaveTextContent(/\+2.*2 autres séances à venir/)
  })

  it('s’arrête sur la dernière séance quand il n’y en a pas plus de cinq', () => {
    mockData.trainings = [dirige]
    render(<NextTrainingSection />)
    measure()
    expect(pageCards(0)).toEqual(['training-t-dirige-2026-09-30'])
    expect(screen.queryByTestId('home-trainings-more')).toBeNull()
    // One card: not a carousel.
    expect(screen.queryByTestId('home-trainings-page-1')).toBeNull()
  })

  it('prend la hauteur de la page affichée, pas celle de la plus haute', () => {
    render(<NextTrainingSection />)
    measure()
    const layout = (id: string, height: number) =>
      fireEvent(screen.getByTestId(id), 'layout', { nativeEvent: { layout: { width: 343, height } } })
    layout('home-trainings-page-0', 96)
    // The guided session, with its « Ma disponibilité », is taller.
    layout('home-trainings-page-1', 140)
    const pager = () => screen.getByTestId('home-trainings-pager')
    const height = () => [pager().props.style].flat(Infinity).reduce((h, st) => st?.height ?? h, undefined)
    expect(height()).toBe(96)
    fireEvent(pager(), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 343 } } })
    expect(height()).toBe(140)
  })

  it('demande « Ma disponibilité » sur la séance dirigée, comme la carte du match', () => {
    render(<NextTrainingSection />)
    measure()
    expect(screen.getByText('Ma disponibilité')).toBeTruthy()
    // The match card's own control, not a copy of it — and a regular evening asks nothing.
    expect(screen.UNSAFE_getAllByType(MyAvailability)).toHaveLength(1)
    fireEvent.press(screen.getByTestId('training-answer-t-dirige-2026-09-30-available'))
    expect(fns.setTrainingAvailability).toHaveBeenCalledWith('t-dirige', '2026-09-30', 'p2', 'available')
  })

  it('ajoute cette séance, ou toute la série, à l’agenda', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    render(<NextTrainingSection />)
    measure()
    fireEvent.press(screen.getByTestId('training-calendar-t-dirige-2026-09-30'))
    pressAlert('Cette séance')
    expect(openMatchInCalendar).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dirigé jeunes' }))
    fireEvent.press(screen.getByTestId('training-calendar-t-dirige-2026-09-30'))
    pressAlert('Toute la série')
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/api\/trainings\/t-dirige\/calendar\.ics\?token=tok$/))
  })

  it('ne propose pas l’agenda pour un créneau libre, qui revient chaque semaine', () => {
    render(<NextTrainingSection />)
    measure()
    expect(screen.queryByTestId('training-calendar-t-mardi-2026-09-29')).toBeNull()
  })

  it('ne donne que le créneau libre à qui aucune séance dirigée n’attend', () => {
    mockAuth.user = member('p1', 'Quentin', 'Colle')
    render(<NextTrainingSection />)
    measure()
    expect(screen.getByTestId('training-t-mardi-2026-09-29')).toBeTruthy()
    expect(screen.queryByTestId('training-t-dirige-2026-09-30')).toBeNull()
  })

  it('mène à tous les entraînements, en bas', () => {
    render(<NextTrainingSection />)
    fireEvent.press(screen.getByTestId('home-all-trainings'))
    expect(mockPush).toHaveBeenCalledWith('/entrainements')
  })

  it('n’offre pas d’annuler depuis l’accueil, même à un administrateur', () => {
    mockAuth.user = member('p2', 'Enzo', 'Lotz', { role: 'club_admin' })
    render(<NextTrainingSection />)
    measure()
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

describe('l’onglet Club — les séries du club', () => {
  it('les liste, avec qui les tient, et mène à leurs séances', () => {
    mockData.trainings = [mardi, { ...dirige, managerIds: ['p1'] }]
    render(<ClubScreen />)
    const section = screen.getByTestId('club-trainings')
    expect(section).toHaveTextContent(/Tous les mardis, 20h – 22h/)
    expect(section).toHaveTextContent(/Responsable : Quentin Colle/)
    fireEvent.press(screen.getByTestId('club-training-t-dirige'))
    expect(mockPush).toHaveBeenCalledWith('/entrainements')
    // A member reads, and runs nothing.
    expect(screen.queryByTestId('club-training-new')).toBeNull()
    expect(screen.queryByTestId('club-training-edit-t-mardi')).toBeNull()
    expect(screen.queryByTestId('club-training-dates-t-dirige')).toBeNull()
  })

  it('épargne la section à un membre d’un club qui n’en publie aucune', () => {
    mockData.trainings = []
    render(<ClubScreen />)
    expect(screen.queryByTestId('club-trainings')).toBeNull()
  })
})

describe('l’onglet Club — tenir les séries depuis l’app', () => {
  const admin = () => { mockAuth.user = member('ca', 'Virginie', 'Barlinge', { role: 'club_admin', isPlayer: false }) }
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}))

  it('crée un créneau libre : type, nom, jour, heure', async () => {
    admin()
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-new'))
    fireEvent.press(screen.getByTestId('training-kind-regular'))
    fireEvent.changeText(screen.getByTestId('training-name'), 'Loisirs du jeudi')
    fireEvent.press(screen.getByTestId('training-weekday-4'))
    // 20h by default, an hour later; the end stays two hours after 20h.
    fireEvent.press(screen.getByTestId('training-start-plus'))
    expect(screen.getByTestId('training-start-value')).toHaveTextContent('21h')
    fireEvent.press(screen.getByTestId('training-start-min-30'))
    fireEvent.press(screen.getByTestId('training-group-g-jeunes'))
    fireEvent.press(screen.getByTestId('training-editor-save'))
    await screen.findByTestId('club-trainings')
    expect(fns.addTraining).toHaveBeenCalledWith(CLUB, expect.objectContaining({
      kind: 'regular', displayName: 'Loisirs du jeudi', weekday: 4, startTime: '21:30', endTime: '22:00',
      memberGroupIds: ['g-jeunes'], managerIds: [],
    }))
    expect(fns.addTrainingDates).not.toHaveBeenCalled()
  })

  it('crée une série dirigée sur des dates cochées, avec son responsable', async () => {
    admin()
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-new'))
    fireEvent.changeText(screen.getByTestId('training-name'), 'Dirigé adultes')
    fireEvent.changeText(screen.getByTestId('training-manager-search'), 'lotz')
    fireEvent.press(screen.getByTestId('training-manager-add-p2'))
    expect(screen.getByTestId('training-manager-p2')).toBeTruthy()
    // No date yet: nothing to save.
    expect(screen.getByTestId('training-editor-save').props.accessibilityState).toEqual({ disabled: true })
    fireEvent.press(screen.getByTestId('training-dates-mode-pick'))
    expect(screen.getByTestId('training-dates-calendar-month')).toHaveTextContent('Septembre 2026')
    fireEvent.press(screen.getByTestId('training-dates-calendar-2026-09-29'))
    fireEvent.press(screen.getByTestId('training-dates-calendar-next'))
    fireEvent.press(screen.getByTestId('training-dates-calendar-2026-10-08'))
    expect(screen.getByTestId('training-dates-count')).toHaveTextContent(/^2 séances/)
    fireEvent.press(screen.getByTestId('training-editor-save'))
    await screen.findByTestId('club-trainings')
    expect(fns.addTraining).toHaveBeenCalledWith(CLUB, expect.objectContaining({
      kind: 'guided', displayName: 'Dirigé adultes', managerIds: ['p2'],
    }))
    expect(fns.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-new', ['2026-09-29', '2026-10-08'])
  })

  it('pose une course hebdomadaire de dates', async () => {
    admin()
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-new'))
    fireEvent.changeText(screen.getByTestId('training-name'), 'Dirigé')
    fireEvent.press(screen.getByTestId('training-first-date'))
    fireEvent.press(screen.getByTestId('training-first-date-calendar-2026-09-30'))
    fireEvent.press(screen.getByTestId('training-repeat-until'))
    fireEvent.press(screen.getByTestId('training-repeat-until-calendar-next'))
    fireEvent.press(screen.getByTestId('training-repeat-until-calendar-2026-10-14'))
    expect(screen.getByTestId('training-dates-count')).toHaveTextContent(/^3 séances/)
    fireEvent.press(screen.getByTestId('training-editor-save'))
    await screen.findByTestId('club-trainings')
    expect(fns.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-new', ['2026-09-30', '2026-10-07', '2026-10-14'])
  })

  it('garde la feuille ouverte sur un refus, et dit pourquoi', async () => {
    admin()
    fns.addTraining.mockResolvedValueOnce({ ok: false, message: 'Vérifiez les horaires : la fin doit suivre le début.' })
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-new'))
    fireEvent.press(screen.getByTestId('training-kind-regular'))
    fireEvent.changeText(screen.getByTestId('training-name'), 'Libre')
    fireEvent.press(screen.getByTestId('training-editor-save'))
    expect(await screen.findByTestId('training-editor-error')).toHaveTextContent(/horaires/)
    expect(screen.getByTestId('training-editor')).toBeTruthy()
  })

  it('modifie une série, sans en changer le type', async () => {
    admin()
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-edit-t-mardi'))
    expect(screen.queryByTestId('training-kind-guided')).toBeNull()
    expect(screen.getByTestId('training-name').props.value).toBe('Libre du mardi')
    fireEvent.changeText(screen.getByTestId('training-name'), 'Libre du mardi soir')
    fireEvent.press(screen.getByTestId('training-editor-save'))
    await screen.findByTestId('club-trainings')
    expect(fns.updateTraining).toHaveBeenCalledWith(CLUB, 't-mardi', expect.objectContaining({
      displayName: 'Libre du mardi soir', weekday: 2, startTime: '20:00', endTime: '22:00',
    }))
  })

  it('supprime après avoir demandé', () => {
    admin()
    render(<ClubScreen />)
    fireEvent.press(screen.getByTestId('club-training-delete-t-mardi'))
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as Array<{ text: string; onPress?: () => void }>
    expect(fns.deleteTraining).not.toHaveBeenCalled()
    buttons.find((b) => b.text === 'Supprimer')?.onPress?.()
    expect(fns.deleteTraining).toHaveBeenCalledWith(CLUB, 't-mardi')
  })

  it('laisse au responsable d’une série ses dates, et rien d’autre', () => {
    mockAuth.user = member('coach', 'Julien', 'Coach')
    render(<ClubScreen />)
    expect(screen.queryByTestId('club-training-new')).toBeNull()
    expect(screen.queryByTestId('club-training-edit-t-dirige')).toBeNull()
    expect(screen.queryByTestId('club-training-dates-t-mardi')).toBeNull()
    fireEvent.press(screen.getByTestId('club-training-dates-t-dirige'))
    fireEvent.press(screen.getByTestId('training-dates-mode-pick'))
    // The date the series has is shown, not offered.
    expect(screen.getByTestId('training-dates-calendar-2026-09-30').props.accessibilityState)
      .toEqual({ selected: false, disabled: true })
    fireEvent.press(screen.getByTestId('training-dates-calendar-2026-09-29'))
    fireEvent.press(screen.getByTestId('training-dates-save'))
    expect(fns.addTrainingDates).toHaveBeenCalledWith(CLUB, 't-dirige', ['2026-09-29'])
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
