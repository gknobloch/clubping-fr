import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { PLAYER_SEARCH_LABEL } from '@shared/lib/playerSearch'

// ---------------------------------------------------------------------------
// Choisir des gens, d'une seule façon (#602)
//
// La feuille de composition du capitaine a posé le geste : un titre qui compte,
// une recherche au-delà d'une dizaine de noms, des ronds qui se remplissent de
// rouge, et « Annuler / Enregistrer » côte à côte en bas, là où est déjà le
// pouce. Ranger des membres dans un groupe est le même geste : il porte les
// mêmes pièces, pas un sosie — deux copies d'un motif divergent une version à
// la fois. Le web a les siennes, `SelectionPanel` / `SelectionRow`.
// ---------------------------------------------------------------------------

/** Le rond : vide, ou plein de rouge avec sa coche blanche. */
export function SelectMark({ picked }: { picked: boolean }) {
  return (
    <View style={[selection.check, picked && selection.checkActive]}>
      {picked && <Text style={selection.checkMark}>✓</Text>}
    </View>
  )
}

/** La recherche de la feuille — même libellé que le web (`PLAYER_SEARCH_LABEL`). */
export function SelectionSearch({
  value,
  onChangeText,
  placeholder = PLAYER_SEARCH_LABEL,
  testID,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  testID?: string
}) {
  return (
    <TextInput
      testID={testID}
      style={selection.search}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType="search"
    />
  )
}

/**
 * La liste qui défile dans la feuille. Elle porte son `flexShrink` avec elle :
 * sans lui, une liste plus haute que le panneau pousse « Annuler /
 * Enregistrer » dehors — voir __tests__/sheet-scroll-shrink.test.ts.
 */
export function SelectionList({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={selection.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

/** « Annuler / Enregistrer », côte à côte au pied de la feuille. */
export function SelectionActions({
  onCancel,
  onSave,
  saveDisabled,
  cancelTestID,
  saveTestID,
}: {
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
  cancelTestID?: string
  saveTestID?: string
}) {
  return (
    <View style={selection.actions}>
      <TouchableOpacity testID={cancelTestID} style={selection.cancelBtn} onPress={onCancel}>
        <Text style={selection.cancelTxt}>Annuler</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID={saveTestID}
        style={[selection.saveBtn, saveDisabled && selection.saveBtnDisabled]}
        onPress={onSave}
        disabled={saveDisabled}
        accessibilityState={{ disabled: !!saveDisabled }}
      >
        <Text style={selection.saveTxt}>Enregistrer</Text>
      </TouchableOpacity>
    </View>
  )
}

export const selection = StyleSheet.create({
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 8 },
  sectionLabel: {
    fontSize: 11, fontFamily: fonts.bold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
  },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, minHeight: 44, fontSize: 15,
    color: colors.textPrimary, backgroundColor: colors.bg, marginTop: 4,
    // iOS renders TextInput placeholders with stray letter-spacing unless an
    // explicit value is set; pin it to 0 so they track normally (#118).
    letterSpacing: 0,
  },
  // Même raison que la feuille de composition : sans `flexShrink`, une liste
  // plus haute que le panneau pousse « Annuler / Enregistrer » dehors. Un
  // effectif de soixante licenciés y arrive.
  list: { marginBottom: 16, flexShrink: 1 },
  empty: {
    fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', paddingVertical: 24,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  // The box is a small mark in a large target: 44pt, the project's rule below
  // `md:`.
  checkTarget: {
    width: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center',
  },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  name: { flexShrink: 1, fontSize: 15, color: colors.textPrimary },
  namePicked: { fontFamily: fonts.semiBold, color: colors.accent },
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
  saveBtnDisabled: { opacity: 0.5 },
  saveTxt: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
})
