import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { forgetPush, gameIdOf, registerForPush, setNotificationsEnabled } from '@/utils/push'
import { setSessionToken } from '@/utils/api'

// The device's side of push (#495). What matters here is not that a token was
// obtained — expo-notifications is mocked — but what the app does around it:
// that it never asks twice for a permission iOS only offers once, that the
// token is written down before it is sent (so logging out can give it back),
// and that a logout gives it back even when the request fails.

// jest-expo does not load app.json into Constants, and `getExpoPushTokenAsync`
// refuses to run without an EAS project id — so a build that has one is what
// these tests describe. The value is the one in app.json, and both sources it
// can come from are writable so the fallback can be exercised (#498).
const PROJECT_ID = '917d2d0b-d20e-412f-8ab4-a5f2177f635c'
const constants: { expoConfig: unknown; easConfig: unknown } = {
  expoConfig: { extra: { eas: { projectId: PROJECT_ID } } },
  easConfig: null,
}
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return constants
  },
}))

const ok = () => Promise.resolve(new Response('{}', { status: 200 }))

const perms = Notifications.getPermissionsAsync as jest.Mock
const ask = Notifications.requestPermissionsAsync as jest.Mock
const getToken = Notifications.getExpoPushTokenAsync as jest.Mock

/** The calls the app made, as (path, parsed body) pairs. */
function captureFetch(impl: () => Promise<Response> = ok) {
  const calls: Array<{ path: string; body: unknown; headers: Record<string, string> }> = []
  const spy = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({
      path: url.replace(/^https?:\/\/[^/]+/, ''),
      body: init.body ? JSON.parse(String(init.body)) : null,
      headers: (init.headers ?? {}) as Record<string, string>,
    })
    return impl()
  })
  global.fetch = spy as unknown as typeof fetch
  return calls
}

beforeEach(async () => {
  jest.clearAllMocks()
  constants.expoConfig = { extra: { eas: { projectId: PROJECT_ID } } }
  constants.easConfig = null
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  await AsyncStorage.clear()
  perms.mockResolvedValue({ granted: true, canAskAgain: true })
  ask.mockResolvedValue({ granted: true, canAskAgain: true })
  getToken.mockResolvedValue({ data: 'ExponentPushToken[test]' })
  setSessionToken('session-token')
})

afterEach(() => setSessionToken(null))

describe('registering the device', () => {
  it('sends the token and the platform, authenticated', async () => {
    const calls = captureFetch()
    await expect(registerForPush()).resolves.toBe('ExponentPushToken[test]')

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/notifications/push-tokens')
    expect(calls[0].body).toMatchObject({ token: 'ExponentPushToken[test]' })
    expect(calls[0].headers.Authorization).toBe('Bearer session-token')
  })

  it('does not ask again for a permission already granted', async () => {
    captureFetch()
    await registerForPush()
    expect(ask).not.toHaveBeenCalled()
  })

  it('does not re-prompt once the member has answered for good', async () => {
    // iOS offers exactly one prompt per install. Asking again does not raise
    // a second one, it just returns the refusal — but the code that expects a
    // prompt here is code that will one day nag on another platform.
    perms.mockResolvedValue({ granted: false, canAskAgain: false })
    const calls = captureFetch()

    await expect(registerForPush()).resolves.toBeNull()
    expect(ask).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('registers nothing when the member refuses the prompt', async () => {
    perms.mockResolvedValue({ granted: false, canAskAgain: true })
    ask.mockResolvedValue({ granted: false, canAskAgain: false })
    const calls = captureFetch()

    await expect(registerForPush()).resolves.toBeNull()
    expect(calls).toEqual([])
  })

  it('is a quiet no on a device with no push service', async () => {
    // A simulator. An ordinary state, not an error worth an alert.
    getToken.mockRejectedValue(new Error('no push service'))
    captureFetch()
    await expect(registerForPush()).resolves.toBeNull()
  })
})

describe('finding the EAS project id (#498)', () => {
  // `Constants.expoConfig` is typed `| null`, and with expo-updates configured
  // it comes from the embedded update manifest — which a build made locally
  // rather than by EAS does not have. The whole of app.json is then absent at
  // runtime, `getExpoPushTokenAsync` is never called, and the only symptom is
  // an empty push_tokens table. That is how this shipped once.
  it('falls back to easConfig when app.json did not survive the build', async () => {
    constants.expoConfig = null
    constants.easConfig = { projectId: PROJECT_ID }
    const calls = captureFetch()

    await expect(registerForPush()).resolves.toBe('ExponentPushToken[test]')
    expect(getToken).toHaveBeenCalledWith({ projectId: PROJECT_ID })
    expect(calls).toHaveLength(1)
  })

  it('prefers app.json when both are there', async () => {
    constants.easConfig = { projectId: 'stale-id' }
    captureFetch()

    await registerForPush()
    expect(getToken).toHaveBeenCalledWith({ projectId: PROJECT_ID })
  })

  it('gives up, loudly, when neither is', async () => {
    constants.expoConfig = null
    constants.easConfig = null
    const calls = captureFetch()

    await expect(registerForPush()).resolves.toBeNull()
    expect(getToken).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    // The point of #498: four exits that looked identical from outside.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no-project-id'))
  })
})

describe('saying which exit it took (#498)', () => {
  it('names a refusal', async () => {
    perms.mockResolvedValue({ granted: false, canAskAgain: false })
    captureFetch()
    await registerForPush()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('permission'))
  })

  it('names a platform that would not issue a token', async () => {
    getToken.mockRejectedValue(new Error('no push service'))
    captureFetch()
    await registerForPush()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no-device-token'))
  })

  it('names a backend that refused, with its status', async () => {
    captureFetch(() => Promise.resolve(new Response('{}', { status: 401 })))
    await registerForPush()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 401'))
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not-registered'))
  })
})

describe('handing the token back', () => {
  it('forgets the token the device actually registered', async () => {
    captureFetch()
    await registerForPush()

    const calls = captureFetch()
    await forgetPush()
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/notifications/push-tokens/forget')
    expect(calls[0].body).toEqual({ token: 'ExponentPushToken[test]' })
  })

  it('clears the stored token even when the request fails', async () => {
    captureFetch()
    await registerForPush()

    captureFetch(() => Promise.reject(new Error('offline')))
    await expect(forgetPush()).resolves.toBeUndefined()

    // Nothing left to send a second time: the phone must not believe it is
    // still registered under a member who has signed out.
    const calls = captureFetch()
    await forgetPush()
    expect(calls).toEqual([])
  })

  it('says nothing when the device never registered', async () => {
    const calls = captureFetch()
    await forgetPush()
    expect(calls).toEqual([])
  })
})

describe('the preference', () => {
  it('patches the member’s own setting', async () => {
    const calls = captureFetch()
    await setNotificationsEnabled(false)
    expect(calls[0].path).toBe('/api/notifications/preferences')
    expect(calls[0].body).toEqual({ enabled: false })
  })

  it('throws when the backend refused, so the switch can go back', async () => {
    captureFetch(() => Promise.resolve(new Response('{}', { status: 500 })))
    await expect(setNotificationsEnabled(false)).rejects.toThrow()
  })
})

describe('where a tap leads', () => {
  const response = (data: unknown) =>
    ({ notification: { request: { content: { data } } } }) as never

  it('reads the match id out of the payload', () => {
    expect(gameIdOf(response({ gameId: 'g1', kind: 'availability_request' }))).toBe('g1')
  })

  it('refuses to guess when there is none', () => {
    expect(gameIdOf(null)).toBeNull()
    expect(gameIdOf(response({}))).toBeNull()
    expect(gameIdOf(response({ gameId: 42 }))).toBeNull()
  })
})
