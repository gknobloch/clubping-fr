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

// Only ever reached by the (currently hidden) Apple button; the mock exists so
// importing AuthContext doesn't pull the native module in.
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))
