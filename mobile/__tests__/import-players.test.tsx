import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { render } from '@/__tests__/support/render'
import type { PlayerImportWrites } from '@shared/lib/ffttPlayers'
import type { Club, Phase, Player, Role, User } from '@shared/types'
import ImportPlayersScreen from '@/app/(tabs)/joueurs/import'

// ---------------------------------------------------------------------------
// Importer les licenciés FFTT depuis l'app (#555)
//
// What is under test here is the screen: which licensees reach the deck, what
// a tick means, and what the button announces. What an import *writes* is
// `playerImportWrites`, tested with the rest of the rule in
// src/lib/ffttPlayers.spec.ts — this asserts that the screen hands that
// derivation the right review and never claims more than it wrote.
// ---------------------------------------------------------------------------
const mockAuth: { user: User | null } = { user: null }
// Typed on its argument so the assertions below can read the writes it was
// handed, which is the whole of what this screen is judged on.
const applyPlayerImport = jest.fn<Promise<void>, [PlayerImportWrites]>(async () => {})
const setClubSeasonLicences = jest.fn(async () => {})
const mockBack = jest.fn()

const mockData = {
  clubs: [] as Club[],
  phases: [] as Phase[],
  players: [] as Player[],
  playerPhasePoints: [] as never[],
  playerSeasonCategories: [] as never[],
  applyPlayerImport,
  setClubSeasonLicences,
}

// The deck is moved by a gesture, and a PanResponder's gestureState is built
// from a touch history no synthetic event carries — the same swap #552 makes
// on the match screen. What is under test is what the screen does with a
// swipe; that a swipe is one is `Pager.test.tsx`.
let mockSwipeHandler: ((direction: -1 | 1) => void) | null = null
jest.mock('@/components/Pager', () => ({
  ...jest.requireActual('@/components/Pager'),
  usePagerSwipe: (fn: (direction: -1 | 1) => void) => {
    mockSwipeHandler = fn
    return {}
  },
}))

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680011', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const phase: Phase = {
  id: 'ph1', seasonId: 's1', displayName: 'Phase 1', status: 'active',
} as Phase

/** One record of the real xml_licence_b.php?club=… answer. */
const record = (over: Partial<Record<string, string>> = {}) => {
  const f = {
    licence: '425881', nom: 'CANAQUE', prenom: 'Gregory',
    numclub: '06680011', nomclub: 'RIXHEIM PPA', point: '1731', cat: 'V40',
    ...over,
  }
  return `<licence><idlicence>1</idlicence><licence>${f.licence}</licence>`
    + `<nom>${f.nom}</nom><prenom>${f.prenom}</prenom><numclub>${f.numclub}</numclub>`
    + `<nomclub>${f.nomclub}</nomclub><point>${f.point}</point><cat>${f.cat}</cat></licence>`
}

const listing = (...records: string[]) => `<liste>${records.join('')}</liste>`

/** FFTT answering with this body, as `fetch` would from the app. */
const ffttAnswers = (xml: string) => {
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => xml })) as never
}

/**
 * FFTT answering one thing to `?club=` and another to `?licence=`.
 *
 * The two scopes hit the same endpoint with different query strings, and the
 * whole of #557 is that they must not be confused for one another.
 */
const ffttAnswersPerScope = (
  answers: { toClubListing: string; toLicenceLookup: string },
) => {
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    text: async () =>
      String(url).includes('licence=') ? answers.toLicenceLookup : answers.toClubListing,
  })) as never
}

/** Type a licence number in and press the search button. */
const searchLicence = async (licence: string) => {
  fireEvent.changeText(screen.getByTestId('import-licence-input'), licence)
  await act(async () => {
    fireEvent.press(screen.getByTestId('import-licence-search'))
  })
}

const signIn = (role: Role) => {
  mockAuth.user = { id: 'u1', role, isPlayer: false, clubId: 'c1' }
}

const held = (over: Partial<Player>): Player => ({
  id: 'p1', firstName: 'Gregory', lastName: 'Canaque', licenseNumber: '425881',
  phone: '', status: 'active', clubId: 'c1', ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSwipeHandler = null
  mockData.clubs = [club]
  mockData.phases = [phase]
  mockData.players = []
  mockData.playerPhasePoints = []
  mockData.playerSeasonCategories = []
  signIn('club_admin')
  ffttAnswers(listing(record()))
})

const openScreen = async () => {
  render(<ImportPlayersScreen />)
  await waitFor(() => expect(screen.getByTestId('import-apply')).toBeTruthy())
}

/** Spy on the confirmation, and answer it the way a finger would. */
const whenAsked = () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  return {
    /** The sentence the dialog put in front of the member. */
    said: () => alert.mock.calls[alert.mock.calls.length - 1]?.[1],
    press: (label: string) => {
      const buttons = alert.mock.calls[alert.mock.calls.length - 1]?.[2] ?? []
      buttons.find((b) => b.text === label)?.onPress?.()
    },
    alert,
  }
}

/** Tap Importer and confirm, as a member does. */
const importAndConfirm = async () => {
  const asked = whenAsked()
  fireEvent.press(screen.getByTestId('import-apply'))
  // The write is awaited inside the screen, so the state it lands on settles a
  // microtask later — outside the press, and outside React's own act scope.
  await act(async () => {
    asked.press('Importer')
  })
  return asked
}

describe("l'accès à l'import", () => {
  it('is refused to a player, who administers nobody', async () => {
    signIn('player')
    render(<ImportPlayersScreen />)

    expect(screen.getByText(/administrateurs du club/)).toBeTruthy()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('says so when the club has no FFTT affiliation number to ask about', () => {
    mockData.clubs = [{ ...club, affiliationNumber: '' }]
    render(<ImportPlayersScreen />)

    expect(screen.getByText(/numéro d'affiliation/)).toBeTruthy()
  })

  it('offers a retry rather than an empty deck when FFTT is unreachable', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as never
    render(<ImportPlayersScreen />)

    await waitFor(() => expect(screen.getByTestId('import-retry')).toBeTruthy())
  })
})

describe('le deck', () => {
  it('holds only the licensees with something to write', async () => {
    // Already ours, name for name and point for point: nothing to decide.
    mockData.players = [held({})]
    mockData.playerPhasePoints = [
      { phaseId: 'ph1', playerId: 'p1', points: '1731' },
    ] as never
    mockData.playerSeasonCategories = [
      { seasonId: 's1', playerId: 'p1', category: 'V40' },
    ] as never
    ffttAnswers(listing(record(), record({ licence: '392885', nom: 'CLEMENT', prenom: 'Didier' })))
    render(<ImportPlayersScreen />)

    await waitFor(() => expect(screen.getByTestId('import-card-392885')).toBeTruthy())
    expect(screen.queryByTestId('import-card-425881')).toBeNull()
    // Seen, and said so — not silently dropped.
    expect(screen.getByText('1 licencié est déjà à jour.')).toBeTruthy()
  })

  it('drops a licence FFTT returned for another club', async () => {
    ffttAnswers(listing(record(), record({ licence: '999999', numclub: '06680099' })))
    await openScreen()

    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
    expect(screen.queryByTestId('import-card-999999')).toBeNull()
  })

  it('counts who we hold that the FFTT listing does not mention, folded away', async () => {
    // A club of sixty routinely has fifty-three of these, and open they are
    // twenty lines of names between the review and the button.
    mockData.players = [held({ id: 'p9', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '111111' })]
    await openScreen()

    expect(screen.getByText('Absents de la liste FFTT (1)')).toBeTruthy()
    expect(screen.queryByTestId('import-missing-names')).toBeNull()
  })

  it('names them when the list is opened, and folds back', async () => {
    mockData.players = [held({ id: 'p9', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '111111' })]
    await openScreen()

    fireEvent.press(screen.getByTestId('import-missing-toggle'))
    expect(screen.getByTestId('import-missing-names')).toHaveTextContent('Ancien Membre')

    fireEvent.press(screen.getByTestId('import-missing-toggle'))
    expect(screen.queryByTestId('import-missing-names')).toBeNull()
  })
})

describe('le carrousel', () => {
  it('neither points nor invites a swipe when there is one card to review', async () => {
    await openScreen()

    expect(screen.queryByTestId('import-position')).toBeNull()
    expect(screen.queryByText(/Balayez/)).toBeNull()
    // The count still says what there is, in the singular.
    expect(screen.getByTestId('import-deck-count')).toHaveTextContent('1 licencié à revoir')
  })

  const three = () => listing(
    record(),
    record({ licence: '392885', nom: 'CLEMENT', prenom: 'Didier' }),
    record({ licence: '684545', nom: 'CERONI', prenom: 'Herve' }),
  )

  it('shows one licensee at a time, with a dot each', async () => {
    ffttAnswers(three())
    await openScreen()

    expect(screen.getByTestId('import-position').children).toHaveLength(3)
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
    expect(screen.queryByTestId('import-card-392885')).toBeNull()
  })

  it('says how big the job is before the first card', async () => {
    ffttAnswers(three())
    await openScreen()

    expect(screen.getByTestId('import-deck-count')).toHaveTextContent('3 licenciés à revoir')
  })

  it('counts the deck, not the ticks — the position counts against the same number', async () => {
    ffttAnswers(three())
    await openScreen()

    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    // Still three to review; what will be WRITTEN is the confirmation's to say.
    expect(screen.getByTestId('import-deck-count')).toHaveTextContent('3 licenciés à revoir')
  })

  it('counts in words for a club-sized deck, where dots cannot', async () => {
    // The real case: Rixheim lists sixty, and a row of sixty dots is a dotted
    // line with no current dot in it.
    const many = Array.from({ length: 40 }, (_, i) =>
      record({ licence: String(500000 + i), nom: `NOM${i}` }))
    ffttAnswers(listing(...many))
    await openScreen()

    expect(screen.getByTestId('import-deck-count')).toHaveTextContent('40 licenciés à revoir')
    expect(screen.getByTestId('import-position')).toHaveTextContent('1 / 40')

    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-position')).toHaveTextContent('2 / 40')

    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-position')).toHaveTextContent('3 / 40')
  })

  it('runs the position along as the finger does', async () => {
    ffttAnswers(three())
    await openScreen()
    expect(screen.getByTestId('import-position').children).toHaveLength(3)

    act(() => mockSwipeHandler?.(1))

    // Three dots still, the second one lit — the fraction takes over only past
    // `MAX_DOTS`, which is `Pager.test.tsx`'s business.
    expect(screen.getByTestId('import-card-392885')).toBeTruthy()
  })

  it('moves to the next card on a swipe, and back on the other one', async () => {
    ffttAnswers(three())
    await openScreen()

    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-card-392885')).toBeTruthy()

    act(() => mockSwipeHandler?.(-1))
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
  })

  it('stops at each end rather than wrapping round', async () => {
    ffttAnswers(three())
    await openScreen()

    act(() => mockSwipeHandler?.(-1))
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()

    act(() => mockSwipeHandler?.(1))
    act(() => mockSwipeHandler?.(1))
    act(() => mockSwipeHandler?.(1))
    expect(screen.getByTestId('import-card-684545')).toBeTruthy()
  })

  it('keeps every card in the count, not just the one on screen', async () => {
    // The confirmation answers for the whole deck: what is under the finger is
    // one card, what is being imported is all of them.
    ffttAnswers(three())
    await openScreen()
    const asked = whenAsked()

    fireEvent.press(screen.getByTestId('import-apply'))

    expect(asked.said()).toBe('3 licenciés créés.')
  })
})

// ---------------------------------------------------------------------------
// Chercher une licence, une seule (#557)
// ---------------------------------------------------------------------------
describe('la recherche par licence', () => {
  const OTHER = record({ licence: '684545', nom: 'CERONI', prenom: 'Herve' })

  beforeEach(() => {
    ffttAnswersPerScope({ toClubListing: listing(record()), toLicenceLookup: listing(OTHER) })
  })

  it('replaces the deck with the one licence it found', async () => {
    await openScreen()
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()

    await searchLicence('684545')

    expect(screen.getByTestId('import-card-684545')).toBeTruthy()
    expect(screen.queryByTestId('import-card-425881')).toBeNull()
  })

  it('records nothing about the season’s licences — one is not a listing (#488)', async () => {
    await openScreen()
    setClubSeasonLicences.mockClear()

    await searchLicence('684545')

    // That set is a REPLACEMENT for the club and season: writing it from a
    // single look-up would erase the other fifty-nine.
    expect(setClubSeasonLicences).not.toHaveBeenCalled()
  })

  it('drops the club-wide notes, which are sentences about a listing', async () => {
    mockData.players = [held({ id: 'p9', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '111111' })]
    await openScreen()
    expect(screen.getByTestId('import-missing')).toBeTruthy()

    await searchLicence('684545')

    expect(screen.queryByTestId('import-missing')).toBeNull()
  })

  it('refuses a licence that belongs to another club', async () => {
    ffttAnswersPerScope({
      toClubListing: listing(record()),
      toLicenceLookup: listing(record({ licence: '999999', numclub: '06880123', nomclub: 'ETIVAL' })),
    })
    await openScreen()

    await searchLicence('999999')

    expect(screen.getByTestId('import-search-message')).toHaveTextContent(/Etival/)
    // And the club's own review is untouched.
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
  })

  it('says so for an unknown number without costing the deck on screen', async () => {
    ffttAnswersPerScope({ toClubListing: listing(record()), toLicenceLookup: '<liste></liste>' })
    await openScreen()

    await searchLicence('000000')

    expect(screen.getByTestId('import-search-message')).toHaveTextContent('Aucun licencié pour ce numéro.')
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
  })

  it('says a licensee is already up to date, in the singular', async () => {
    // The club-wide sentence — "tout ce que la FFTT liste" — would be a claim
    // about sixty people made from looking at one.
    mockData.players = [held({ id: 'p2', firstName: 'Herve', lastName: 'Ceroni', licenseNumber: '684545' })]
    mockData.playerPhasePoints = [{ phaseId: 'ph1', playerId: 'p2', points: '1731' }] as never
    mockData.playerSeasonCategories = [{ seasonId: 's1', playerId: 'p2', category: 'V40' }] as never
    await openScreen()

    await searchLicence('684545')

    expect(screen.getByTestId('import-empty-deck'))
      .toHaveTextContent('Rien à écrire : ce licencié est déjà à jour.')
  })

  it('imports the found licence the same way as any other card', async () => {
    await openScreen()
    await searchLicence('684545')

    await importAndConfirm()

    await waitFor(() => expect(screen.getByTestId('import-done')).toBeTruthy())
    expect(applyPlayerImport.mock.calls[0][0].creates).toEqual([
      expect.objectContaining({ licenseNumber: '684545', clubId: 'c1' }),
    ])
  })

  it('goes back to the whole club, notes and all', async () => {
    mockData.players = [held({ id: 'p9', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '111111' })]
    await openScreen()
    await searchLicence('684545')
    expect(screen.queryByTestId('import-missing')).toBeNull()

    await act(async () => {
      fireEvent.press(screen.getByTestId('import-back-to-club'))
    })

    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
    expect(screen.getByTestId('import-missing')).toBeTruthy()
  })

  it('offers no search for an empty box', async () => {
    await openScreen()

    expect(screen.getByTestId('import-licence-search').props.accessibilityState.disabled).toBe(true)
  })
})

describe('la revue', () => {
  it('announces what the selection writes, counting a creation', async () => {
    await openScreen()
    const asked = whenAsked()

    fireEvent.press(screen.getByTestId('import-apply'))

    expect(asked.said()).toBe('1 licencié créé.')
  })

  it('writes nothing when the confirmation is declined', async () => {
    await openScreen()
    const asked = whenAsked()

    fireEvent.press(screen.getByTestId('import-apply'))
    await act(async () => {
      asked.press('Annuler')
    })

    expect(applyPlayerImport).not.toHaveBeenCalled()
    expect(screen.queryByTestId('import-done')).toBeNull()
  })

  it('drops a licensee out of the count when they are ignored', async () => {
    await openScreen()

    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    // Nothing left to write, so there is nothing to confirm either.
    expect(screen.getByText('Rien de sélectionné')).toBeTruthy()
    expect(screen.getByTestId('import-apply').props.accessibilityState.disabled).toBe(true)
  })

  it('takes an ignored licensee back, whole', async () => {
    await openScreen()
    fireEvent.press(screen.getByTestId('import-ignore-425881'))

    fireEvent.press(screen.getByTestId('import-ignore-425881'))
    const asked = whenAsked()
    fireEvent.press(screen.getByTestId('import-apply'))

    expect(asked.said()).toBe('1 licencié créé.')
  })

  it('unticks one field without touching the rest of the card', async () => {
    mockData.players = [held({ lastName: 'Canac' })]
    await openScreen()

    fireEvent.press(screen.getByTestId('import-field-425881-lastName'))

    // Still an update — the points and the category are still ticked.
    const asked = await importAndConfirm()
    expect(asked.said()).toBe('1 mis à jour.')
    await waitFor(() => expect(applyPlayerImport).toHaveBeenCalled())
    expect(applyPlayerImport.mock.calls[0][0]).toMatchObject({ updates: [] })
  })
})

describe("l'import", () => {
  it('writes the selection and reports what landed', async () => {
    await openScreen()

    await importAndConfirm()

    await waitFor(() => expect(screen.getByTestId('import-done')).toBeTruthy())
    expect(screen.getByText('1 licencié créé.')).toBeTruthy()
    const writes = applyPlayerImport.mock.calls[0][0]
    expect(writes.creates).toHaveLength(1)
    expect(writes.creates[0]).toMatchObject({ licenseNumber: '425881', clubId: 'c1' })
    // Points on the phase, the category on its season (#482).
    expect(writes.points[0]).toMatchObject({ phaseId: 'ph1' })
    expect(writes.categories[0]).toMatchObject({ seasonId: 's1' })
  })

  it('claims nothing when the writes did not land, and keeps the review', async () => {
    applyPlayerImport.mockRejectedValueOnce(new Error('HTTP 500'))
    await openScreen()

    const asked = await importAndConfirm()

    await waitFor(() =>
      expect(asked.alert).toHaveBeenCalledWith('Import interrompu', expect.any(String)),
    )
    expect(screen.queryByTestId('import-done')).toBeNull()
    // The review is still there, ticks and all.
    expect(screen.getByTestId('import-card-425881')).toBeTruthy()
  })

  it('records who the federation listed, for the season (#488)', async () => {
    mockData.players = [held({})]
    await openScreen()

    expect(setClubSeasonLicences).toHaveBeenCalledWith('c1', 's1', ['p1'])
  })
})
