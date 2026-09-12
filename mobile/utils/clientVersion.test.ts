import { clientVersionFloor, resetClientVersionFloor } from './clientVersion'
import { dataHeaders, setSessionToken } from './api'

// The transport half of #508: what the client says about itself, and what it
// does with an answer it does not get. The rule that turns a floor into a
// verdict is pinned in src/lib/clientVersion.spec.ts, with no network in it.

jest.mock('@/constants/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8788',
  IS_PRODUCTION_API: false,
  apiUrl: (path: string) => `http://127.0.0.1:8788/api${path}`,
  CLIENT_VERSION: '1.3.0',
  CLIENT_VERSION_HEADER: 'X-Client-Version',
  clientHeaders: () => ({ 'X-Client-Version': '1.3.0' }),
}))

const mockFetch = jest.fn()

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  resetClientVersionFloor()
})

afterEach(() => {
  setSessionToken(null)
})

describe('the client names itself (#508)', () => {
  // It cannot be added to a binary already in the wild, which is why it ships
  // before anything reads it.
  it('sends its version on data requests, signed in or not', () => {
    expect(dataHeaders()['X-Client-Version']).toBe('1.3.0')
    setSessionToken('tok')
    expect(dataHeaders()['X-Client-Version']).toBe('1.3.0')
  })

  it('does not displace the headers a caller sets itself', () => {
    const headers = dataHeaders({ 'Content-Type': 'application/json' })
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Client-Version']).toBe('1.3.0')
  })

  it('sends it when asking for the floor too', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await clientVersionFloor()
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ 'X-Client-Version': '1.3.0' })
  })
})

describe('fetching the floor (#508)', () => {
  it('reads what the server published', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ minSupported: '1.2.0', latest: '1.4.0' }),
    })
    expect(await clientVersionFloor()).toEqual({ minSupported: '1.2.0', latest: '1.4.0' })
  })

  // Two components ask — the banner and the blocking screen — and they have to
  // agree. One request per launch is also what stops a boot with no network
  // retrying on every render.
  it('asks once per launch, however many callers there are', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ latest: '1.4.0' }) })
    const [a, b] = await Promise.all([clientVersionFloor(), clientVersionFloor()])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })
})

// Silence is never a refusal. This is the property the whole feature rests on:
// the app is opened in gymnasium basements with no signal (#387), and a gate
// that treated a failed request as "you are blocked" would be worse than the
// bug it exists to contain.
describe('the floor fails open (#508)', () => {
  it('returns nothing when the request rejects', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))
    expect(await clientVersionFloor()).toBeNull()
  })

  it('returns nothing on a refusal', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    expect(await clientVersionFloor()).toBeNull()
  })

  it('returns nothing when the body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })
    expect(await clientVersionFloor()).toBeNull()
  })

  it('returns nothing when the body is JSON but not an object', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => 'nope' })
    expect(await clientVersionFloor()).toBeNull()
  })
})
