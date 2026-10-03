import { fireEvent, screen, within } from '@testing-library/react-native'
import { Modal, StyleSheet, Text } from 'react-native'
import { render, PHONE_LANDSCAPE } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  TABLET_LARGE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import {
  DIALOG_MAX_WIDTH,
  MODAL_ORIENTATIONS,
  SHEET_MAX_WIDTH,
  SIDEWAYS_GAP,
  Sheet,
  WIDE_DIALOG_MAX_WIDTH,
  sheetContentWidth,
} from './Sheet'

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
/** What lays the panel out: the dimmed screen, its padding, where the panel sits. */
const frame = () => StyleSheet.flatten(screen.getByTestId('sheet-frame').props.style)

describe('on a phone', () => {
  beforeEach(() => {
    setWindowSize(PHONE_WIDTH)
    renderSheet()
  })

  it('rises from the bottom edge, full width, rounded at the top', () => {
    expect(frame().justifyContent).toBe('flex-end')
    expect(panel().borderTopLeftRadius).toBe(20)
    // The reading-column cap is wider than any phone standing up.
    expect(panel().width).toBe('100%')
    expect(SHEET_MAX_WIDTH).toBeGreaterThan(PHONE_WIDTH.width)
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
    expect(frame().justifyContent).toBe('center')
    expect(frame().alignItems).toBe('center')
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

  expect(frame().justifyContent).toBe('center')
})

it('still closes on the backdrop once it is a dialog', () => {
  setWindowSize(TABLET_LARGE)
  renderSheet()

  fireEvent.press(screen.getByTestId('sheet-backdrop'))

  expect(onClose).toHaveBeenCalled()
})

// ---------------------------------------------------------------------------
// A sheet scrolls from wherever the finger lands (#625). The backdrop used to
// wrap the panel, so the panel claimed every touch to keep a tap on it from
// closing the sheet — and the view holding the responder kept the drag from
// the scroll view under it. A sheet scrolled only from a button. The simulator
// is what showed it; here the structure that makes it impossible is pinned.
// ---------------------------------------------------------------------------
describe('the backdrop sits behind the panel, not around it', () => {
  beforeEach(() => {
    setWindowSize(PHONE_WIDTH)
    renderSheet()
  })

  it('holds nothing: the panel is its sibling', () => {
    expect(within(screen.getByTestId('sheet-backdrop')).queryByTestId('sheet')).toBeNull()
    expect(within(screen.getByTestId('sheet-frame')).getByTestId('sheet')).toBeTruthy()
  })

  it('leaves the touch to whatever is in the panel', () => {
    expect(screen.getByTestId('sheet').props.onStartShouldSetResponder).toBeUndefined()
  })

  it('so a tap on the panel no longer reaches it', () => {
    fireEvent.press(screen.getByText('Feuille de match'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('and a tap on it still closes the sheet', () => {
    fireEvent.press(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('is a button VoiceOver can name, rather than a label made of every line', () => {
    // Wrapping the panel, it was one element whose label ran the whole sheet
    // together. Behind it, it is the way out — the only one some sheets have.
    expect(screen.getByRole('button', { name: 'Fermer' })).toBe(screen.getByTestId('sheet-backdrop'))
  })
})

// ---------------------------------------------------------------------------
// A phone on its side (#625). iOS presents a `Modal` portrait-only unless told
// otherwise, so every sheet turned the screen upright under the member's
// hands; and the panel was laid out for 844pt of height and no notch.
// ---------------------------------------------------------------------------
const SIDEWAYS = { width: PHONE_LANDSCAPE.frame.width, height: PHONE_LANDSCAPE.frame.height }

function renderSideways(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  setWindowSize(SIDEWAYS)
  render(
    <Sheet onClose={onClose} {...props}>
      <Text>Feuille de match</Text>
    </Sheet>,
    { metrics: PHONE_LANDSCAPE },
  )
}

const orientations = () => screen.UNSAFE_getByType(Modal).props.supportedOrientations

describe('every sheet turns with the device', () => {
  it('on a phone standing up', () => {
    setWindowSize(PHONE_WIDTH)
    renderSheet()
    expect(orientations()).toEqual(MODAL_ORIENTATIONS)
  })

  it('on a phone on its side', () => {
    renderSideways()
    expect(orientations()).toEqual(MODAL_ORIENTATIONS)
  })

  it('on a tablet, whichever way up — a shorter list than iOS’s default would take one away', () => {
    setWindowSize(TABLET_LANDSCAPE)
    renderSheet()
    // An iPad allows every orientation by default; naming three would have
    // pinned an upside-down slab the right way round.
    expect(orientations()).toEqual(
      expect.arrayContaining(['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']),
    )
  })
})

describe('a sheet on a phone on its side', () => {
  it('keeps the panel off the notch at either end', () => {
    renderSideways()
    expect(frame()).toMatchObject({ paddingLeft: 59, paddingRight: 59 })
  })

  it('stops at a reading column, centred, rather than spanning 844pt', () => {
    renderSideways()
    expect(panel()).toMatchObject({ width: '100%', maxWidth: SHEET_MAX_WIDTH, alignSelf: 'center' })
    expect(sheetContentWidth({ width: SIDEWAYS.width, isTablet: false, insets: PHONE_LANDSCAPE.insets }))
      .toBe(SHEET_MAX_WIDTH - 48)
  })

  it('takes the height bar a sliver, whatever share the caller asked for standing up', () => {
    // 60% of 390 is 234pt: shorter than three answers and their title.
    renderSideways({ maxHeight: '60%' })
    expect(panel().maxHeight).toBe(SIDEWAYS.height - SIDEWAYS_GAP)
  })

  it('pads its foot for a 21pt home indicator, not a 34pt one', () => {
    renderSideways()
    expect(panel().paddingBottom).toBe(24)
  })

  it('still wears the grab handle — it is still a sheet', () => {
    renderSideways()
    expect(screen.getByTestId('sheet-handle')).toBeTruthy()
    expect(frame().justifyContent).toBe('flex-end')
  })
})

describe('a sheet on a phone standing up is as it was', () => {
  beforeEach(() => {
    setWindowSize(PHONE_WIDTH)
    render(
      <Sheet onClose={onClose} maxHeight="60%">
        <Text>Feuille de match</Text>
      </Sheet>,
    )
  })

  it('keeps the share it was given', () => {
    expect(panel().maxHeight).toBe('60%')
  })

  it('keeps 40pt above the home indicator, and no side padding on the backdrop', () => {
    expect(panel().paddingBottom).toBe(40)
    expect(frame()).toMatchObject({ paddingLeft: 0, paddingRight: 0 })
  })
})

// The phase grid (#623): a sheet a phone is turned sideways to read.
describe('a dense sheet', () => {
  it('gives the notch and the home indicator as its only margins', () => {
    renderSideways({ dense: true })
    expect(panel()).toMatchObject({ paddingTop: 8, paddingBottom: 21, paddingLeft: 59, paddingRight: 59 })
    expect(sheetContentWidth({ width: 844, isTablet: false, dense: true, insets: { left: 59, right: 59 } }))
      .toBe(844 - 118)
  })

  it('takes the whole width: neither the column cap nor the backdrop’s safe padding', () => {
    renderSideways({ dense: true })
    expect(panel().maxWidth).toBeUndefined()
    expect(frame().paddingLeft).toBeUndefined()
  })

  it('takes the height bar the same sliver', () => {
    renderSideways({ dense: true })
    expect(panel().maxHeight).toBe(SIDEWAYS.height - SIDEWAYS_GAP)
  })
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

it('is not a sideways phone on a tablet on its side: still a dialog, at its own height', () => {
  setWindowSize(TABLET_LANDSCAPE)
  renderSheet()
  expect(frame().justifyContent).toBe('center')
  expect(panel().maxHeight).toBe('85%')
})
