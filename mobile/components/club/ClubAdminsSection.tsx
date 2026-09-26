import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { SelectionList, SelectionSearch, selection } from '@/components/Selection'
import { colors } from '@/constants/colors'
import { MAX_CLUB_ADMINS, canManageClubAdmins, clubAdminsOf } from '@shared/lib/clubAdmins'
import { hasVisited, lastSeenSentence } from '@shared/lib/lastSeen'
import { PLAYER_SEARCH_THRESHOLD, matchesSearch } from '@shared/lib/playerSearch'
import { sortByName } from '@shared/lib/sortByName'
import type { Club, User } from '@shared/types'
import type { ClubAdminResult } from '@/contexts/DataContext'
import { ClubSection, RowIcon, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Administrateurs (#474) — dans l'app depuis #604
//
// Qui gère le club, pour tout le monde ; désigner et retirer, pour ceux qui le
// gèrent déjà. Les règles — cinq au plus, jamais zéro — sont celles de
// `src/lib/clubAdmins.ts`, et c'est la phrase de l'API qui s'affiche quand elle
// refuse : un écran en retard n'invente pas sa propre raison.
//
// Inviter quelqu'un qui n'a pas de licence reste sur le web : cela crée une
// personne, avec l'adresse par laquelle elle se connectera.
// ---------------------------------------------------------------------------

const nameOf = (u: Pick<User, 'firstName' | 'lastName' | 'email'>) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || 'Sans nom'

export function ClubAdminsSection({
  club,
  viewer,
  users,
  onAdd,
  onRemove,
}: {
  club: Club
  viewer: User | null
  users: User[]
  onAdd: (userId: string) => Promise<ClubAdminResult>
  onRemove: (userId: string) => Promise<ClubAdminResult>
}) {
  const [picking, setPicking] = useState(false)
  const canManage = canManageClubAdmins(viewer, club.id)

  const admins = useMemo(
    () => sortByName(clubAdminsOf(users, club.id).map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' }))),
    [users, club.id],
  )
  // Members of the club who could be appointed: active players who are not
  // admins already — the picker offers nothing the API would refuse.
  const promotable = useMemo(
    () => sortByName(
      users
        .filter((u) => u.clubId === club.id && u.isPlayer && u.status !== 'archived' && u.role !== 'club_admin')
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    ),
    [users, club.id],
  )
  const full = admins.length >= MAX_CLUB_ADMINS

  const refused = (result: ClubAdminResult) => {
    if (!result.ok) Alert.alert('Impossible', result.message)
  }

  const confirmRemove = (admin: User) => {
    // The last-admin rule is the API's, but saying it before the tap spares a
    // member a refusal they can do nothing about.
    if (admins.length <= 1) {
      Alert.alert('Dernier administrateur', "Désignez-en un autre avant de le retirer.")
      return
    }
    Alert.alert(
      `Retirer ${nameOf(admin)} des administrateurs ?`,
      admin.isPlayer
        ? 'Cette personne reste joueuse du club, avec son équipe et ses disponibilités.'
        : "Cette personne reste membre du club mais n'aura plus accès à rien tant qu'elle n'est pas à nouveau désignée.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: async () => refused(await onRemove(admin.id)) },
      ],
    )
  }

  return (
    <ClubSection
      title={`Administrateurs · ${admins.length} / ${MAX_CLUB_ADMINS}`}
      testID="club-admins"
      action={canManage && !full
        ? { label: '+ Désigner', onPress: () => setPicking(true), testID: 'club-admin-new' }
        : undefined}
    >
      {canManage && (
        <Text style={section.hint}>
          Les administrateurs gèrent le club, ses équipes et ses joueurs. {MAX_CLUB_ADMINS} au maximum, et au moins un.
        </Text>
      )}
      {admins.length === 0 && <Text style={section.empty}>Aucun administrateur.</Text>}
      {admins.map((admin) => (
        <View key={admin.id} style={section.row} testID={`club-admin-${admin.id}`}>
          <View style={section.rowBody}>
            <View style={section.rowTitleLine}>
              <Text style={section.rowTitle}>{nameOf(admin)}</Text>
              {!admin.isPlayer && (
                <View style={section.badge}>
                  <Text style={section.badgeText}>Non licencié</Text>
                </View>
              )}
            </View>
            {/* The visit is only ever sent to those who administer the club
                (#406): for anyone else it is uniformly absent, and saying
                « Jamais connecté » would be false. */}
            {canManage && (
              <Text style={[section.rowSubtitle, !hasVisited(admin.lastSeenAt) && s.never]}>
                {lastSeenSentence(admin.lastSeenAt)}
              </Text>
            )}
          </View>
          {canManage && (
            <RowIcon
              testID={`club-admin-remove-${admin.id}`}
              name="person-remove-outline"
              label={`Retirer ${nameOf(admin)}`}
              danger
              onPress={() => confirmRemove(admin)}
            />
          )}
        </View>
      ))}
      {canManage && full && (
        <Text style={section.hint}>Le club a atteint le maximum de {MAX_CLUB_ADMINS} administrateurs.</Text>
      )}

      {picking && (
        <AdminPicker
          members={promotable}
          onPick={(u) => {
            setPicking(false)
            Alert.alert(`Désigner ${nameOf(u)} administrateur ?`, 'Cette personne pourra gérer le club, ses équipes et ses joueurs.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Désigner', onPress: async () => refused(await onAdd(u.id)) },
            ])
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </ClubSection>
  )
}

/** Pick one member of the club — the captain's sheet, one name at a time. */
function AdminPicker({
  members,
  onPick,
  onClose,
}: {
  members: Array<User & { firstName: string; lastName: string }>
  onPick: (u: User) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const searchable = members.length > PLAYER_SEARCH_THRESHOLD
  const shown = searchable ? members.filter((m) => matchesSearch(nameOf(m), query)) : members
  return (
    <Sheet onClose={onClose} testID="admin-picker">
      <Text style={selection.title}>Désigner un administrateur</Text>
      {searchable && <SelectionSearch testID="admin-picker-search" value={query} onChangeText={setQuery} />}
      <SelectionList>
        {members.length === 0 && (
          <Text style={selection.empty}>Tous les membres actifs du club sont déjà administrateurs.</Text>
        )}
        {shown.map((m) => (
          <TouchableOpacity
            key={m.id}
            testID={`admin-pick-${m.id}`}
            style={[selection.row, s.pickRow]}
            onPress={() => onPick(m)}
            accessibilityRole="button"
          >
            <Text style={selection.name}>{nameOf(m)}</Text>
          </TouchableOpacity>
        ))}
      </SelectionList>
      {/* A pick is the tap on a name: the one button left is the way out. */}
      <View style={selection.actions}>
        <TouchableOpacity testID="admin-picker-cancel" style={selection.cancelBtn} onPress={onClose}>
          <Text style={selection.cancelTxt}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  never: { color: colors.warningText },
  pickRow: { minHeight: 48 },
})
