import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useMemo, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { isPlayerEligibleForTeam } from '@shared/lib/brulage'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@shared/lib/playerSearch'
import { selectablePlayers } from '@shared/lib/playerVisibility'
import { playersCommittedElsewhere } from '@/utils/matchdays'
import type { AvailabilityStatus, Club, Player, Team, MatchDay, Game, GameSelection } from '@shared/types'
import { fonts } from '@/constants/typography'

export interface SelectionData {
  matchDayId: string
  allClubPlayers: Player[]
  clubTeams: Team[]
  matchDays: MatchDay[]
  games: Game[]
  gameSelections: GameSelection[]
}

// Bottom-sheet line-up picker for captains: this team's roster plus other
// club players still eligible (brûlage) for the match-day. Shared by the
// Accueil hero card and the Mes matchs game cards.
export function CaptainSelectionSheet({
  team,
  teamPlayers,
  clubs,
  playersPerGame,
  getAvailability,
  initialSelection,
  selectionData,
  onSave,
  onClose,
}: {
  team: Team
  teamPlayers: Player[]
  clubs: Club[]
  playersPerGame: number
  getAvailability: (pid: string) => AvailabilityStatus | undefined
  initialSelection: string[]
  selectionData: SelectionData
  onSave: (playerIds: string[]) => void
  onClose: () => void
}) {
  const [selection, setSelection] = useState<string[]>(initialSelection)
  const [query, setQuery] = useState('')
  const { matchDayId, allClubPlayers, clubTeams, matchDays, games, gameSelections } = selectionData

  // Archived players have left the club and are not offered (#454); the web
  // sheet has always filtered them out, this one did not. `initialSelection`
  // rather than the live selection, so no row disappears mid-tap.
  const fieldableRoster = useMemo(
    () => selectablePlayers(teamPlayers, initialSelection),
    [teamPlayers, initialSelection],
  )

  const eligibleOthers = useMemo(() => {
    const teamPlayerIds = new Set(teamPlayers.map((p) => p.id))
    return selectablePlayers(allClubPlayers, initialSelection).filter((p) => {
      if (teamPlayerIds.has(p.id)) return false
      return isPlayerEligibleForTeam(p.id, team, clubTeams, matchDays, games, gameSelections, matchDayId)
    })
  }, [allClubPlayers, teamPlayers, initialSelection, team, clubTeams, matchDays, games, gameSelections, matchDayId])

  // The filter earns its row of screen and its keyboard only on a long list,
  // so it is the whole sheet that is counted, not one section (#454).
  const searchable = fieldableRoster.length + eligibleOthers.length > PLAYER_SEARCH_THRESHOLD
  const shownRoster = searchable ? filterPlayersBySearch(fieldableRoster, query) : fieldableRoster
  const shownOthers = searchable ? filterPlayersBySearch(eligibleOthers, query) : eligibleOthers

  // Players already fielded by another club team this same journée — can't be
  // picked again. Keyed by playerId → that team's number.
  const committedElsewhere = useMemo(() => {
    const round = matchDays.find((md) => md.id === matchDayId)?.number
    if (round === undefined) return new Map<string, number>()
    return playersCommittedElsewhere(team.id, round, clubTeams, games, matchDays, gameSelections)
  }, [team.id, clubTeams, games, matchDays, gameSelections, matchDayId])

  function toggle(pid: string) {
    if (committedElsewhere.has(pid) && !selection.includes(pid)) return
    setSelection((prev) => {
      if (prev.includes(pid)) return prev.filter((id) => id !== pid)
      if (prev.length >= playersPerGame) {
        Alert.alert('Limite atteinte', `Maximum ${playersPerGame} joueurs par match.`)
        return prev
      }
      return [...prev, pid]
    })
  }

  function renderPlayerRow(p: Player) {
    const avail = getAvailability(p.id)
    const picked = selection.includes(p.id)
    const cfg = avail ? AVAIL[avail] : null
    const lockedTeam = !picked ? committedElsewhere.get(p.id) : undefined
    const locked = lockedTeam !== undefined
    return (
      <TouchableOpacity
        key={p.id}
        style={[sel.playerRow, locked && sel.playerRowLocked]}
        onPress={() => toggle(p.id)}
        disabled={locked}
      >
        <View style={[sel.check, picked && sel.checkActive]}>
          {picked && <Text style={sel.checkMark}>✓</Text>}
        </View>
        <Text style={[sel.playerName, picked && sel.playerNamePicked]}>
          {p.firstName} {p.lastName}
        </Text>
        {locked ? (
          <Text style={sel.lockedTxt}>Équipe {lockedTeam}</Text>
        ) : cfg ? (
          <View style={[sel.availChip, { backgroundColor: cfg.bg }]}>
            <Text style={[sel.availTxt, { color: cfg.color }]}>{cfg.short}</Text>
          </View>
        ) : (
          <Text style={sel.noAvail}>—</Text>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <Sheet onClose={onClose} testID="selection-sheet">
      <Text style={sel.title}>
        Sélection — {getTeamName(team, clubs)} ({selection.length}/{playersPerGame})
      </Text>
      {searchable && (
        <TextInput
          style={sel.search}
          value={query}
          onChangeText={setQuery}
          placeholder={PLAYER_SEARCH_LABEL}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      )}
      <ScrollView
        style={sel.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {shownRoster.length > 0 && (
          <>
            <Text style={sel.sectionLabel}>Cette équipe</Text>
            {shownRoster.map(renderPlayerRow)}
          </>
        )}
        {shownOthers.length > 0 && (
          <>
            <Text style={sel.sectionLabel}>Autres joueurs</Text>
            {shownOthers.map(renderPlayerRow)}
          </>
        )}
        {shownRoster.length === 0 && shownOthers.length === 0 && query.trim() !== '' && (
          <Text style={sel.empty}>Aucun joueur ne correspond à « {query.trim()} ».</Text>
        )}
      </ScrollView>
      <View style={sel.actions}>
        <TouchableOpacity style={sel.cancelBtn} onPress={onClose}>
          <Text style={sel.cancelTxt}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sel.saveBtn} onPress={() => { onSave(selection); onClose() }}>
          <Text style={sel.saveTxt}>Enregistrer</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

const sel = StyleSheet.create({
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 8 },
  sectionLabel: {
    fontSize: 11, fontFamily: fonts.bold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
  },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, minHeight: 44, fontSize: 15,
    color: colors.textPrimary, backgroundColor: colors.bg, marginTop: 4,
  },
  list: { marginBottom: 16 },
  empty: {
    fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', paddingVertical: 24,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  playerName: { flex: 1, fontSize: 15, color: colors.textPrimary },
  playerNamePicked: { fontFamily: fonts.semiBold, color: colors.accent },
  availChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  availTxt: { fontSize: 11, fontFamily: fonts.semiBold },
  noAvail: { fontSize: 12, color: colors.border },
  playerRowLocked: { opacity: 0.45 },
  lockedTxt: { fontSize: 11, fontStyle: 'italic', color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, borderRadius: 10, padding: 14,
    alignItems: 'center', backgroundColor: colors.bg,
  },
  cancelTxt: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textSecondary },
  saveBtn: {
    flex: 1, borderRadius: 10, padding: 14,
    alignItems: 'center', backgroundColor: colors.accent,
  },
  saveTxt: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
})
