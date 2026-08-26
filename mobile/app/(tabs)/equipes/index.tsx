import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useAppData } from '@/contexts/DataContext'
import { orderPhases, defaultPhase } from '@shared/lib/phases'
import { useAuth } from '@/contexts/AuthContext'
import { getTeamName } from '@/utils/roles'
import { Screen, contentWidth } from '@/components/Screen'
import { Switcher } from '@/components/Switcher'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import { colors } from '@/constants/colors'
import { useMemo, useState } from 'react'
import { fonts } from '@/constants/typography'

export default function EquipesScreen() {
  const { teams, clubs, phases, divisions, refreshing, refresh } = useAppData()
  const { user } = useAuth()
  const router = useRouter()

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

  return (
    <Screen>
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
          return (
            <TouchableOpacity
              key={team.id}
              style={styles.card}
              onPress={() => router.push(`/team/${team.id}`)}
            >
              <TeamColorBadge color={team.color} number={team.number} size={40} />
              <View style={styles.cardBody}>
                <Text style={styles.teamName}>{getTeamName(team, clubs)}</Text>
                {division && <Text style={styles.levelBadge}>{division.displayName}</Text>}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )
        })}

        {phase && phaseTeams.length === 0 && (
          <Text style={styles.empty}>Aucune équipe pour cette phase.</Text>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },

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
