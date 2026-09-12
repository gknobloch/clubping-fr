/* eslint-disable @typescript-eslint/no-require-imports --
 * These tests are about import TIMING, which a static import cannot express:
 * the module has to be loaded after jest.resetModules(), and loaded again per
 * case, so that the throwing mock is in place when it happens. A top-level
 * import would resolve once, before any of that — and would also throw at the
 * top of this very file, taking the suite down with it.
 */

// The regression this file exists for (#495): `expo-notifications` throws at
// IMPORT on Android in Expo Go since SDK 53 — before any function is called,
// so no guard around a call can help.
//
// `push.ts` is imported by AuthContext, and every screen imports AuthContext.
// So that throw did not disable notifications, it killed the app at launch: a
// red screen instead of the login form, on the client `npm start` and
// `start:pr` both use. The rest of the suite cannot see this, because
// jest.setup.js mocks the module into existence for every other file.
//
// Here it is made to throw exactly as it does there.

jest.mock('expo-notifications', () => {
  throw new Error(
    'expo-notifications: Android Push notifications (remote notifications) functionality ' +
      'provided by expo-notifications was removed from Expo Go with the release of SDK 53.',
  )
})

beforeEach(() => {
  jest.resetModules()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('when expo-notifications cannot be imported', () => {
  it('reports the module as absent instead of throwing', () => {
    const { Notifications, notificationsUnavailable } = require('@/utils/expoNotifications')
    expect(Notifications).toBeNull()
    expect(notificationsUnavailable).toContain('removed from Expo Go')
  })

  it('lets push.ts load, so AuthContext still loads', () => {
    // The actual regression: this import used to take the whole app with it.
    expect(() => require('@/utils/push')).not.toThrow()
  })

  it('lets the provider that every screen mounts under load', () => {
    expect(() => require('@/contexts/AuthContext')).not.toThrow()
  })

  it('declines registration with a reason rather than crashing', async () => {
    const { registerForPush } = require('@/utils/push')
    await expect(registerForPush()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'))
  })

  it('makes logging out a no-op rather than a failure', async () => {
    // Logout must not depend on a module that may not exist.
    const { forgetPush } = require('@/utils/push')
    await expect(forgetPush()).resolves.toBeUndefined()
  })

  it('renders the push component as nothing at all', () => {
    // It calls setNotificationHandler at module scope — the second import-time
    // throw hiding in this file.
    expect(() => require('@/components/PushNotifications')).not.toThrow()
  })
})
