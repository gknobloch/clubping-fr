import { describe, it, expect, beforeEach } from 'vitest'
import { readCache, writeCache, clearCache, formatFetchedAt } from './offlineCache'
import type { DataState } from '@/types'

// #387 — the cache exists so a line-up stays readable in a sports hall with no
// signal. Everything here is about not handing it to the wrong member.

const data = { teams: [{ id: 't1' }], players: [] } as unknown as DataState

// happy-dom ships no localStorage here — the same gap AuthContext guards
// against — so the tests bring their own. That the module copes with storage
// being absent is itself covered below.
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

function useStorage(value: Storage | undefined) {
  Object.defineProperty(window, 'localStorage', { value, configurable: true, writable: true })
}

describe('offlineCache (#387)', () => {
  beforeEach(() => {
    useStorage(memoryStorage())
  })

  it('round-trips the data with a timestamp', () => {
    writeCache('u1', data)

    const got = readCache('u1')
    expect(got?.data.teams).toHaveLength(1)
    expect(Number.isNaN(new Date(got!.fetchedAt).getTime())).toBe(false)
  })

  // The one that matters: clubs share phones and tablets. A cache keyed only by
  // device would show the next member the previous member's club.
  it('never hands one member the cache of another', () => {
    writeCache('u1', data)

    expect(readCache('u2')).toBeNull()
  })

  it('is dropped by clearCache, so signing out leaves nothing behind', () => {
    writeCache('u1', data)
    clearCache()

    expect(readCache('u1')).toBeNull()
  })

  it('ignores a cache written by an older shape', () => {
    writeCache('u1', data)
    const raw = JSON.parse(window.localStorage.getItem('pp-club-data-cache')!)
    window.localStorage.setItem('pp-club-data-cache', JSON.stringify({ ...raw, version: 0 }))

    expect(readCache('u1')).toBeNull()
  })

  it('survives a corrupted entry rather than breaking the boot', () => {
    window.localStorage.setItem('pp-club-data-cache', '{not json')

    expect(() => readCache('u1')).not.toThrow()
    expect(readCache('u1')).toBeNull()
  })

  it('reads nothing when there is no member yet', () => {
    writeCache('u1', data)

    expect(readCache('')).toBeNull()
  })

  it('formats the timestamp for the banner, and shrugs off a bad one', () => {
    expect(formatFetchedAt('2026-08-14T09:12:00Z')).toMatch(/août/)
    expect(formatFetchedAt('nonsense')).toBe('')
  })

  // Private browsing and a full disk both take localStorage away. Losing the
  // cache costs offline reads; it must not cost the app.
  it('does nothing at all when storage is unavailable', () => {
    useStorage(undefined)

    expect(() => writeCache('u1', data)).not.toThrow()
    expect(() => clearCache()).not.toThrow()
    expect(readCache('u1')).toBeNull()
  })
})
