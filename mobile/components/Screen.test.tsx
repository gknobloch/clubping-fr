import { screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import { PHONE, PHONE_LANDSCAPE, render } from '@/__tests__/support/render'
import { CONTENT_MAX_WIDTH } from '@/constants/layout'
import { Screen, contentWidth } from './Screen'

// ---------------------------------------------------------------------------
// The frame every screen sits in (#446): the horizontal safe-area insets #445
// gave the header and the tab bar but not the screens between them, and the
// reading-width cap that is most of what makes a tablet legible.
// ---------------------------------------------------------------------------
const frameStyle = () => StyleSheet.flatten(screen.getByTestId('screen').props.style)

it('takes no horizontal padding where there is no notch beside it', () => {
  render(<Screen><Text>Journées</Text></Screen>, { metrics: PHONE })

  expect(frameStyle().paddingLeft).toBe(0)
  expect(frameStyle().paddingRight).toBe(0)
})

it('keeps a screen clear of a landscape notch', () => {
  // #445 moved the header and the tab bar off it and left the content between
  // them running underneath — this is the piece that was missing.
  render(<Screen><Text>Journées</Text></Screen>, { metrics: PHONE_LANDSCAPE })

  expect(frameStyle().paddingLeft).toBe(59)
  expect(frameStyle().paddingRight).toBe(59)
})

it('lets a screen add to its frame without losing the insets', () => {
  render(
    <Screen style={{ backgroundColor: 'rebeccapurple' }}><Text>Journées</Text></Screen>,
    { metrics: PHONE_LANDSCAPE },
  )

  expect(frameStyle().backgroundColor).toBe('rebeccapurple')
  expect(frameStyle().paddingLeft).toBe(59)
})

it('leaves the insets to the screen around it when it is only a pane', () => {
  // A two-pane section frames itself once (#447). The fiche in the right-hand
  // pane taking the window's insets again would push it in by a notch that is
  // nowhere near it — the left one belongs to the list beside it.
  render(<Screen pane><Text>Rixheim PPA 2</Text></Screen>, { metrics: PHONE_LANDSCAPE })

  const style = StyleSheet.flatten(screen.getByTestId('pane').props.style)
  expect(style.paddingLeft).toBeUndefined()
  expect(style.paddingRight).toBeUndefined()
  // Still a frame: it fills what it is given, on the app's background.
  expect(style.flex).toBe(1)
})

describe('contentWidth', () => {
  it('caps a column of content at a reading width and centres it', () => {
    const style = StyleSheet.flatten(contentWidth())

    expect(style.maxWidth).toBe(CONTENT_MAX_WIDTH)
    expect(style.alignSelf).toBe('center')
    // Without this the container shrinks to its content on a phone, where
    // there is nothing to cap.
    expect(style.width).toBe('100%')
  })

  it('gives a grid one reading width per column', () => {
    expect(StyleSheet.flatten(contentWidth(2)).maxWidth).toBe(CONTENT_MAX_WIDTH * 2)
  })
})
