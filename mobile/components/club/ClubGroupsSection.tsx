import { useMemo, useState } from 'react'
import { Alert, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { MemberGroupEditor } from '@/components/MemberGroupEditor'
import type { ChecklistOption } from '@/components/ChecklistSheet'
import { groupDeletionMessage } from '@shared/lib/memberGroups'
import { sortByName } from '@shared/lib/sortByName'
import type { Club, Competition, CompetitionGroup, MemberGroup, User } from '@shared/types'
import type { MemberGroupResult } from '@shared/lib/memberGroups'
import { ClubSection, RowIcon, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Groupes (#602)
//
// Tout le monde les lit et ouvre les joueurs de l'un d'eux ; un administrateur
// les crée, les remplit et les supprime ici — « qui est au bureau cette
// saison » est une question qu'on se pose au gymnase.
// ---------------------------------------------------------------------------

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

export function ClubGroupsSection({
  club,
  groups,
  users,
  competitions,
  competitionGroups,
  canManage,
  onCreate,
  onRename,
  onSetMembers,
  onDelete,
}: {
  club: Club
  groups: MemberGroup[]
  users: User[]
  competitions: Competition[]
  competitionGroups: CompetitionGroup[]
  canManage: boolean
  onCreate: (name: string) => Promise<MemberGroupResult>
  onRename: (groupId: string, name: string) => Promise<MemberGroupResult>
  onSetMembers: (groupId: string, ids: string[]) => void
  onDelete: (groupId: string) => void
}) {
  const router = useRouter()
  // `{}` is a new group, `{ group }` an existing one, null nothing open.
  const [editing, setEditing] = useState<{ group?: MemberGroup } | null>(null)
  const editedMembers = useMemo(
    () => (editing ? memberOptions(users, club.id, editing.group?.memberIds ?? []) : []),
    [users, club.id, editing],
  )

  // Nothing to read and nothing to do: a member of a club with no group is
  // spared a section about a feature they cannot use.
  if (groups.length === 0 && !canManage) return null

  const confirmDelete = (g: MemberGroup) =>
    Alert.alert(`Supprimer « ${g.displayName} » ?`, groupDeletionMessage(g, competitionGroups, competitions), [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(g.id) },
    ])

  return (
    <ClubSection
      title="Groupes"
      testID="club-groups"
      action={canManage ? { label: '+ Nouveau', onPress: () => setEditing({}), testID: 'club-group-new' } : undefined}
    >
      {groups.length === 0 ? (
        <Text style={section.empty}>Aucun groupe.</Text>
      ) : (
        groups.map((g) => {
          const n = g.memberIds.length
          return (
            <View key={g.id} style={section.row}>
              <TouchableOpacity
                testID={`club-group-${g.id}`}
                style={section.rowMain}
                // Pushed on this tab's own stack, not a tab switch: the
                // chevron returns here, and Club stays lit.
                onPress={() => router.push({ pathname: '/club/membres', params: { groupes: g.id } })}
                accessibilityRole="link"
                accessibilityLabel={`${g.displayName} — voir les joueurs`}
              >
                <Ionicons name="people-outline" size={20} color={colors.textSecondary} style={section.rowIcon} />
                <View style={section.rowBody}>
                  <Text style={section.rowTitle}>{g.displayName}</Text>
                  <Text style={section.rowSubtitle}>{n} membre{n > 1 ? 's' : ''}</Text>
                </View>
              </TouchableOpacity>
              {canManage && (
                <>
                  <RowIcon
                    testID={`club-group-edit-${g.id}`}
                    name="create-outline"
                    label={`Modifier ${g.displayName}`}
                    onPress={() => setEditing({ group: g })}
                  />
                  {/* On the row, not inside the editor: deleting is done to a
                      group, not while filling one — the web's « … » says the same. */}
                  <RowIcon
                    testID={`club-group-delete-${g.id}`}
                    name="trash-outline"
                    label={`Supprimer ${g.displayName}`}
                    danger
                    onPress={() => confirmDelete(g)}
                  />
                </>
              )}
            </View>
          )
        })
      )}

      {editing && (
        <MemberGroupEditor
          group={editing.group}
          members={editedMembers}
          onCreate={onCreate}
          onRename={(name) => onRename(editing.group!.id, name)}
          onSetMembers={onSetMembers}
          onClose={() => setEditing(null)}
        />
      )}
    </ClubSection>
  )
}
