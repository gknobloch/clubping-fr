import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import { Modal } from 'react-native'
import { render, PHONE_LANDSCAPE } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import { DIALOG_MAX_WIDTH, Sheet, WIDE_DIALOG_MAX_WIDTH, sheetContentWidth } from './Sheet'

// ---------------------------------------------------------------------------
// The app's one modal container (#446). Three screens carried the same
// bottom-sheet twenty lines, which on a tablet is a band across the foot of a
// 1024pt slab. Above the threshold it becomes a centred dialog instead.
// ---------------------------------------------------------------------------
const onClose = jest.fn()

beforeEach(() => onClose.mockClear())
afterEach(resetWindowSize)

function renderSheet() {
  render(
    <Sheet onClose={onClose}>
      <Text>Feuille de match</Text>
    </Sheet>,
  )
}

const panel = () => StyleSheet.flatten(screen.getByTestId('sheet').props.style)
const backdrop = () => StyleSheet.flatten(screen.getByTestId('sheet-backdrop').props.style)

describe('on a phone', () => {
  beforeEach(() => {
    setWindowSize(PHONE_WIDTH)
    renderSheet()
  })

  it('rises from the bottom edge, full width, rounded at the top', () => {
    expect(backdrop().justifyContent).toBe('flex-end')
    expect(panel().borderTopLeftRadius).toBe(20)
    expect(panel().maxWidth).toBeUndefined()
  })

  it('wears the grab handle that says so', () => {
    expect(screen.getByTestId('sheet-handle')).toBeTruthy()
  })
})

describe('on a tablet', () => {
  beforeEach(() => {
    setWindowSize(TABLET_LARGE)
    renderSheet()
  })

  it('becomes a dialog, centred and capped', () => {
    expect(backdrop().justifyContent).toBe('center')
    expect(backdrop().alignItems).toBe('center')
    expect(panel().maxWidth).toBe(DIALOG_MAX_WIDTH)
  })

  it('rounds all four corners, having no edge to sit on', () => {
    expect(panel().borderRadius).toBe(20)
  })

  it('drops the grab handle, which was a story about the bottom edge', () => {
    expect(screen.queryByTestId('sheet-handle')).toBeNull()
  })
})

it('is a dialog at the narrow end of the tablet range too', () => {
  setWindowSize(TABLET_SMALL)
  renderSheet()

  expect(backdrop().justifyContent).toBe('center')
})

it('still closes on the backdrop once it is a dialog', () => {
  // Tapping the panel itself is held back by `onStartShouldSetResponder`, which
  // is a responder-system answer the test renderer has no way to give — the
  // simulator is the check for that half.
  setWindowSize(TABLET_LARGE)
  renderSheet()

  fireEvent.press(screen.getByTestId('sheet-backdrop'))

  expect(onClose).toHaveBeenCalled()
})

// The phase grid (#623): a sheet a phone is turned sideways to read.
describe('a sheet read sideways', () => {
  it('turns with the phone, where iOS would otherwise force it upright', () => {
    setWindowSize({ width: 844, height: 390 })
    render(
      <Sheet onClose={onClose} rotates dense>
        <Text>Grille</Text>
      </Sheet>,
      { metrics: PHONE_LANDSCAPE },
    )
    expect(screen.UNSAFE_getByType(Modal).props.supportedOrientations).toEqual([
      'portrait', 'landscape-left', 'landscape-right',
    ])
  })

  it('leaves every other sheet as it was', () => {
    setWindowSize(PHONE_WIDTH)
    renderSheet()
    expect(screen.UNSAFE_getByType(Modal).props.supportedOrientations).toBeUndefined()
  })

  it('gives the notch and the home indicator as its only margins when dense', () => {
    setWindowSize({ width: 844, height: 390 })
    render(
      <Sheet onClose={onClose} dense>
        <Text>Grille</Text>
      </Sheet>,
      { metrics: PHONE_LANDSCAPE },
    )
    expect(panel()).toMatchObject({ paddingTop: 8, paddingBottom: 21, paddingLeft: 59, paddingRight: 59 })
    expect(sheetContentWidth({ width: 844, isTablet: false, dense: true, insets: { left: 59, right: 59 } }))
      .toBe(844 - 118)
  })

  it('widens a dialog for a grid on a tablet', () => {
    setWindowSize(TABLET_LARGE)
    render(
      <Sheet onClose={onClose} wide>
        <Text>Grille</Text>
      </Sheet>,
    )
    expect(panel().maxWidth).toBe(WIDE_DIALOG_MAX_WIDTH)
  })
})
