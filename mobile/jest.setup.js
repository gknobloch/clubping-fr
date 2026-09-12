// AsyncStorage is a native module: without a mock every call rejects with
// "NativeModule: AsyncStorage is null". This is the official in-memory mock
// shipped by the package, so the offline cache exercises its real code path
// (JSON round-trip included) rather than a hand-written stub.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// SecureStore is one too, and AuthContext reads it on every mount. In-memory,
// so a session written by a login is read back by the next mount.
jest.mock('expo-secure-store', () => {
  const store = new Map()
  return {
    getItemAsync: async (key) => (store.has(key) ? store.get(key) : null),
    setItemAsync: async (key, value) => {
      store.set(key, value)
    },
    deleteItemAsync: async (key) => {
      store.delete(key)
    },
  }
})

// @expo/vector-icons loads its font asynchronously and setStates when it lands
// — often after the test has finished, which React reports as an un-acted
// update. The icons carry no behaviour worth asserting, so render them inert
// and keep their name queryable.
jest.mock('@expo/vector-icons', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const iconSet = (family) => {
    const Icon = ({ name, ...props }) =>
      React.createElement(Text, { ...props, testID: props.testID ?? `icon-${name}` }, null)
    Icon.displayName = family
    return Icon
  }
  return { Ionicons: iconSet('Ionicons') }
})

// Only ever reached by the (currently hidden) Apple button; the mock exists so
// importing AuthContext doesn't pull the native module in.
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

// expo-notifications is a native module, and importing it in a test
// environment also trips its own auto-registration (which warns loudly about
// Expo Go). The mock is permissive by default — permission granted, a token
// returned — because that is the path the screens care about; a test that
// wants a refusal overrides the call it needs. (#495)
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}))
