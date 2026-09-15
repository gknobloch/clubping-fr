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

const ALICE = 'u-alice'
const BOB = 'u-bob'

/** A stored entry as the module writes it — the shape the reader must accept. */
const entry = (userId: string, data: unknown, lastSyncedAt: string) =>
  JSON.stringify({ version: 1, userId, data, lastSyncedAt })

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.restoreAllMocks()
})

describe('offlineCache (#144)', () => {
  it('round-trips a payload with its sync timestamp', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    const cached = await readCache<Payload>(ALICE)

    expect(cached).toEqual({ data: payload, lastSyncedAt: '2026-01-15T10:00:00.000Z' })
  })

  it('returns null when nothing was ever cached', async () => {
    expect(await readCache<Payload>(ALICE)).toBeNull()
  })

  it('overwrites the previous payload rather than accumulating', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')
    await writeCache(ALICE, { clubs: [] }, '2026-01-15T11:00:00.000Z')

    expect(await readCache<Payload>(ALICE)).toEqual({
      data: { clubs: [] },
      lastSyncedAt: '2026-01-15T11:00:00.000Z',
    })
  })

  it('clears the entry', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    await clearCache()

    expect(await readCache<Payload>(ALICE)).toBeNull()
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
      ['a payload with no data', entry(ALICE, undefined, '2026-01-15T10:00:00.000Z')],
      ['a payload with null data', entry(ALICE, null, '2026-01-15T10:00:00.000Z')],
      ['a payload with no timestamp', JSON.stringify({ version: 1, userId: ALICE, data: payload })],
      ['a non-string timestamp', entry(ALICE, payload, 1737000000000 as unknown as string)],
      // Pre-#509: no member, no version. It named nobody, so it belongs to
      // nobody — the one entry shape this change exists to stop honouring.
      ['an entry from before it was keyed', JSON.stringify({ data: payload, lastSyncedAt: '2026-01-15T10:00:00.000Z' })],
    ])('returns null for %s', async (_label, raw) => {
      await AsyncStorage.setItem(CACHE_KEY, raw)

      expect(await readCache<Payload>(ALICE)).toBeNull()
    })
  })

  // A cache is an optimisation; a storage failure must never surface to the UI
  // as a rejected promise.
  describe('swallows storage failures', () => {
    it('readCache returns null when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'))

      expect(await readCache<Payload>(ALICE)).toBeNull()
    })

    it('writeCache resolves when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'))

      await expect(writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')).resolves.toBeUndefined()
    })

    it('clearCache resolves when storage throws', async () => {
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'))

      await expect(clearCache()).resolves.toBeUndefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Whose cache is this? (#509)
//
// The entry used to name nobody, and separation rested entirely on `clearCache`
// running at sign-out — which swallows its own failures, and which a profile
// switch would not pass through at all. Refusing at the point of READING
// supposes none of that.
// ---------------------------------------------------------------------------
describe('offlineCache — keyed to a member (#509)', () => {
  it('gives a member back their own payload', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    expect(await readCache<Payload>(ALICE)).toEqual({
      data: payload,
      lastSyncedAt: '2026-01-15T10:00:00.000Z',
    })
  })

  // The club tablet handed to the next captain.
  it("refuses another member's payload", async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    expect(await readCache<Payload>(BOB)).toBeNull()
  })

  // Refusal is not deletion: Alice gets hers back when she signs in again,
  // and Bob's own fetch overwrites it soon enough.
  it('leaves the entry in place when it refuses it', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    await readCache<Payload>(BOB)

    expect(await readCache<Payload>(ALICE)).not.toBeNull()
  })

  it('holds one member at a time — the newest write wins', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')
    await writeCache(BOB, { clubs: [] }, '2026-01-15T11:00:00.000Z')

    expect(await readCache<Payload>(BOB)).not.toBeNull()
    expect(await readCache<Payload>(ALICE)).toBeNull()
  })

  it('refuses an entry whose shape this build no longer understands', async () => {
    await AsyncStorage.setItem(CACHE_KEY, entry(ALICE, payload, '2026-01-15T10:00:00.000Z').replace('"version":1', '"version":99'))

    expect(await readCache<Payload>(ALICE)).toBeNull()
  })

  // Nothing is attributed to nobody, in either direction: an unattributed
  // entry is exactly what this cache must never hold again.
  it('reads nothing when no member is known', async () => {
    await writeCache(ALICE, payload, '2026-01-15T10:00:00.000Z')

    expect(await readCache<Payload>(null)).toBeNull()
  })

  it('writes nothing when no member is known', async () => {
    await writeCache(null, payload, '2026-01-15T10:00:00.000Z')

    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull()
  })
})
