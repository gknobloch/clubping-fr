import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Cocher une partie d'une liste, puis l'enregistrer d'un coup (#602)
//
// Les groupes d'un licencié, depuis sa fiche : une poignée de lignes, donc une
// feuille et non un écran. Un brouillon plutôt qu'une écriture par case,
// parce que l'API remplace l'ensemble en une requête, et qu'« Annuler » doit
// vouloir dire que rien n'a bougé — même règle que le `ChecklistDialog` du
// web.
// ---------------------------------------------------------------------------

export interface ChecklistOption {
  id: string
  label: string
  /** Une seconde ligne, plus discrète : « Non licencié », « Archivé ». */
  hint?: string
}

/**
 * Une ligne cochable — partagée avec l'éditeur de groupe du club.
 *
 * La ligne du capitaine qui compose (`CaptainSelectionSheet`) : un rond qui se
 * remplit de rouge, le nom qui passe en gras avec lui. Une seule façon de
 * choisir des gens dans cette app, quoi qu'on choisisse.
 */
export function CheckRow({
  option,
  checked,
  onToggle,
  testID,
}: {
  option: ChecklistOption
  checked: boolean
  onToggle: () => void
  testID?: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={s.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={option.label}
    >
      <View style={[s.check, checked && s.checkActive]}>
        {checked && <Text style={s.checkMark}>✓</Text>}
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, checked && s.rowLabelPicked]} numberOfLines={1}>
          {option.label}
        </Text>
        {option.hint ? <Text style={s.rowHint}>{option.hint}</Text> : null}
      </View>
    </TouchableOpacity>
  )
}

export function ChecklistSheet({
  title,
  subtitle,
  options,
  selected,
  emptyLabel,
  onSave,
  onClose,
  testID = 'checklist-sheet',
}: {
  title: string
  subtitle?: string
  options: ChecklistOption[]
  selected: readonly string[]
  emptyLabel: string
  onSave: (ids: string[]) => void
  onClose: () => void
  testID?: string
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  function save() {
    // Ce qui était coché sans être proposé reste coché : l'enregistrement
    // remplace l'ensemble, et une case que personne n'a vue n'est pas une
    // case que quelqu'un a décochée.
    const offered = new Set(options.map((o) => o.id))
    onSave([
      ...options.map((o) => o.id).filter((id) => draft.has(id)),
      ...selected.filter((id) => !offered.has(id)),
    ])
    onClose()
  }

  return (
    <Sheet onClose={onClose} testID={testID} maxHeight="75%">
      <View style={s.body}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

        {/* Même règle que la feuille de composition : sans `flexShrink`, la
            liste pousse les boutons hors du panneau (voir
            __tests__/sheet-scroll-shrink.test.ts). */}
        <ScrollView style={s.list}>
          {options.length === 0 && <Text style={s.empty}>{emptyLabel}</Text>}
          {options.map((o) => (
            <CheckRow
              key={o.id}
              testID={`check-${o.id}`}
              option={o}
              checked={draft.has(o.id)}
              onToggle={() => toggle(o.id)}
            />
          ))}
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity
            testID={`${testID}-cancel`}
            style={[s.button, s.buttonNeutral]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={s.buttonNeutralText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`${testID}-save`}
            style={[s.button, s.buttonPrimary]}
            onPress={save}
            accessibilityRole="button"
          >
            <Text style={s.buttonPrimaryText}>Enregistrer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  body: { gap: 10 },
  title: { fontSize: 17, fontFamily: fonts.semiBold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: -6 },
  list: { flexGrow: 0, flexShrink: 1 },
  empty: { fontSize: 14, color: colors.textSecondary, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.textPrimary },
  rowLabelPicked: { fontFamily: fonts.semiBold, color: colors.accent },
  // Same mark as the captain's sheet, measure for measure.
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  rowHint: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonNeutral: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  buttonNeutralText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { fontSize: 15, fontFamily: fonts.semiBold, color: '#ffffff' },
})
