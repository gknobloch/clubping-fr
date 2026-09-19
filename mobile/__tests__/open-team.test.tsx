import { Text, TouchableOpacity } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import { useOpenTeam } from '@/utils/openFiche'

// ---------------------------------------------------------------------------
// Où mène une équipe nommée ailleurs (#585)
//
// Three call sites pushed `/team/:id` whatever the width — the matrice, la
// fiche d'un licencié, «tous les matchs». On a tablet that is #582 exactly: a
// fiche alone in a column, with the list it belongs to left behind on another
// tab.
//
// The rule is four lines, which is why it has to live in one place rather than
// be retyped at each of them.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

function Opener() {
  const openTeam = useOpenTeam()
  return (
    <TouchableOpacity testID="open" onPress={() => openTeam('t1')}>
      <Text>Ouvrir</Text>
    </TouchableOpacity>
  )
}

function press() {
  render(<Opener />, { metrics: TABLET })
  fireEvent.press(screen.getByTestId('open'))
}

beforeEach(() => mockPush.mockClear())
afterEach(resetWindowSize)

it.each([
  ['une tablette couchée', TABLET_LANDSCAPE],
  ['une tablette debout', TABLET_SMALL],
])('sélectionne l’équipe dans sa section, sur %s', (_name, size) => {
  setWindowSize(size)

  press()

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/equipes',
    params: { selected: 't1' },
  })
})

it('pousse la fiche sur un téléphone, comme toujours', () => {
  // Pas de liste à côté de laquelle atterrir : la fiche poussée est la bonne
  // réponse, et c'est ce que la pile `(detail)` sert.
  setWindowSize(PHONE_WIDTH)

  press()

  expect(mockPush).toHaveBeenCalledWith('/team/t1')
})
