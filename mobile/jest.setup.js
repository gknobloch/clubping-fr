// AsyncStorage is a native module: without a mock every call rejects with
// "NativeModule: AsyncStorage is null". This is the official in-memory mock
// shipped by the package, so the offline cache exercises its real code path
// (JSON round-trip included) rather than a hand-written stub.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
