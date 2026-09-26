import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Screen, contentWidth } from '@/components/Screen'
import { ClubLogo } from '@/components/ClubLogo'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { CHANNEL_LABELS, formatAddress, mapsUrl } from '@/utils/club'
import type { Address, ClubChannel, ClubChannelType, MemberGroup, User } from '@shared/types'
import { MemberGroupEditor } from '@/components/MemberGroupEditor'
import type { ChecklistOption } from '@/components/ChecklistSheet'
import { clubMemberGroups, groupDeletionMessage, mayManageMemberGroups } from '@shared/lib/memberGroups'
import { sortByName } from '@shared/lib/sortByName'

// ---------------------------------------------------------------------------
// Mon club — read-only view of the member's own club (#365)
//
// Mirrors what the web shows a player on /club (src/pages/MyClubPage.tsx):
// identity, addresses, communication channels. Editing those stays on the web
// for now. Everything here is already in the GET /api/data payload.
//
// The club's groups (#602) are the exception: every member reads them and
// follows one to its players, and an admin creates and fills them right here —
// « qui est au bureau cette saison » is a question asked in the gymnasium.
// ---------------------------------------------------------------------------

// The web draws these inline (it has no icon library); the names below are the
// Ionicons it points at — see the note in src/components/ClubDetailView.tsx.
const CHANNEL_ICONS: Record<ClubChannelType, keyof typeof Ionicons.glyphMap> = {
  website: 'globe-outline',
  whatsapp: 'logo-whatsapp',
  facebook: 'logo-facebook',
  other: 'link-outline',
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    /* no app to handle it — nothing useful to say beyond not crashing */
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function AddressRow({ address }: { address: Address }) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => openUrl(mapsUrl(address))}
      accessibilityRole="button"
      accessibilityLabel={`${address.label} — ouvrir dans le plan`}
    >
      <View style={s.rowBody}>
        <View style={s.rowTitleLine}>
          <Text style={s.rowTitle}>{address.label}</Text>
          {address.isDefault && (
            <View style={s.badge}>
              <Text style={s.badgeText}>Par défaut</Text>
            </View>
          )}
        </View>
        <Text style={s.rowSubtitle}>{formatAddress(address)}</Text>
      </View>
      <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  )
}

function ChannelRow({ channel }: { channel: ClubChannel }) {
  const label = channel.displayName?.trim() || CHANNEL_LABELS[channel.type]
  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => openUrl(channel.link)}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Ionicons
        name={CHANNEL_ICONS[channel.type]}
        size={20}
        color={colors.textSecondary}
        style={s.rowIcon}
      />
      {/* Label only, as on the web: the raw link is long, unreadable and
          says nothing the label doesn't. */}
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{label}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  )
}

/** The club's members as checklist rows — archived ones only while still in. */
function memberOptions(users: User[], clubId: string, current: string[]): ChecklistOption[] {
  return sortByName(
    users
      .filter((u) => u.clubId === clubId && (u.status !== 'archived' || current.includes(u.id)))
      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
  ).map((u) => ({
    id: u.id,
    label: `${u.firstName} ${u.lastName}`.trim() || u.email || 'Sans nom',
    hint: u.status === 'archived' ? 'Archivé' : !u.isPlayer ? 'Non licencié' : undefined,
  }))
}

function GroupRow({
  group,
  deletionMessage,
  onOpen,
  onEdit,
  onDelete,
}: {
  group: MemberGroup
  /** What deleting it does — see `groupDeletionMessage`. */
  deletionMessage: string
  onOpen: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const n = group.memberIds.length
  return (
    <View style={s.row}>
      <TouchableOpacity
        testID={`club-group-${group.id}`}
        style={s.groupOpen}
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`${group.displayName} — voir les joueurs`}
      >
        <Ionicons name="people-outline" size={20} color={colors.textSecondary} style={s.rowIcon} />
        <View style={s.rowBody}>
          <Text style={s.rowTitle}>{group.displayName}</Text>
          <Text style={s.rowSubtitle}>{n} membre{n > 1 ? 's' : ''}</Text>
        </View>
      </TouchableOpacity>
      {onEdit && (
        <TouchableOpacity
          testID={`club-group-edit-${group.id}`}
          style={s.iconButton}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Modifier ${group.displayName}`}
        >
          <Ionicons name="create-outline" size={20} color={colors.accent} />
        </TouchableOpacity>
      )}
      {/* On the row, not inside the editor (#602): deleting is done to a
          group, not while filling one — the web's « … » says the same. */}
      {onDelete && (
        <TouchableOpacity
          testID={`club-group-delete-${group.id}`}
          style={s.iconButton}
          onPress={() =>
            Alert.alert(
              `Supprimer « ${group.displayName} » ?`,
              deletionMessage,
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: onDelete },
              ],
            )}
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${group.displayName}`}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  )
}

export default function ClubScreen() {
  const { user } = useAuth()
  const {
    clubs, users, memberGroups, competitionGroups, competitions, refreshing, refresh,
    addMemberGroup, renameMemberGroup, deleteMemberGroup, setMemberGroupMembers,
  } = useAppData()
  const router = useRouter()
  // `{}` is a new group, `{ group }` an existing one, null nothing open.
  const [editing, setEditing] = useState<{ group?: MemberGroup } | null>(null)

  const club = user?.clubId ? clubs.find((c) => c.id === user.clubId) : undefined
  const groups = clubMemberGroups(memberGroups, club?.id)
  const canManageGroups = !!club && mayManageMemberGroups(user, club.id)
  const editedMembers = useMemo(
    () => (club && editing ? memberOptions(users, club.id, editing.group?.memberIds ?? []) : []),
    [users, club, editing],
  )

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

  const addresses = club.addresses ?? []
  const channels = [...(club.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[s.scroll, contentWidth()]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={s.identity}>
          <ClubLogo
            clubId={club.id}
            logoUpdatedAt={club.logoUpdatedAt}
            name={club.displayName}
            size={56}
          />
          <View style={s.identityBody}>
            <Text style={s.clubName}>{club.displayName}</Text>
            <Text style={s.affiliation}>N° {club.affiliationNumber}</Text>
          </View>
        </View>

        <Section title="Adresses">
          {addresses.length === 0 ? (
            <Text style={s.sectionEmpty}>Aucune adresse.</Text>
          ) : (
            addresses.map((a) => <AddressRow key={a.id} address={a} />)
          )}
        </Section>

        <Section title="Canaux de communication">
          {channels.length === 0 ? (
            <Text style={s.sectionEmpty}>Aucun canal.</Text>
          ) : (
            channels.map((ch) => <ChannelRow key={ch.id} channel={ch} />)
          )}
        </Section>

        {/* Nothing to read and nothing to do: a member of a club with no group
            is spared a section about a feature they cannot use. */}
        {(groups.length > 0 || canManageGroups) && (
          <View style={s.section} testID="club-groups">
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Groupes</Text>
              {canManageGroups && (
                <TouchableOpacity
                  testID="club-group-new"
                  onPress={() => setEditing({})}
                  hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
                  accessibilityRole="button"
                >
                  <Text style={s.headerLink}>+ Nouveau</Text>
                </TouchableOpacity>
              )}
            </View>
            {groups.length === 0 ? (
              <Text style={s.sectionEmpty}>Aucun groupe.</Text>
            ) : (
              groups.map((g) => (
                <GroupRow
                  key={g.id}
                  group={g}
                  deletionMessage={groupDeletionMessage(g, competitionGroups, competitions)}
                  // Pushed on this tab's own stack, not a tab switch: the
                  // chevron returns here, and Club stays lit.
                  onOpen={() => router.push({ pathname: '/club/membres', params: { groupes: g.id } })}
                  onEdit={canManageGroups ? () => setEditing({ group: g }) : undefined}
                  onDelete={canManageGroups ? () => deleteMemberGroup(club.id, g.id) : undefined}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {editing && (
        <MemberGroupEditor
          group={editing.group}
          members={editedMembers}
          onCreate={(name) => addMemberGroup(club.id, name)}
          onRename={(name) => renameMemberGroup(club.id, editing.group!.id, name)}
          onSetMembers={(groupId, ids) => setMemberGroupMembers(club.id, groupId, ids)}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 16 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  identityBody: { flex: 1 },
  clubName: { fontSize: 18, fontFamily: fonts.semiBold, color: colors.textPrimary },
  affiliation: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionEmpty: { fontSize: 14, color: colors.textSecondary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLink: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.accent },
  groupOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: { width: 20 },
  rowBody: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  rowSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: {
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
})
