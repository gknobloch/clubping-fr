import { useMemo, useState } from 'react'
import {
  Alert, Modal, View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { contentWidth } from '@/components/Screen'
import { CheckRow, type ChecklistOption } from '@/components/ChecklistSheet'
import type { MemberGroup } from '@shared/types'
import type { MemberGroupResult } from '@shared/lib/memberGroups'

// ---------------------------------------------------------------------------
// Créer, renommer, remplir ou supprimer un groupe du club (#602)
//
// Un seul écran pour les quatre gestes, parce que sur un téléphone un groupe
// se crée *avec* ses membres : un nom seul, puis un second passage pour y
// mettre quelqu'un, c'est deux feuilles là où une suffit. Plein écran et non
// une `Sheet` : un club de quarante membres est une liste qu'on fait défiler,
// avec un champ de recherche au-dessus.
//
// Monté à l'ouverture, démonté à la fermeture — c'est ce qui sème le
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
  const [draft, setDraft] = useState<Set<string>>(() => new Set(group?.memberIds ?? []))
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr')
    return q ? members.filter((m) => m.label.toLocaleLowerCase('fr').includes(q)) : members
  }, [members, query])

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    // Le nom d'abord : c'est la seule écriture que l'API peut refuser, et un
    // refus doit laisser la feuille ouverte sans avoir rien écrit d'autre.
    let target = group
    if (!group) {
      const result = await onCreate(name)
      if (!result.ok) { setError(result.message); setBusy(false); return }
      target = result.group
    } else if (name.trim() !== group.displayName) {
      const result = await onRename(name)
      if (!result.ok) { setError(result.message); setBusy(false); return }
    }
    // Ce qui était dans le groupe sans être proposé y reste — voir
    // `ChecklistSheet`.
    const offered = new Set(members.map((m) => m.id))
    const ids = [
      ...members.map((m) => m.id).filter((id) => draft.has(id)),
      ...(group?.memberIds ?? []).filter((id) => !offered.has(id)),
    ]
    const before = group?.memberIds ?? []
    const changed = ids.length !== before.length || ids.some((id) => !before.includes(id))
    if (target && changed) onSetMembers(target.id, ids)
    setBusy(false)
    onClose()
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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={8} testID="group-edit-cancel">
              <Text style={styles.cancel}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{group ? 'Modifier le groupe' : 'Nouveau groupe'}</Text>
            <TouchableOpacity
              onPress={save}
              hitSlop={8}
              disabled={busy || !name.trim()}
              testID="group-edit-save"
            >
              <Text style={[styles.save, (busy || !name.trim()) && styles.saveDisabled]}>
                Enregistrer
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[styles.scroll, contentWidth()]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nom</Text>
              <TextInput
                style={styles.fieldInput}
                testID="group-edit-name"
                value={name}
                onChangeText={setName}
                maxLength={60}
                placeholder="Bureau, Jeunes, Loisirs…"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="sentences"
                autoCorrect={false}
              />
              {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            </View>

            <View style={styles.field}>
              <View style={styles.membersHeader}>
                <Text style={styles.fieldLabel}>Membres</Text>
                <Text style={styles.count}>{draft.size}</Text>
              </View>
              {members.length > 12 && (
                <TextInput
                  style={styles.search}
                  testID="group-edit-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Rechercher…"
                  placeholderTextColor={colors.textSecondary}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                />
              )}
              {members.length === 0 && (
                <Text style={styles.empty}>Ce club n’a encore aucun membre.</Text>
              )}
              {shown.map((m) => (
                <CheckRow
                  key={m.id}
                  testID={`group-member-${m.id}`}
                  option={m}
                  checked={draft.has(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </View>

            {group && (
              <TouchableOpacity
                testID="group-edit-delete"
                style={styles.delete}
                onPress={confirmDelete}
                accessibilityRole="button"
              >
                <Text style={styles.deleteText}>Supprimer le groupe</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  cancel: { fontSize: 15, color: colors.textSecondary },
  save: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.accent },
  saveDisabled: { opacity: 0.4 },
  scroll: { padding: 16, gap: 16 },
  field: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
  },
  fieldLabel: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
  fieldInput: { fontSize: 16, color: colors.textPrimary, letterSpacing: 0 },
  error: { fontSize: 13, color: colors.danger },
  membersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textSecondary },
  search: {
    backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: colors.textPrimary,
    letterSpacing: 0, marginBottom: 4,
  },
  empty: { fontSize: 14, color: colors.textSecondary },
  delete: {
    minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.accentSoftBorder,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.danger },
})
