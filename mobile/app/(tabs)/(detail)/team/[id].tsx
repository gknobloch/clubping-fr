import {
  ScrollView, View, Text, StyleSheet,
  TouchableOpacity, Modal, FlatList, Linking, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { getTeamName, canManageTeam } from '@/utils/roles'
import { sortByName } from '@shared/lib/sortByName'
import { computeBrulage } from '@shared/lib/brulage'
import { pointsFor } from '@shared/lib/phasePoints'
import { teamPhaseEntries } from '@shared/lib/teamPhases'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@shared/lib/playerSearch'
import { selectablePlayers } from '@shared/lib/playerVisibility'
import { gameDate } from '@/utils/matchdays'
import { colors } from '@/constants/colors'
import { ClubLogo } from '@/components/ClubLogo'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import { PlayerSheet } from '@/components/PlayerSheet'
import type { PlayerHistoryEntry } from '@/components/PlayerSheet'
import type { Player } from '@shared/types'
import { fonts } from '@/constants/typography'

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    /* no app to handle it — nothing useful to say beyond not crashing */
  })
}

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { teams, players, clubs, phases, divisions, matchDays, games, gameSelections, playerPhasePoints, updateTeam } = useAppData()
  const { user } = useAuth()
  const navigation = useNavigation()
  const router = useRouter()
  const [showRosterPicker, setShowRosterPicker] = useState(false)
  // Draft line-up edited inside the modal; only committed on "Enregistrer".
  const [draftPlayerIds, setDraftPlayerIds] = useState<string[]>([])
  const [draftCaptainId, setDraftCaptainId] = useState<string>('')
  const [whatsappDraft, setWhatsappDraft] = useState('')
  const [rosterQuery, setRosterQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  const team = teams.find((t) => t.id === id)
  const club = clubs.find((c) => c.id === team?.clubId)
  const division = divisions.find((d) => d.id === team?.divisionId)
  const phase = phases.find((p) => p.id === team?.phaseId)
  const isCaptain = !!(user && team && canManageTeam(user, team))

  const members = useMemo(
    () =>
      sortByName(
        (team?.playerIds ?? [])
          .map((pid) => players.find((p) => p.id === pid))
          .filter(Boolean) as Player[],
      ),
    [team, players],
  )

  // Club teams in the same phase (for brûlage + cross-team history)
  const clubTeamsInPhase = useMemo(
    () => (team ? teams.filter((t) => t.clubId === team.clubId && t.phaseId === team.phaseId) : []),
    [team, teams],
  )

  // Whether this team (by club+number) has any games across phases — drives the
  // single "Tous les matchs de cette équipe" link.
  const hasGames = useMemo(
    () => (team ? teamPhaseEntries(team, teams, phases, matchDays, games).length > 0 : false),
    [team, teams, phases, matchDays, games],
  )

  // Players available to join this team: active, same club, not on another team
  // in the same phase. An archived player already on the roster stays listed,
  // otherwise the captain could not take them off it (#454).
  const eligiblePlayers = useMemo(() => {
    if (!team) return []
    const takenElsewhere = new Set(
      teams
        .filter((t) => t.phaseId === team.phaseId && t.id !== team.id)
        .flatMap((t) => t.playerIds),
    )
    return sortByName(
      selectablePlayers(
        players.filter((p) => p.clubId === team.clubId && !takenElsewhere.has(p.id)),
        team.playerIds,
      ),
    )
  }, [team, teams, players])

  // Past a dozen licenciés this is the whole club to scroll through (#454).
  const rosterSearchable = eligiblePlayers.length > PLAYER_SEARCH_THRESHOLD
  const shownEligiblePlayers = rosterSearchable
    ? filterPlayersBySearch(eligiblePlayers, rosterQuery)
    : eligiblePlayers

  // --- Player quick-view (PlayerSheet) data, computed for the tapped player ---
  const today = new Date().toISOString().slice(0, 10)

  const playerHistory = useMemo(() => {
    if (!selectedPlayer) return []
    const entries: Array<{
      rawDate: string; jNumber?: number; isHome: boolean
      oppName: string; team: typeof clubTeamsInPhase[0]; date: string; isPast: boolean
    }> = []
    for (const t of clubTeamsInPhase) {
      const mdInGroup = new Set(
        matchDays.filter((md) => md.groupId === t.groupId).map((md) => md.id),
      )
      for (const g of games) {
        if ((g.homeTeamId !== t.id && g.awayTeamId !== t.id) || !mdInGroup.has(g.matchDayId)) continue
        const sel = gameSelections.find((s) => s.teamId === t.id && s.gameId === g.id)
        if (!sel?.playerIds.includes(selectedPlayer.id)) continue
        const md = matchDays.find((day) => day.id === g.matchDayId)
        if (!md) continue
        const isHome = g.homeTeamId === t.id
        const oppTeam = teams.find((ot) => ot.id === (isHome ? g.awayTeamId : g.homeTeamId))
        const gDate = gameDate(g, md)
        entries.push({
          rawDate: gDate,
          jNumber: md.number,
          isHome,
          oppName: oppTeam ? getTeamName(oppTeam, clubs) : '—',
          team: t,
          date: new Date(gDate + 'T12:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'short',
          }),
          isPast: gDate < today,
        })
      }
    }
    return entries.sort((a, b) => a.rawDate.localeCompare(b.rawDate))
  }, [selectedPlayer, clubTeamsInPhase, matchDays, games, gameSelections, teams, clubs, today])

  const brulageInfo = useMemo(() => {
    if (!selectedPlayer || !team) return null
    const info = computeBrulage(selectedPlayer.id, clubTeamsInPhase, matchDays, games, gameSelections)
    if (!info.burnedIntoTeamId) return null
    return teams.find((t) => t.id === info.burnedIntoTeamId) ?? null
  }, [selectedPlayer, team, clubTeamsInPhase, matchDays, games, gameSelections, teams])

  useEffect(() => {
    if (team) navigation.setOptions({ title: getTeamName(team, clubs) })
  }, [team, clubs, navigation])

  if (!team) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Équipe introuvable.</Text>
      </View>
    )
  }

  function openRosterPicker() {
    setDraftPlayerIds(team!.playerIds)
    setDraftCaptainId(team!.captainId)
    setWhatsappDraft(team!.whatsappLink ?? '')
    setRosterQuery('')
    setShowRosterPicker(true)
  }

  function toggleDraftPlayer(pid: string) {
    const removing = draftPlayerIds.includes(pid)
    setDraftPlayerIds(removing ? draftPlayerIds.filter((x) => x !== pid) : [...draftPlayerIds, pid])
    // Removing the draft captain leaves the draft without one (warned on save).
    if (removing && pid === draftCaptainId) setDraftCaptainId('')
  }

  function toggleDraftCaptain(pid: string) {
    setDraftCaptainId((prev) => (prev === pid ? '' : pid))
  }

  function saveRoster() {
    const apply = () => {
      const link = whatsappDraft.trim()
      updateTeam(team!.id, {
        playerIds: draftPlayerIds,
        captainId: draftCaptainId,
        whatsappLink: link || null,
      })
      setShowRosterPicker(false)
    }

    // A captain is required — block saving without one.
    if (!draftCaptainId) {
      Alert.alert(
        'Capitaine requis',
        "Veuillez désigner un capitaine (★) avant d'enregistrer.",
        [{ text: 'OK' }],
      )
      return
    }

    // Captain changed — warn that the outgoing captain loses team management.
    if (draftCaptainId !== team!.captainId) {
      const next = players.find((p) => p.id === draftCaptainId)
      const current = players.find((p) => p.id === team!.captainId)
      const nextName = next ? `${next.firstName} ${next.lastName}` : 'Ce joueur'
      const msg = current
        ? `${nextName} deviendra capitaine. ${current.firstName} ${current.lastName} perdra la gestion de l'équipe.`
        : `${nextName} deviendra capitaine.`
      Alert.alert('Changer de capitaine ?', msg, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: apply },
      ])
      return
    }

    apply()
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Identity header — mirrors the player header: a round team-colour
            badge (the team number) on the left, where a player's avatar sits.
            The WhatsApp group hangs off it as a discreet icon, as on the web
            team cards (#388): joining is occasional, not worth a section. */}
        <View style={styles.identityCard}>
          <TeamColorBadge color={team.color} number={team.number} size={48} />
          <View style={styles.identityText}>
            <Text style={styles.teamName} numberOfLines={1}>{getTeamName(team, clubs)}</Text>
            {division && <Text style={styles.levelBadge}>{division.displayName}</Text>}
          </View>
          {!!team.whatsappLink && (
            <TouchableOpacity
              style={styles.whatsappIconBtn}
              onPress={() => openUrl(team.whatsappLink!)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Groupe WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          {club && (
            <ClubLogo
              clubId={club.id}
              logoUpdatedAt={club.logoUpdatedAt}
              name={club.displayName}
              size={48}
            />
          )}
        </View>

        {/* Roster */}
        <View style={styles.sectionList}>
          <Text style={styles.sectionListTitle}>Joueurs ({members.length})</Text>
          {members.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.playerRow}
              onPress={() => setSelectedPlayer(p)}
            >
              <Text style={styles.playerName}>{p.firstName} {p.lastName}</Text>
              {p.id === team.captainId && <Text style={styles.badge}>Cap.</Text>}
            </TouchableOpacity>
          ))}
          {members.length === 0 && (
            <Text style={[styles.empty, { paddingHorizontal: 16, paddingBottom: 16 }]}>
              Aucun joueur dans cette équipe.
            </Text>
          )}
          {isCaptain && (
            <TouchableOpacity style={styles.addBtn} onPress={openRosterPicker}>
              <Text style={styles.addBtnText}>Modifier l'équipe</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Schedule */}
        {(team.defaultDay || team.defaultTime) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Calendrier</Text>
            {team.defaultDay && team.defaultTime && (
              <View style={styles.scheduleRow}>
                <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.infoText}>{team.defaultDay} {team.defaultTime}</Text>
              </View>
            )}
          </View>
        )}

        {/* All matches for this team (phase switcher lives on the target screen) */}
        {hasGames && (
          <TouchableOpacity
            style={styles.gamesBtn}
            onPress={() =>
              router.push({
                pathname: '/team/phase-games',
                params: { teamId: team.id },
              })
            }
          >
            <View style={styles.gamesBtnLeft}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.gamesBtnText}>Tous les matchs de cette équipe</Text>
            </View>
            <Text style={styles.gamesBtnChevron}>›</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Player quick view */}
      {selectedPlayer && (
        <PlayerSheet
          player={selectedPlayer}
          phaseLabel={phase ? `Saison ${phase.displayName}` : undefined}
          phasePoints={pointsFor(playerPhasePoints, team.phaseId, selectedPlayer.id)}
          gamesPlayed={playerHistory.filter((e) => e.isPast).length}
          gamesTotal={games.filter((g) => {
            if (g.homeTeamId !== team.id && g.awayTeamId !== team.id) return false
            const md = matchDays.find((m) => m.id === g.matchDayId)
            return !!md && gameDate(g, md) < today
          }).length}
          team={team}
          brulageTeam={brulageInfo}
          history={playerHistory.map(
            (e): PlayerHistoryEntry => ({
              jNumber: e.jNumber,
              icon: e.isHome ? 'home' : 'paper-plane-outline',
              text: e.oppName,
              team: e.team,
              date: e.date,
              isPast: e.isPast,
            }),
          )}
          onClose={() => setSelectedPlayer(null)}
          onProfile={() => {
            const p = selectedPlayer
            setSelectedPlayer(null)
            router.push({ pathname: '/player/[id]', params: { id: p.id } })
          }}
        />
      )}

      {/* Team edit modal (captain only): line-up + WhatsApp group link — the
          app's only place to set that link, so it lives with the other team
          edits rather than on the read-only fiche (#388). */}
      {isCaptain && (
        <Modal
          visible={showRosterPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowRosterPicker(false)}
        >
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier l'équipe</Text>
            </View>
            <FlatList
              style={styles.modalList}
              data={shownEligiblePlayers}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.modalFields}>
                  <Text style={styles.fieldLabel}>Groupe WhatsApp</Text>
                  <TextInput
                    style={styles.whatsappInput}
                    value={whatsappDraft}
                    onChangeText={setWhatsappDraft}
                    placeholder="https://chat.whatsapp.com/..."
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  <Text style={styles.fieldHint}>
                    Laissez vide pour retirer le lien de la fiche.
                  </Text>
                  <Text style={styles.fieldLabel}>Composition</Text>
                  <Text style={styles.fieldHint}>Touchez ★ pour le capitaine</Text>
                  {rosterSearchable && (
                    <TextInput
                      style={styles.searchInput}
                      value={rosterQuery}
                      onChangeText={setRosterQuery}
                      placeholder={PLAYER_SEARCH_LABEL}
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      clearButtonMode="while-editing"
                      returnKeyType="search"
                    />
                  )}
                </View>
              }
              ListEmptyComponent={
                rosterQuery.trim() !== '' ? (
                  <Text style={styles.pickerEmpty}>
                    Aucun joueur ne correspond à « {rosterQuery.trim()} ».
                  </Text>
                ) : null
              }
              renderItem={({ item: p }) => {
                const selected = draftPlayerIds.includes(p.id)
                const isCap = p.id === draftCaptainId
                return (
                  <TouchableOpacity
                    style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                    onPress={() => toggleDraftPlayer(p.id)}
                  >
                    <Text style={styles.pickerCheck}>{selected ? '✓' : ''}</Text>
                    <Text style={[styles.playerName, selected && styles.pickerNameSelected]}>
                      {p.firstName} {p.lastName}
                    </Text>
                    {selected ? (
                      <TouchableOpacity
                        onPress={() => toggleDraftCaptain(p.id)}
                        hitSlop={8}
                        style={styles.captainBtn}
                      >
                        <Ionicons
                          name={isCap ? 'star' : 'star-outline'}
                          size={20}
                          color={isCap ? colors.accent : colors.textSecondary}
                        />
                      </TouchableOpacity>
                    ) : (
                      // Reserve the star slot so every row has the same height.
                      <View style={styles.captainBtn} />
                    )}
                  </TouchableOpacity>
                )
              }}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerCancel]}
                onPress={() => setShowRosterPicker(false)}
              >
                <Text style={styles.footerCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.footerBtn, styles.footerSave]} onPress={saveRoster}>
                <Text style={styles.footerSaveText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { gap: 12, paddingTop: 16, paddingBottom: 24 },
  notFound: { padding: 24, color: colors.textSecondary, textAlign: 'center' },

  // Identity header — mirrors the player header card
  identityCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityText: { flex: 1, gap: 6 },
  teamName: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary },
  levelBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // Sections with internal padding + gap (Calendrier)
  section: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // List-style section (Joueurs): no padding/gap so border-separated rows are symmetric
  sectionList: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionListTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playerName: { fontSize: 15, color: colors.textPrimary },
  badge: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  empty: { fontSize: 14, color: colors.textSecondary },
  infoText: { fontSize: 14, color: colors.textPrimary },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // WhatsApp — an icon in the identity banner, as on the web team cards
  whatsappIconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  whatsappInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    marginTop: 4,
  },
  pickerEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },

  // Roster button
  addBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  addBtnText: { fontSize: 14, color: colors.accent, fontFamily: fonts.medium },

  // Phase / games buttons
  gamesBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  gamesBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gamesBtnText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  gamesBtnChevron: { fontSize: 22, color: colors.textSecondary },

  // Modal shared (roster picker)
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.semiBold, color: colors.textPrimary },
  modalList: { flex: 1 },
  listContent: { padding: 16, gap: 1 },

  // Fields above the roster list (WhatsApp link, then the roster heading)
  modalFields: { gap: 6, marginBottom: 10 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  fieldHint: { fontSize: 12, color: colors.textSecondary },

  // Cancel / Save footer — mirrors the PlayerSheet footer.
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  footerCancel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  footerSave: { backgroundColor: colors.accent },
  footerCancelText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  footerSaveText: { fontSize: 15, fontFamily: fonts.semiBold, color: '#fff' },

  // Roster picker rows
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  pickerRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pickerCheck: { width: 20, fontSize: 14, color: colors.accent, fontFamily: fonts.bold },
  pickerNameSelected: { fontFamily: fonts.semiBold },
  captainBtn: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
