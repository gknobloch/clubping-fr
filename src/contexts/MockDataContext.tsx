import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { Division } from '@/types'
import {
  mockDivisions as initialDivisions,
  mockClubs as initialClubs,
  mockSeasons as initialSeasons,
  mockPhases as initialPhases,
  mockGroups as initialGroups,
  mockTeams as initialTeams,
  mockPlayers as initialPlayers,
  mockMatchDays as initialMatchDays,
  mockGames as initialGames,
  mockGameAvailabilities as initialGameAvailabilities,
  mockGameSelections as initialGameSelections,
} from '@/mock/data'
import type {
  Address,
  Club,
  Season,
  Phase,
  Group,
  Team,
  Player,
  MatchDay,
  Game,
  GameAvailability,
  GameSelection,
  AvailabilityStatus,
  AvailabilityOverriddenBy,
} from '@/types'

interface MockDataState {
  divisions: Division[]
  clubs: Club[]
  seasons: Season[]
  phases: Phase[]
  groups: Group[]
  teams: Team[]
  players: Player[]
  matchDays: MatchDay[]
  games: Game[]
  gameAvailabilities: GameAvailability[]
  gameSelections: GameSelection[]
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}`
}

interface MockDataContextValue extends MockDataState {
  updateDivision: (id: string, patch: Partial<Division>) => void
  updateClub: (id: string, patch: Partial<Club>) => void
  addClubAddress: (clubId: string, data: Omit<Address, 'id'>) => Address
  updateClubAddress: (clubId: string, addressId: string, patch: Partial<Address>) => void
  deleteClubAddress: (clubId: string, addressId: string) => void
  updateSeason: (id: string, patch: Partial<Season>) => void
  updatePhase: (id: string, patch: Partial<Phase>) => void
  updateGroup: (id: string, patch: Partial<Group>) => void
  updateTeam: (id: string, patch: Partial<Team>) => void
  addClub: (data: Omit<Club, 'id'>) => Club
  addSeason: (data: Omit<Season, 'id'>) => Season
  addPhase: (data: Omit<Phase, 'id'>) => Phase
  addDivision: (data: Omit<Division, 'id'>) => Division
  addGroup: (data: Omit<Group, 'id'>) => Group
  addTeam: (data: Omit<Team, 'id'>) => Team
  moveDivisionUp: (divisionId: string) => void
  moveDivisionDown: (divisionId: string) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  addPlayer: (data: Omit<Player, 'id'>) => Player
  matchDays: MatchDay[]
  games: Game[]
  updateMatchDay: (id: string, patch: Partial<MatchDay>) => void
  addMatchDay: (data: Omit<MatchDay, 'id'>) => MatchDay
  updateGame: (id: string, patch: Partial<Game>) => void
  addGame: (data: Omit<Game, 'id'>) => Game
  gameAvailabilities: GameAvailability[]
  setGameAvailability: (
    gameId: string,
    playerId: string,
    status: AvailabilityStatus,
    overriddenBy?: AvailabilityOverriddenBy
  ) => void
  clearGameAvailability: (gameId: string, playerId: string) => void
  gameSelections: GameSelection[]
  getGameSelectionPlayerIds: (gameId: string, teamId: string) => string[]
  setGameSelection: (gameId: string, teamId: string, playerIds: string[]) => void
  /** Apply multiple (gameId, teamId, playerIds) in one state update (avoids losing one when updating home + away). */
  setGameSelectionBatch: (
    updates: Array<{ gameId: string; teamId: string; playerIds: string[] }>
  ) => void
}

const MockDataContext = createContext<MockDataContextValue | null>(null)

export function MockDataProvider({ children }: { children: React.ReactNode }) {
  const [divisions, setDivisions] = useState<Division[]>(initialDivisions)
  const [clubs, setClubs] = useState<Club[]>(initialClubs)
  const [seasons, setSeasons] = useState<Season[]>(initialSeasons)
  const [phases, setPhases] = useState<Phase[]>(initialPhases)
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [matchDays, setMatchDays] = useState<MatchDay[]>(initialMatchDays)
  const [games, setGames] = useState<Game[]>(initialGames)
  const [gameAvailabilities, setGameAvailabilities] = useState<GameAvailability[]>(
    initialGameAvailabilities
  )
  const [gameSelections, setGameSelections] = useState<GameSelection[]>(initialGameSelections)

  const updateDivision = useCallback((id: string, patch: Partial<Division>) => {
    setDivisions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    )
  }, [])

  const updateClub = useCallback((id: string, patch: Partial<Club>) => {
    setClubs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    )
  }, [])

  const addClubAddress = useCallback((clubId: string, data: Omit<Address, 'id'>) => {
    const id = nextId('addr')
    const address: Address = { ...data, id }
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        const addresses = c.addresses ?? []
        const newAddresses = data.isDefault
          ? [...addresses.map((a) => ({ ...a, isDefault: false })), address]
          : addresses.length === 0
            ? [{ ...address, isDefault: true }]
            : [...addresses, address]
        return { ...c, addresses: newAddresses }
      })
    )
    return address
  }, [])

  const updateClubAddress = useCallback(
    (clubId: string, addressId: string, patch: Partial<Address>) => {
      setClubs((prev) =>
        prev.map((c) => {
          if (c.id !== clubId) return c
          const addresses = (c.addresses ?? []).map((a) =>
            a.id === addressId ? { ...a, ...patch } : patch.isDefault === true ? { ...a, isDefault: false } : a
          )
          return { ...c, addresses }
        })
      )
    },
    []
  )

  const deleteClubAddress = useCallback((clubId: string, addressId: string) => {
    setClubs((prev) =>
      prev.map((c) => {
        if (c.id !== clubId) return c
        let addresses = (c.addresses ?? []).filter((a) => a.id !== addressId)
        const deletedWasDefault = (c.addresses ?? []).find((a) => a.id === addressId)?.isDefault
        if (deletedWasDefault && addresses.length > 0 && !addresses.some((a) => a.isDefault)) {
          addresses = [{ ...addresses[0], isDefault: true }, ...addresses.slice(1)]
        }
        return { ...c, addresses }
      })
    )
  }, [])

  const updateSeason = useCallback((id: string, patch: Partial<Season>) => {
    setSeasons((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    )
  }, [])

  const updatePhase = useCallback((id: string, patch: Partial<Phase>) => {
    setPhases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    )
  }, [])

  const updateGroup = useCallback((id: string, patch: Partial<Group>) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
    )
  }, [])

  const updateTeam = useCallback((id: string, patch: Partial<Team>) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === id)
      if (!team) return prev
      const nextPlayerIds = patch.playerIds ?? team.playerIds ?? []
      const phaseId = patch.phaseId ?? team.phaseId
      const otherTeamsInPhase = prev.filter(
        (t) => t.phaseId === phaseId && t.id !== id
      )
      const updates: Array<{ id: string; playerIds: string[] }> = []
      for (const other of otherTeamsInPhase) {
        const otherIds = other.playerIds ?? []
        if (otherIds.some((pid) => nextPlayerIds.includes(pid))) {
          updates.push({
            id: other.id,
            playerIds: otherIds.filter((pid) => !nextPlayerIds.includes(pid)),
          })
        }
      }
      return prev.map((t) => {
        if (t.id === id) return { ...t, ...patch }
        const u = updates.find((upd) => upd.id === t.id)
        if (u) return { ...t, playerIds: u.playerIds }
        return t
      })
    })
  }, [])

  const addClub = useCallback((data: Omit<Club, 'id'>) => {
    const id = nextId('club')
    const club: Club = { ...data, id }
    setClubs((prev) => [...prev, club])
    return club
  }, [])

  const addSeason = useCallback((data: Omit<Season, 'id'>) => {
    const id = nextId('season')
    const season: Season = { ...data, id }
    setSeasons((prev) => [...prev, season])
    return season
  }, [])

  const addPhase = useCallback((data: Omit<Phase, 'id'>) => {
    const id = nextId('phase')
    const phase: Phase = { ...data, id }
    setPhases((prev) => [...prev, phase])
    return phase
  }, [])

  const addDivision = useCallback((data: Omit<Division, 'id'>) => {
    const id = nextId('div')
    const division: Division = { ...data, id }
    setDivisions((prev) => [...prev, division])
    return division
  }, [])

  const addGroup = useCallback((data: Omit<Group, 'id'>) => {
    const id = nextId('group')
    const group: Group = { ...data, id }
    setGroups((prev) => [...prev, group])
    return group
  }, [])

  const addTeam = useCallback((data: Omit<Team, 'id'>) => {
    const id = nextId('team')
    const team: Team = { ...data, id }
    setTeams((prev) => {
      const phaseId = team.phaseId
      const newPlayerIds = team.playerIds ?? []
      const otherTeamsInPhase = prev.filter((t) => t.phaseId === phaseId)
      const updated = prev.map((t) => {
        if (!otherTeamsInPhase.includes(t)) return t
        const otherIds = t.playerIds ?? []
        if (!otherIds.some((pid) => newPlayerIds.includes(pid))) return t
        return { ...t, playerIds: otherIds.filter((pid) => !newPlayerIds.includes(pid)) }
      })
      return [...updated, team]
    })
    return team
  }, [])

  const moveDivisionUp = useCallback((divisionId: string) => {
    setDivisions((prev) => {
      const div = prev.find((d) => d.id === divisionId)
      if (!div) return prev
      const inPhase = prev.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
      const idx = inPhase.findIndex((d) => d.id === divisionId)
      if (idx <= 0) return prev
      const other = inPhase[idx - 1]
      return prev.map((d) =>
        d.id === div.id ? { ...d, rank: other.rank } : d.id === other.id ? { ...d, rank: div.rank } : d
      )
    })
  }, [])

  const moveDivisionDown = useCallback((divisionId: string) => {
    setDivisions((prev) => {
      const div = prev.find((d) => d.id === divisionId)
      if (!div) return prev
      const inPhase = prev.filter((d) => d.phaseId === div.phaseId).sort((a, b) => a.rank - b.rank)
      const idx = inPhase.findIndex((d) => d.id === divisionId)
      if (idx < 0 || idx >= inPhase.length - 1) return prev
      const other = inPhase[idx + 1]
      return prev.map((d) =>
        d.id === div.id ? { ...d, rank: other.rank } : d.id === other.id ? { ...d, rank: div.rank } : d
      )
    })
  }, [])

  const updatePlayer = useCallback((id: string, patch: Partial<Player>) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    )
  }, [])

  const addPlayer = useCallback((data: Omit<Player, 'id'>) => {
    const id = nextId('player')
    const player: Player = { ...data, id }
    setPlayers((prev) => [...prev, player])
    return player
  }, [])

  const updateMatchDay = useCallback((id: string, patch: Partial<MatchDay>) => {
    setMatchDays((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
  }, [])

  const addMatchDay = useCallback((data: Omit<MatchDay, 'id'>) => {
    const id = nextId('md')
    const matchDay: MatchDay = { ...data, id }
    setMatchDays((prev) => [...prev, matchDay])
    return matchDay
  }, [])

  const updateGame = useCallback((id: string, patch: Partial<Game>) => {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
    )
  }, [])

  const addGame = useCallback((data: Omit<Game, 'id'>) => {
    const id = nextId('game')
    const game: Game = { ...data, id }
    setGames((prev) => [...prev, game])
    return game
  }, [])

  const setGameAvailability = useCallback(
    (
      gameId: string,
      playerId: string,
      status: AvailabilityStatus,
      overriddenBy?: AvailabilityOverriddenBy
    ) => {
      setGameAvailabilities((prev) => {
        const existing = prev.find(
          (a) => a.gameId === gameId && a.playerId === playerId
        )
        if (existing) {
          return prev.map((a) =>
            a.gameId === gameId && a.playerId === playerId
              ? { ...a, status, overriddenBy }
              : a
          )
        }
        return [
          ...prev,
          { gameId, playerId, status, overriddenBy },
        ]
      })
    },
    []
  )

  const clearGameAvailability = useCallback((gameId: string, playerId: string) => {
    setGameAvailabilities((prev) =>
      prev.filter((a) => !(a.gameId === gameId && a.playerId === playerId))
    )
  }, [])

  const getGameSelectionPlayerIds = useCallback((gameId: string, teamId: string) => {
    return (
      gameSelections.find((s) => s.gameId === gameId && s.teamId === teamId)?.playerIds ?? []
    )
  }, [gameSelections])

  const setGameSelection = useCallback((gameId: string, teamId: string, playerIds: string[]) => {
    setGameSelections((prev) => {
      const rest = prev.filter((s) => !(s.gameId === gameId && s.teamId === teamId))
      if (playerIds.length === 0) return rest
      const existing = prev.find((s) => s.gameId === gameId && s.teamId === teamId)
      return [
        ...rest,
        existing
          ? { ...existing, playerIds }
          : { id: nextId('gs'), gameId, teamId, playerIds },
      ]
    })
  }, [])

  const setGameSelectionBatch = useCallback(
    (updates: Array<{ gameId: string; teamId: string; playerIds: string[] }>) => {
      setGameSelections((prev) => {
        let next = prev
        for (const { gameId, teamId, playerIds } of updates) {
          next = next.filter((s) => !(s.gameId === gameId && s.teamId === teamId))
          if (playerIds.length > 0) {
            const existing = prev.find((s) => s.gameId === gameId && s.teamId === teamId)
            next = [
              ...next,
              existing
                ? { ...existing, playerIds }
                : { gameId, teamId, playerIds },
            ]
          }
        }
        return next
      })
    },
    []
  )

  const value = useMemo<MockDataContextValue>(
    () => ({
      divisions,
      clubs,
      seasons,
      phases,
      groups,
      teams,
      players,
      matchDays,
      games,
      updateDivision,
      updateClub,
      addClubAddress,
      updateClubAddress,
      deleteClubAddress,
      updateSeason,
      updatePhase,
      updateGroup,
      updateTeam,
      addClub,
      addSeason,
      addPhase,
      addDivision,
      addGroup,
      addTeam,
      moveDivisionUp,
      moveDivisionDown,
      updatePlayer,
      addPlayer,
      updateMatchDay,
      addMatchDay,
      updateGame,
      addGame,
      gameAvailabilities,
      setGameAvailability,
      clearGameAvailability,
      gameSelections,
      getGameSelectionPlayerIds,
      setGameSelection,
      setGameSelectionBatch,
    }),
    [
      divisions,
      clubs,
      seasons,
      phases,
      groups,
      teams,
      players,
      matchDays,
      games,
      updateDivision,
      updateClub,
      addClubAddress,
      updateClubAddress,
      deleteClubAddress,
      updateSeason,
      updatePhase,
      updateGroup,
      updateTeam,
      addClub,
      addSeason,
      addPhase,
      addDivision,
      addGroup,
      addTeam,
      moveDivisionUp,
      moveDivisionDown,
      updatePlayer,
      addPlayer,
      updateMatchDay,
      addMatchDay,
      updateGame,
      addGame,
      gameAvailabilities,
      setGameAvailability,
      clearGameAvailability,
      gameSelections,
      getGameSelectionPlayerIds,
      setGameSelection,
      setGameSelectionBatch,
    ]
  )

  return (
    <MockDataContext.Provider value={value}>
      {children}
    </MockDataContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook, mirrors useAppData
export function useMockData() {
  const ctx = useContext(MockDataContext)
  if (!ctx) throw new Error('useMockData must be used within MockDataProvider')
  return ctx
}
