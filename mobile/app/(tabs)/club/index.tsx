import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Screen, contentWidth } from '@/components/Screen'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
import { ClubOverview } from '@/components/club/ClubOverview'
import { ClubChannels } from '@/components/club/ClubChannels'
import { ClubAdminsSection } from '@/components/club/ClubAdminsSection'
import { ClubGroupsSection } from '@/components/club/ClubGroupsSection'
import { ClubCompetitionsSection } from '@/components/club/ClubCompetitionsSection'
import { clubMemberGroups, mayManageMemberGroups } from '@shared/lib/memberGroups'
import { canManageClub } from '@/utils/roles'

// ---------------------------------------------------------------------------
// Mon club (#365) — en sections depuis #604
//
// Aperçu, Canaux, Administrateurs, Groupes, Compétitions. Sur un téléphone,
// empilées dans un seul défilement, comme le /club du web. Sur une tablette,
// un rail à gauche et la section choisie à côté — le motif de Joueurs et
// d'Équipes (#447, #466) : cinq sections qui s'allongent (quarante joueurs
// dans une compétition) ne se lisent plus bout à bout sur une dalle.
//
// Le choix vit dans la route (`?section=`), comme la sélection des autres
// volets (#585) : une rotation ou un retour le retrouve.
// ---------------------------------------------------------------------------

type SectionId = 'apercu' | 'canaux' | 'administrateurs' | 'groupes' | 'competitions'

const SECTIONS: Array<{ id: SectionId; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'apercu', label: 'Aperçu', icon: 'business-outline' },
  { id: 'canaux', label: 'Canaux de communication', icon: 'chatbubbles-outline' },
  { id: 'administrateurs', label: 'Administrateurs', icon: 'shield-checkmark-outline' },
  { id: 'groupes', label: 'Groupes', icon: 'people-outline' },
  { id: 'competitions', label: 'Compétitions', icon: 'trophy-outline' },
]

export default function ClubScreen() {
  const { user } = useAuth()
  const data = useAppData()
  const {
    clubs, users, memberGroups, competitionGroups, competitions, players, teams, divisions,
    gameSelections, seasons, playerSeasonCategories, refreshing, refresh,
  } = data
  const router = useRouter()
  const { isTwoPane } = useLayout()
  const params = useLocalSearchParams<{ section?: string }>()

  const club = user?.clubId ? clubs.find((c) => c.id === user.clubId) : undefined

  if (!club) {
    // The tab is hidden for a member with no club, so this is the transient
    // case: the payload has not arrived yet, or the club was archived away.
    return (
      <Screen>
        <View style={s.empty}>
          <Text style={s.emptyText}>Club introuvable.</Text>
        </View>
      </Screen>
    )
  }

  const canManage = !!user && canManageClub(user, club.id)
  const groups = clubMemberGroups(memberGroups, club.id)
  const canManageGroups = mayManageMemberGroups(user, club.id)
  // A member of a club with no group is spared the section, rail entry and all.
  const sections = SECTIONS.filter((x) => x.id !== 'groupes' || groups.length > 0 || canManageGroups)
  const selected: SectionId = sections.some((x) => x.id === params.section)
    ? (params.section as SectionId)
    : 'apercu'

  const render = (id: SectionId) => {
    switch (id) {
      case 'apercu':
        return <ClubOverview club={club} />
      case 'canaux':
        return (
          <ClubChannels
            club={club}
            canManage={canManage}
            onAdd={(d) => data.addClubChannel(club.id, d)}
            onUpdate={(channelId, patch) => data.updateClubChannel(club.id, channelId, patch)}
            onDelete={(channelId) => data.deleteClubChannel(club.id, channelId)}
          />
        )
      case 'administrateurs':
        return (
          <ClubAdminsSection
            club={club}
            viewer={user}
            users={users}
            onAdd={(userId) => data.addClubAdmin(club.id, userId)}
            onRemove={(userId) => data.removeClubAdmin(club.id, userId)}
          />
        )
      case 'groupes':
        return (
          <ClubGroupsSection
            club={club}
            groups={groups}
            users={users}
            competitions={competitions}
            competitionGroups={competitionGroups}
            canManage={canManageGroups}
            onCreate={(name) => data.addMemberGroup(club.id, name)}
            onRename={(groupId, name) => data.renameMemberGroup(club.id, groupId, name)}
            onSetMembers={(groupId, ids) => data.setMemberGroupMembers(club.id, groupId, ids)}
            onDelete={(groupId) => data.deleteMemberGroup(club.id, groupId)}
          />
        )
      case 'competitions':
        return (
          <ClubCompetitionsSection
            club={club}
            canManage={canManageGroups}
            groups={groups}
            players={players}
            teams={teams}
            divisions={divisions}
            competitions={competitions}
            competitionGroups={competitionGroups}
            gameSelections={gameSelections}
            seasons={seasons}
            playerSeasonCategories={playerSeasonCategories}
            onChooseGroup={(competitionId, groupId) => data.setCompetitionGroup(club.id, competitionId, groupId)}
            onSetMembers={(groupId, ids) => data.setMemberGroupMembers(club.id, groupId, ids)}
          />
        )
    }
  }

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} />

  if (!isTwoPane) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[s.scroll, contentWidth()]} refreshControl={refreshControl}>
          {sections.map((x) => <View key={x.id} style={s.stacked}>{render(x.id)}</View>)}
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen style={s.split}>
      <ScrollView style={s.rail} contentContainerStyle={s.railContent} testID="club-rail">
        {sections.map((x) => {
          const on = x.id === selected
          return (
            <TouchableOpacity
              key={x.id}
              testID={`club-rail-${x.id}`}
              style={[s.railItem, on && s.railItemOn]}
              onPress={() => router.setParams({ section: x.id })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={x.icon} size={20} color={on ? colors.accent : colors.textSecondary} />
              <Text style={[s.railLabel, on && s.railLabelOn]} numberOfLines={1}>{x.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <ScrollView style={s.pane} contentContainerStyle={[s.scroll, contentWidth()]} refreshControl={refreshControl}>
        <View style={s.stacked}>{render(selected)}</View>
      </ScrollView>
    </Screen>
  )
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 16 },
  stacked: { gap: 16 },
  split: { flexDirection: 'row' },
  rail: {
    width: LIST_PANE_WIDTH,
    flexGrow: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  railContent: { padding: 12, gap: 8 },
  // The Joueurs list's selected row, so the two rails read as one pattern.
  railItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  railItemOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  railLabel: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  railLabelOn: { color: colors.accent, fontFamily: fonts.semiBold },
  pane: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
})
