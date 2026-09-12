import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { UnsupportedOverlay, UpdateBanner } from '@/components/VersionGate'
import { resetClientVersionFloor } from '@/utils/clientVersion'
import { render } from './support/render'

// The version gate as a member meets it (#508). Two faces, deliberately
// unalike: an invitation you brush aside, and a wall. What is pinned here is
// that each appears only for its own verdict — the one showing up in the
// other's case is the whole failure mode.

jest.mock('@/constants/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8788',
  IS_PRODUCTION_API: false,
  apiUrl: (path: string) => `http://127.0.0.1:8788/api${path}`,
  CLIENT_VERSION: '1.3.0',
  CLIENT_VERSION_HEADER: 'X-Client-Version',
  clientHeaders: () => ({ 'X-Client-Version': '1.3.0' }),
}))

const mockFetch = jest.fn()

/** The server publishing a given floor. */
function floor(body: Record<string, string> | null) {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body ?? {} })
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  resetClientVersionFloor()
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})

afterEach(() => {
  jest.restoreAllMocks()
})

const BANNER = /Une mise à jour est disponible/
const WALL = /Mise à jour requise/

describe('a build behind the latest (#508)', () => {
  it('is invited, not stopped', async () => {
    floor({ latest: '1.4.0' })

    render(
      <>
        <UpdateBanner />
        <UnsupportedOverlay />
      </>,
    )

    expect(await screen.findByText(BANNER)).toBeTruthy()
    expect(screen.queryByText(WALL)).toBeNull()
  })

  it('sends the member to the store when the bar is tapped', async () => {
    floor({ latest: '1.4.0' })
    render(<UpdateBanner />)

    fireEvent.press(await screen.findByText(BANNER))

    expect(Linking.openURL).toHaveBeenCalled()
  })

  // Dismissal lasts this launch and no longer. Persisting it would need a key
  // per version, and a nudge nobody ever sees again is not a nudge.
  it('can be brushed aside', async () => {
    floor({ latest: '1.4.0' })
    render(<UpdateBanner />)

    fireEvent.press(await screen.findByLabelText('Masquer'))

    await waitFor(() => expect(screen.queryByText(BANNER)).toBeNull())
  })
})

describe('a build below the floor (#508)', () => {
  it('is stopped, and not merely nudged', async () => {
    floor({ minSupported: '1.4.0', latest: '1.4.0' })

    render(
      <>
        <UpdateBanner />
        <UnsupportedOverlay />
      </>,
    )

    expect(await screen.findByText(WALL)).toBeTruthy()
    // Being refused is the stronger statement; two messages at once would let
    // the dismissible one speak for both.
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  it('offers the store, which is the only way out', async () => {
    floor({ minSupported: '1.4.0' })
    render(<UnsupportedOverlay />)

    fireEvent.press(await screen.findByText('Mettre à jour'))

    expect(Linking.openURL).toHaveBeenCalled()
  })
})

// The property the feature rests on, at the level a member would notice it:
// nothing the server fails to say can put a wall in front of them.
describe('the gate fails open (#508)', () => {
  const renderBoth = () =>
    render(
      <>
        <UpdateBanner />
        <UnsupportedOverlay />
      </>,
    )

  it('shows nothing when this build is current', async () => {
    floor({ minSupported: '1.0.0', latest: '1.3.0' })
    renderBoth()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(screen.queryByText(BANNER)).toBeNull()
    expect(screen.queryByText(WALL)).toBeNull()
  })

  it('shows nothing when no floor is published', async () => {
    floor(null)
    renderBoth()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(screen.queryByText(WALL)).toBeNull()
  })

  it('shows nothing when the server cannot be reached at all', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    renderBoth()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(screen.queryByText(WALL)).toBeNull()
    expect(screen.queryByText(BANNER)).toBeNull()
  })

  // The first frames of a cold start are not a blocking screen thrown up by a
  // request still in flight.
  it('shows nothing before the server has answered', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    renderBoth()

    expect(screen.queryByText(WALL)).toBeNull()
    expect(screen.queryByText(BANNER)).toBeNull()
  })
})
