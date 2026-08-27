import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAppData } from '@/contexts/DataContext'
import { orderPhases, defaultPhase } from '@shared/lib/phases'
import { useAuth } from '@/contexts/AuthContext'
import { getTeamName } from '@/utils/roles'
import { Screen, contentWidth } from '@/components/Screen'
import { Switcher } from '@/components/Switcher'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import { TeamDetail } from '@/components/TeamDetail'
import { colors } from '@/constants/colors'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
import { useMemo, useState } from 'react'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Équipes, on a slab: the list and the fiche, side by side (#447)
//
// This is the section the two-pane layout is demonstrated on, and it is the
// one that needed it most: a club has half a dozen teams, so on a tablet the
// tab was six cards and then eight hundred points of background.
//
// The right pane is **not** the (detail) stack rendered beside the list. That
// was the obvious route — the shared detail screens already live in a Stack
// nested inside the Tabs so the menu survives a drill-in (#153) — and it is
// the one that costs the most: that Stack wipes itself on blur, which is the
// only thing keeping it from replaying every fiche ever opened as back
// history, and a pane is not something you blur. Rather than rewrite that rule
// for a layout it was never about, the pane renders `TeamDetail` directly, as
// the component it now is. The Stack keeps its meaning untouched: it is still
// where a fiche goes when it is *pushed over* the section — from a phone, or
// from anywhere on a tablet that is not this list (an opponent reached from a
// match), and those pushes still cover the two panes and still reset on the
// way out.
// ---------------------------------------------------------------------------
export default function EquipesScreen() {
  const { teams, clubs, phases, divisions, refreshing, refresh } = useAppData()
  const { user } = useAuth()
  const router = useRouter()
  const { isTwoPane } = useLayout()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visibleTeams =
    user?.role === 'general_admin'
      ? teams
      : teams.filter((t) => t.clubId === user?.clubId)

  // Phases ordered for the < > switcher (chronological by name); default active.
  const orderedPhases = useMemo(() => orderPhases(phases), [phases])
  const fallbackPhase = useMemo(() => defaultPhase(phases), [phases])
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const phase = phases.find((p) => p.id === phaseId) ?? fallbackPhase
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  function selectPhase(next: number) {
    const p = orderedPhases[next]
    if (p) setPhaseId(p.id)
  }

  const phaseTeams = useMemo(
    () =>
      visibleTeams
        .filter((t) => t.phaseId === phase?.id)
        .sort((a, b) => a.number - b.number),
    [visibleTeams, phase],
  )

  // Read from the list rather than held apart from it: the switcher moves the
  // list to another phase, where the selected team does not exist. Deriving it
  // means the pane empties on its own instead of showing a fiche from a phase
  // that is no longer on screen — and fills again on the way back.
  const selectedTeam = phaseTeams.find((t) => t.id === selectedId) ?? null

  function openTeam(id: string) {
    if (isTwoPane) setSelectedId(id)
    else router.push(`/team/${id}`)
  }

  const list = (
    <ScrollView
      contentContainerStyle={[styles.list, contentWidth()]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {phase ? (
        <Switcher
          title={`Saison ${phase.displayName}`}
          onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
          onNext={phaseIndex < orderedPhases.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined}
        />
      ) : null}

      {phaseTeams.map((team) => {
        const division = divisions.find((d) => d.id === team.divisionId)
        const isSelected = team.id === selectedTeam?.id
        return (
          <TouchableOpacity
            key={team.id}
            testID={`team-row-${team.id}`}
            style={[styles.card, isSelected && styles.cardSelected]}
            accessibilityState={isSelected ? { selected: true } : {}}
            onPress={() => openTeam(team.id)}
          >
            <TeamColorBadge color={team.color} number={team.number} size={40} />
            <View style={styles.cardBody}>
              <Text style={styles.teamName}>{getTeamName(team, clubs)}</Text>
              {division && <Text style={styles.levelBadge}>{division.displayName}</Text>}
            </View>
            {/* The chevron promises a screen to come. Beside its own fiche it
                promises nothing — the highlight is what says which row is
                showing. */}
            {!isTwoPane && <Text style={styles.chevron}>›</Text>}
          </TouchableOpacity>
        )
      })}

      {phase && phaseTeams.length === 0 && (
        <Text style={styles.empty}>Aucune équipe pour cette phase.</Text>
      )}
    </ScrollView>
  )

  if (!isTwoPane) return <Screen>{list}</Screen>

  return (
    // One frame for the two panes: `Screen` takes the window's side insets
    // once, here, and each pane sits inside them.
    <Screen style={styles.split}>
      <View style={styles.listPane}>{list}</View>
      <View style={styles.detailPane}>
        {selectedTeam ? (
          <TeamDetail teamId={selectedTeam.id} embedded />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="people-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>
              Choisissez une équipe pour afficher sa fiche.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },

  split: { flexDirection: 'row' },
  listPane: {
    width: LIST_PANE_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  detailPane: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  // The row showing in the pane beside it — the red-tinted surface the app
  // already uses to mark a thing as picked out.
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardBody: { flex: 1, gap: 4 },
  teamName: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
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
  chevron: { fontSize: 22, color: colors.textSecondary, paddingRight: 12 },
  empty: { fontSize: 14, color: colors.textSecondary, paddingHorizontal: 4 },
})
