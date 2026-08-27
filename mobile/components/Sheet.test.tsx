import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import { render } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import { DIALOG_MAX_WIDTH, Sheet } from './Sheet'

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
