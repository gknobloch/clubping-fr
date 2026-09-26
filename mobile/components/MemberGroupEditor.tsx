import { useState } from 'react'
import { Alert, View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { ChecklistSheet, type ChecklistOption } from '@/components/ChecklistSheet'
import type { MemberGroup } from '@shared/types'
import type { MemberGroupResult } from '@shared/lib/memberGroups'

// ---------------------------------------------------------------------------
// Créer, renommer, remplir ou supprimer un groupe du club (#602)
//
// Une seule feuille pour les quatre gestes, parce qu'un groupe se crée *avec*
// ses membres. C'est la feuille de composition du capitaine (`ChecklistSheet`,
// bâtie sur les mêmes pièces), avec le nom du groupe en tête — le web fait de
// même avec `SelectionPanel`.
//
// Montée à l'ouverture, démontée à la fermeture — c'est ce qui sème le
// brouillon sur le groupe ouvert (même règle que `ContactEditor`, #600).
// ---------------------------------------------------------------------------

export function MemberGroupEditor({
  group,
  members,
  onCreate,
  onRename,
  onSetMembers,
  onDelete,
  onClose,
}: {
  /** Absent pour un nouveau groupe. */
  group?: MemberGroup
  /** Les membres du club à proposer, déjà triés. */
  members: ChecklistOption[]
  onCreate: (name: string) => Promise<MemberGroupResult>
  onRename: (name: string) => Promise<MemberGroupResult>
  onSetMembers: (groupId: string, memberIds: string[]) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(group?.displayName ?? '')
  const [error, setError] = useState<string | null>(null)

  // Le nom d'abord : c'est la seule écriture que l'API peut refuser, et un
  // refus doit laisser la feuille ouverte sans avoir rien écrit d'autre.
  async function save(ids: string[]) {
    setError(null)
    let groupId = group?.id
    if (!group) {
      const result = await onCreate(name)
      if (!result.ok) { setError(result.message); return false }
      groupId = result.group.id
    } else if (name.trim() !== group.displayName) {
      const result = await onRename(name)
      if (!result.ok) { setError(result.message); return false }
    }
    const before = group?.memberIds ?? []
    const changed = ids.length !== before.length || ids.some((id) => !before.includes(id))
    if (groupId && changed) onSetMembers(groupId, ids)
    return true
  }

  function confirmDelete() {
    if (!group) return
    Alert.alert(
      `Supprimer « ${group.displayName} » ?`,
      'Ses membres restent au club : seul le groupe disparaît.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => { onDelete(); onClose() } },
      ],
    )
  }

  return (
    <ChecklistSheet
      testID="group-edit"
      rowTestIDPrefix="group-member-"
      title={group ? 'Modifier le groupe' : 'Nouveau groupe'}
      header={
        <View style={styles.header}>
          <TextInput
            style={styles.name}
            testID="group-edit-name"
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="Nom du groupe — Bureau, Jeunes…"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            autoCorrect={false}
            accessibilityLabel="Nom du groupe"
          />
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {group && (
            <TouchableOpacity
              testID="group-edit-delete"
              onPress={confirmDelete}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
            >
              <Text style={styles.delete}>Supprimer le groupe</Text>
            </TouchableOpacity>
          )}
        </View>
      }
      options={members}
      selected={group?.memberIds ?? []}
      emptyLabel="Ce club n’a encore aucun membre."
      saveDisabled={!name.trim()}
      onSave={save}
      onClose={onClose}
    />
  )
}

const styles = StyleSheet.create({
  header: { gap: 6, marginBottom: 4 },
  name: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, minHeight: 44, fontSize: 15,
    color: colors.textPrimary, backgroundColor: colors.card,
    // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
    letterSpacing: 0,
  },
  error: { fontSize: 13, color: colors.danger },
  delete: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.danger },
})
