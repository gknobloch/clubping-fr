import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearCache, readCache, writeCache } from './offlineCache'

// The key the module writes under. Duplicated on purpose: it is not exported,
// and the tests that reach into storage directly are precisely the ones that
// must break if it silently changes — an existing install would stop finding
// its cache.
const CACHE_KEY = 'pp-club-data-cache'

interface Payload {
  clubs: { id: string; name: string }[]
}

const payload: Payload = { clubs: [{ id: 'c1', name: 'Ping Club' }] }

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.restoreAllMocks()
})

describe('offlineCache (#144)', () => {
  it('round-trips a payload with its sync timestamp', async () => {
    await writeCache(payload, '2026-01-15T10:00:00.000Z')

    const cached = await readCache<Payload>()

    expect(cached).toEqual({ data: payload, lastSyncedAt: '2026-01-15T10:00:00.000Z' })
  })

  it('returns null when nothing was ever cached', async () => {
    expect(await readCache<Payload>()).toBeNull()
  })

  it('overwrites the previous payload rather than accumulating', async () => {
    await writeCache(payload, '2026-01-15T10:00:00.000Z')
    await writeCache({ clubs: [] }, '2026-01-15T11:00:00.000Z')

    expect(await readCache<Payload>()).toEqual({
      data: { clubs: [] },
      lastSyncedAt: '2026-01-15T11:00:00.000Z',
    })
  })

  it('clears the entry', async () => {
    await writeCache(payload, '2026-01-15T10:00:00.000Z')

    await clearCache()

    expect(await readCache<Payload>()).toBeNull()
    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('clearing an empty cache is a no-op, not an error', async () => {
    await expect(clearCache()).resolves.toBeUndefined()
  })

  // The blob survives app upgrades, so a shape written by an older version (or
  // a truncated write) has to degrade to "no cache" — never to a half-populated
  // state that the app would render as real data.
  describe('rejects unusable blobs', () => {
    it.each([
      ['malformed JSON', 'not json at all'],
      ['an empty string', ''],
      ['a JSON null', 'null'],
      ['a payload with no data', JSON.stringify({ lastSyncedAt: '2026-01-15T10:00:00.000Z' })],
      ['a payload with null data', JSON.stringify({ data: null, lastSyncedAt: '2026-01-15T10:00:00.000Z' })],
      ['a payload with no timestamp', JSON.stringify({ data: payload })],
      ['a non-string timestamp', JSON.stringify({ data: payload, lastSyncedAt: 1737000000000 })],
    ])('returns null for %s', async (_label, raw) => {
      await AsyncStorage.setItem(CACHE_KEY, raw)

      expect(await readCache<Payload>()).toBeNull()
    })
  })

  // A cache is an optimisation; a storage failure must never surface to the UI
  // as a rejected promise.
  describe('swallows storage failures', () => {
    it('readCache returns null when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'))

      expect(await readCache<Payload>()).toBeNull()
    })

    it('writeCache resolves when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'))

      await expect(writeCache(payload, '2026-01-15T10:00:00.000Z')).resolves.toBeUndefined()
    })

    it('clearCache resolves when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'))

      await expect(clearCache()).resolves.toBeUndefined()
    })
  })
})
