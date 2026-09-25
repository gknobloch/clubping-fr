import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'

// Minimum gap between automatic foreground refetches. A manual pull-to-refresh
// always forces a fetch and ignores this.
const FOREGROUND_REFETCH_THROTTLE_MS = 30_000
import type {
  Club,
  Season,
  Phase,
  Division,
  Group,
  Team,
  Player,
  PlayerPhasePoints,
  MatchDay,
  Game,
  GameAvailability,
  GameSelection,
  AvailabilityOverriddenBy,
  AvailabilityStatus,
  Competition,
  CompetitionEligibility,
  PlayerSeasonCategory,
  PlayerSeasonLicence,
  MemberGroup,
  User,
} from '@shared/types'
import type { PlayerImportWrites } from '@shared/lib/ffttPlayers'
import {
  MEMBER_GROUP_MESSAGES, groupNameTaken, normalizeGroupName, withGroupMembers, withMemberGroups,
  type MemberGroupResult,
} from '@shared/lib/memberGroups'
import { apiUrl } from '@/constants/api'
import { dataHeaders, getSessionToken, getSessionUserId, onSessionChange } from '@/utils/api'
import { clearCache, readCache, writeCache } from '@/utils/offlineCache'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------
interface DataState {
  clubs: Club[]
  seasons: Season[]
  phases: Phase[]
  divisions: Division[]
  groups: Group[]
  teams: Team[]
  players: Player[]
  playerPhasePoints: PlayerPhasePoints[]
  playerSeasonCategories: PlayerSeasonCategory[]
  playerSeasonLicences: PlayerSeasonLicence[]
  /** The member's own club's groups (#602) — every club's for a general admin. */
  memberGroups: MemberGroup[]
  competitions: Competition[]
  competitionEligibilities: CompetitionEligibility[]
  matchDays: MatchDay[]
  games: Game[]
  gameAvailabilities: GameAvailability[]
  gameSelections: GameSelection[]
  users: User[]
}

const emptyState: DataState = {
  clubs: [],
  seasons: [],
  phases: [],
  divisions: [],
  groups: [],
  teams: [],
  players: [],
  playerPhasePoints: [],
  playerSeasonCategories: [],
  playerSeasonLicences: [],
  memberGroups: [],
  competitions: [],
  competitionEligibilities: [],
  matchDays: [],
  games: [],
  gameAvailabilities: [],
  gameSelections: [],
  users: [],
}

/**
 * A payload — from the API or from the offline cache — brought up to the
 * current shape. An offline cache written before #384 has no
 * `playerPhasePoints`, one written before #482/#488 has neither category
 * nor licence, and one written before #498 knows nothing of competitions; a
 * cold start hydrates from it before the first fetch, so the screens would read
 * them off `undefined`.
 *
 * An empty `competitions` is the right answer for such a cache, and harmless:
 * a team whose division belongs to no competition is restricted by nobody. The
 * same goes for `memberGroups` (#602): a club with no group filters nothing.
 */
const withDefaults = (data: DataState): DataState => ({
  ...data,
  playerPhasePoints: data.playerPhasePoints ?? [],
  playerSeasonCategories: data.playerSeasonCategories ?? [],
  playerSeasonLicences: data.playerSeasonLicences ?? [],
  memberGroups: data.memberGroups ?? [],
  competitions: data.competitions ?? [],
  competitionEligibilities: data.competitionEligibilities ?? [],
})

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------
type PlayerProfilePatch = Partial<Pick<Player, 'email' | 'phone' | 'birthDate' | 'birthPlace'>>
type TeamPatch = { playerIds?: string[]; captainId?: string; whatsappLink?: string | null }

interface DataContextValue extends DataState {
  loading: boolean
  refreshing: boolean
  error: string | null
  /** True when the displayed data comes from cache, not a fresh fetch this
   *  session (cold-start hydration, or the latest fetch failed). Drives the
   *  offline banner. */
  stale: boolean
  /** ISO timestamp of the last successful fetch, or null if never synced. */
  lastSyncedAt: string | null
  refresh: () => void
  updatePlayer: (id: string, patch: PlayerProfilePatch) => Promise<void>
  updateTeam: (id: string, patch: TeamPatch) => void
  setAvailability: (
    playerId: string,
    gameId: string,
    status: AvailabilityStatus,
    /** Set when somebody answers for this player — see `availabilityOverride`. */
    overriddenBy?: AvailabilityOverriddenBy,
  ) => Promise<void>
  clearAvailability: (playerId: string, gameId: string) => Promise<void>
  setGameSelection: (
    teamId: string,
    gameId: string,
    playerIds: string[],
  ) => Promise<void>
  /** Upload (or replace) a player's avatar. `base64` is the raw image bytes. */
  setAvatar: (playerId: string, base64: string, contentType: string) => Promise<void>
  /** Remove a player's avatar. */
  removeAvatar: (playerId: string) => Promise<void>
  /**
   * Record what the federation listed for a club and season — a replacement,
   * not an addition (#488). Written when the listing is fetched, since who
   * holds a licence is a fact about FFTT's answer and not about which fields
   * an admin then ticks.
   */
  setClubSeasonLicences: (clubId: string, seasonId: string, playerIds: string[]) => Promise<void>
  /**
   * Write one reviewed FFTT import (#555), and reject if any part of it did
   * not land.
   *
   * Deliberately not optimistic, unlike everything else here. The rest of this
   * context patches one row the member is looking at; this writes a club at
   * once, and announcing "12 créés" over writes that never left the phone is
   * the failure #495 spells out — a silent failure is recoverable, a success
   * claimed wrongly is not. It refetches rather than splicing eighty rows in
   * by hand: after a write of this size the server is the only thing that
   * knows what the club now holds.
   */
  applyPlayerImport: (writes: PlayerImportWrites) => Promise<void>
  /**
   * Create or rename one of a club's groups (#602). Awaited, like on the web:
   * a name the club already uses is the API's to refuse, and the sheet has to
   * stay open to say so.
   */
  addMemberGroup: (clubId: string, displayName: string) => Promise<MemberGroupResult>
  renameMemberGroup: (clubId: string, groupId: string, displayName: string) => Promise<MemberGroupResult>
  /** Removes the grouping only — nobody leaves the club. */
  deleteMemberGroup: (clubId: string, groupId: string) => void
  /** Replace who is in one group. */
  setMemberGroupMembers: (clubId: string, groupId: string, memberIds: string[]) => void
  /** Replace which of the club's groups one member is in. */
  setGroupsOfMember: (clubId: string, memberId: string, groupIds: string[]) => void
}

const DataContext = createContext<DataContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [stale, setStale] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const lastFetchAt = useRef(0)

  // `mode` decides which spinner reflects the fetch: 'initial' uses the
  // full-screen loading flag, 'refresh' uses the lightweight one so the UI
  // (pull-to-refresh, foreground refetch) doesn't blank out existing content,
  // and 'background' uses neither — it's the cold start that already hydrated
  // from cache, where a spinner would hide content we can display right now.
  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true)
      else if (mode === 'initial') setLoading(true)
      setError(null)
      try {
        const res = await fetch(apiUrl('/data'), { headers: dataHeaders() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: DataState = await res.json()
        const syncedAt = new Date().toISOString()
        setState(withDefaults(data))
        setApiAvailable(true)
        setStale(false)
        setLastSyncedAt(syncedAt)
        lastFetchAt.current = Date.now()
        // Persist for the next cold start, under the member it was fetched for
        // (#509). Best-effort; never blocks the UI.
        writeCache(getSessionUserId(), data, syncedAt)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur réseau')
        setApiAvailable(false)
        // Keep whatever data we already have (cached or previously loaded) on
        // screen and flag it as stale so the offline banner appears.
        setStale(true)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  const refresh = useCallback(() => load('refresh'), [load])

  useEffect(() => {
    let cancelled = false
    // The member we have already hydrated for, so a second notification about
    // the same session does not re-read the cache and re-raise `stale`.
    let hydratedFor: string | null = null

    /**
     * Show what we hold for `memberId`, then refresh.
     *
     * Keyed on the member and not merely on "is there a cache", because the
     * entry may belong to somebody else — a club phone passed on, and, once
     * there are several, a profile switch that never passes through a sign-out
     * (#509). `readCache` refuses those; here that simply reads as "nothing to
     * show yet".
     *
     * Nothing is hydrated before a member is known. AuthProvider is a CHILD of
     * this provider, so its effect runs first, but it reaches storage through
     * an await — at our own mount the id is still null, and this is called
     * again the moment it lands.
     */
    const hydrate = async (memberId: string | null) => {
      if (!memberId || memberId === hydratedFor) {
        if (!cancelled) load(hydratedFor ? 'refresh' : 'initial')
        return
      }
      hydratedFor = memberId
      const cached = await readCache<DataState>(memberId)
      if (cancelled) return
      if (cached) {
        setState(withDefaults(cached.data))
        setLastSyncedAt(cached.lastSyncedAt)
        setStale(true)
        setLoading(false)
      }
      // 'background' when the cache gave us something to show: the fetch must
      // not raise `loading` again, or React would only commit that later value
      // and the spinner would cover the cached content for the whole request.
      load(cached ? 'background' : 'initial')
    }

    hydrate(getSessionUserId())

    // React to the session changing (sign-in, sign-out, the member landing
    // after a restore). Only a token going to null is a sign-out — and only
    // then is the cache emptied, so the next member on a shared phone starts
    // clean. A member we simply do not know yet is not a sign-out, and clearing
    // there would destroy the cache an offline boot is about to read (#513).
    const unsubscribe = onSessionChange(() => {
      if (getSessionToken() === null) {
        clearCache()
        hydratedFor = null
        setState(emptyState)
        setStale(false)
        setLastSyncedAt(null)
        load()
        return
      }
      hydrate(getSessionUserId())
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [load])

  // Refetch when the app returns to the foreground, so changes made elsewhere
  // (e.g. on the web app) show up without a full restart. Throttled so rapid
  // app switching doesn't spam the API — pull-to-refresh bypasses this.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      if (Date.now() - lastFetchAt.current < FOREGROUND_REFETCH_THROTTLE_MS) return
      load('refresh')
    })
    return () => sub.remove()
  }, [load])

  const updatePlayer = useCallback(
    async (id: string, patch: PlayerProfilePatch) => {
      // The API turns an empty e-mail into NULL and then omits the key, so the
      // optimistic row holds undefined rather than '' to match a reload (#315).
      const local = 'email' in patch && !patch.email ? { ...patch, email: undefined } : patch
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) => (p.id === id ? { ...p, ...local } : p)),
      }))
      if (apiAvailable) {
        fetch(apiUrl(`/players/${id}`), {
          method: 'PATCH',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(patch),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const updateTeam = useCallback(
    (id: string, patch: TeamPatch) => {
      setState((prev) => ({
        ...prev,
        teams: prev.teams.map((t) => {
          if (t.id !== id) return t
          const next = { ...t }
          if (patch.playerIds !== undefined) next.playerIds = patch.playerIds
          if (patch.captainId !== undefined) next.captainId = patch.captainId
          if ('whatsappLink' in patch) next.whatsappLink = patch.whatsappLink ?? undefined
          return next
        }),
      }))
      if (apiAvailable) {
        fetch(apiUrl(`/teams/${id}`), {
          method: 'PATCH',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(patch),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const setAvailability = useCallback(
    async (
      playerId: string,
      gameId: string,
      status: AvailabilityStatus,
      overriddenBy?: AvailabilityOverriddenBy,
    ) => {
      // Availabilities are keyed on (gameId, playerId) since 0033 (#282) — there
      // is no record ID to carry, and the API upserts on that pair.
      setState((prev) => {
        const existing = prev.gameAvailabilities.find(
          (a) => a.playerId === playerId && a.gameId === gameId,
        )
        if (existing) {
          return {
            ...prev,
            gameAvailabilities: prev.gameAvailabilities.map((a) =>
              a.playerId === playerId && a.gameId === gameId ? { ...a, status, overriddenBy } : a,
            ),
          }
        }
        return {
          ...prev,
          gameAvailabilities: [
            ...prev.gameAvailabilities,
            { playerId, gameId, status, overriddenBy },
          ],
        }
      })

      if (apiAvailable) {
        fetch(apiUrl('/game-availabilities/set'), {
          method: 'POST',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          // The upsert writes this column every time, so answering for
          // yourself sends `undefined` and clears somebody else's override.
          body: JSON.stringify({ playerId, gameId, status, overriddenBy }),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  // Clear a player's response for a game (tapping the active option again).
  const clearAvailability = useCallback(
    async (playerId: string, gameId: string) => {
      setState((prev) => ({
        ...prev,
        gameAvailabilities: prev.gameAvailabilities.filter(
          (a) => !(a.playerId === playerId && a.gameId === gameId),
        ),
      }))

      if (apiAvailable) {
        fetch(apiUrl('/game-availabilities/clear'), {
          method: 'POST',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ playerId, gameId }),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const setGameSelection = useCallback(
    async (teamId: string, gameId: string, playerIds: string[]) => {
      // Always generate an ID; the server uses it only when creating a new record
      // (existing records are updated by their DB id).
      const id = `sel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      setState((prev) => {
        const existing = prev.gameSelections.find(
          (s) => s.teamId === teamId && s.gameId === gameId,
        )
        if (existing) {
          return {
            ...prev,
            gameSelections: prev.gameSelections.map((s) =>
              s.teamId === teamId && s.gameId === gameId
                ? { ...s, playerIds }
                : s,
            ),
          }
        }
        return {
          ...prev,
          gameSelections: [
            ...prev.gameSelections,
            { id, teamId, gameId, playerIds },
          ],
        }
      })

      if (apiAvailable) {
        fetch(apiUrl('/game-selections/set'), {
          method: 'POST',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id, teamId, gameId, playerIds }),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const patchPlayerAvatar = useCallback((playerId: string, avatarUpdatedAt: string | undefined) => {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === playerId ? { ...p, avatarUpdatedAt } : p)),
    }))
  }, [])

  const setAvatar = useCallback(
    async (playerId: string, base64: string, contentType: string) => {
      // Optimistic: bump the version immediately so the image refreshes.
      patchPlayerAvatar(playerId, new Date().toISOString())
      if (!apiAvailable) return
      const res = await fetch(apiUrl(`/users/${playerId}/avatar`), {
        method: 'PUT',
        headers: dataHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: base64, contentType }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { avatarUpdatedAt } = (await res.json()) as { avatarUpdatedAt?: string }
      if (avatarUpdatedAt) patchPlayerAvatar(playerId, avatarUpdatedAt)
    },
    [apiAvailable, patchPlayerAvatar],
  )

  const removeAvatar = useCallback(
    async (playerId: string) => {
      patchPlayerAvatar(playerId, undefined)
      if (!apiAvailable) return
      const res = await fetch(apiUrl(`/users/${playerId}/avatar`), {
        method: 'DELETE',
        headers: dataHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    [apiAvailable, patchPlayerAvatar],
  )

  // --- FFTT player import (#555) ---------------------------------------------

  /** POST/PATCH/PUT that must land: it throws rather than swallowing. */
  const write = useCallback(
    async (path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown) => {
      const res = await fetch(apiUrl(path), {
        method,
        headers: dataHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    [],
  )

  const setClubSeasonLicences = useCallback(
    async (clubId: string, seasonId: string, playerIds: string[]) => {
      await write(`/clubs/${clubId}/seasons/${seasonId}/licences`, 'PUT', { playerIds })
      setState((prev) => ({
        ...prev,
        playerSeasonLicences: [
          ...prev.playerSeasonLicences.filter(
            (l) => !(l.seasonId === seasonId && playerIds.includes(l.playerId)),
          ),
          ...playerIds.map((playerId) => ({ seasonId, playerId })),
        ],
      }))
    },
    [write],
  )

  const applyPlayerImport = useCallback(
    async (writes: PlayerImportWrites) => {
      // Creations first: the points and categories below are filed under ids
      // these rows are about to carry.
      for (const c of writes.creates) {
        await write('/players', 'POST', {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          licenseNumber: c.licenseNumber,
          email: '',
          phone: '',
          status: 'active',
          clubId: c.clubId,
        })
      }
      for (const u of writes.updates) await write(`/players/${u.id}`, 'PATCH', u.patch)
      if (writes.points.length) {
        await write('/player-phase-points/batch', 'POST', { updates: writes.points })
      }
      if (writes.categories.length) {
        await write('/player-season-categories/batch', 'POST', { updates: writes.categories })
      }
      await load('refresh')
    },
    [write, load],
  )

  // --- Member groups (#602) --------------------------------------------------

  /** A create or rename whose refusal the sheet shows. `null` is success. */
  const groupWrite = useCallback(
    async (path: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> => {
      try {
        const res = await fetch(apiUrl(path), {
          method,
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        })
        if (res.status === 409) return MEMBER_GROUP_MESSAGES.nameTaken
        return res.ok ? null : MEMBER_GROUP_MESSAGES.failed
      } catch {
        return MEMBER_GROUP_MESSAGES.failed
      }
    },
    [],
  )

  const addMemberGroup = useCallback(
    async (clubId: string, rawName: string): Promise<MemberGroupResult> => {
      const displayName = normalizeGroupName(rawName)
      if (!displayName) return { ok: false, message: MEMBER_GROUP_MESSAGES.empty }
      if (groupNameTaken(state.memberGroups, clubId, displayName)) {
        return { ok: false, message: MEMBER_GROUP_MESSAGES.nameTaken }
      }
      const group: MemberGroup = {
        id: `mgroup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clubId, displayName, memberIds: [],
      }
      const refusal = await groupWrite(`/clubs/${clubId}/member-groups`, 'POST', {
        id: group.id, displayName,
      })
      if (refusal) return { ok: false, message: refusal }
      setState((prev) => ({ ...prev, memberGroups: [...prev.memberGroups, group] }))
      return { ok: true, group }
    },
    [state.memberGroups, groupWrite],
  )

  const renameMemberGroup = useCallback(
    async (clubId: string, groupId: string, rawName: string): Promise<MemberGroupResult> => {
      const displayName = normalizeGroupName(rawName)
      if (!displayName) return { ok: false, message: MEMBER_GROUP_MESSAGES.empty }
      const current = state.memberGroups.find((g) => g.id === groupId)
      if (!current) return { ok: false, message: MEMBER_GROUP_MESSAGES.failed }
      if (groupNameTaken(state.memberGroups, clubId, displayName, groupId)) {
        return { ok: false, message: MEMBER_GROUP_MESSAGES.nameTaken }
      }
      const refusal = await groupWrite(`/clubs/${clubId}/member-groups/${groupId}`, 'PATCH', { displayName })
      if (refusal) return { ok: false, message: refusal }
      setState((prev) => ({
        ...prev,
        memberGroups: prev.memberGroups.map((g) => (g.id === groupId ? { ...g, displayName } : g)),
      }))
      return { ok: true, group: { ...current, displayName } }
    },
    [state.memberGroups, groupWrite],
  )

  const deleteMemberGroup = useCallback(
    (clubId: string, groupId: string) => {
      setState((prev) => ({ ...prev, memberGroups: prev.memberGroups.filter((g) => g.id !== groupId) }))
      if (apiAvailable) {
        fetch(apiUrl(`/clubs/${clubId}/member-groups/${groupId}`), {
          method: 'DELETE',
          headers: dataHeaders(),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const setMemberGroupMembers = useCallback(
    (clubId: string, groupId: string, memberIds: string[]) => {
      setState((prev) => ({ ...prev, memberGroups: withGroupMembers(prev.memberGroups, groupId, memberIds) }))
      if (apiAvailable) {
        fetch(apiUrl(`/clubs/${clubId}/member-groups/${groupId}/members`), {
          method: 'PUT',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ memberIds }),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const setGroupsOfMember = useCallback(
    (clubId: string, memberId: string, groupIds: string[]) => {
      setState((prev) => ({
        ...prev,
        memberGroups: withMemberGroups(prev.memberGroups, clubId, memberId, groupIds),
      }))
      if (apiAvailable) {
        fetch(apiUrl(`/clubs/${clubId}/members/${memberId}/member-groups`), {
          method: 'PUT',
          headers: dataHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ groupIds }),
        }).catch(() => {})
      }
    },
    [apiAvailable],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      loading,
      refreshing,
      error,
      stale,
      lastSyncedAt,
      refresh,
      updatePlayer,
      updateTeam,
      setAvailability,
      clearAvailability,
      setGameSelection,
      setAvatar,
      removeAvatar,
      setClubSeasonLicences,
      applyPlayerImport,
      addMemberGroup,
      renameMemberGroup,
      deleteMemberGroup,
      setMemberGroupMembers,
      setGroupsOfMember,
    }),
    [
      state, loading, refreshing, error, stale, lastSyncedAt, refresh, updatePlayer, updateTeam,
      setAvailability, clearAvailability, setGameSelection, setAvatar, removeAvatar,
      setClubSeasonLicences, applyPlayerImport,
      addMemberGroup, renameMemberGroup, deleteMemberGroup, setMemberGroupMembers, setGroupsOfMember,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within DataProvider')
  return ctx
}
