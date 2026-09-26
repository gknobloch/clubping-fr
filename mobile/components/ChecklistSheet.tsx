import { useMemo, useState, type ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Sheet } from '@/components/Sheet'
import {
  SelectMark, SelectionActions, SelectionList, SelectionSearch, selection,
} from '@/components/Selection'
import { colors } from '@/constants/colors'
import { PLAYER_SEARCH_THRESHOLD, matchesSearch } from '@shared/lib/playerSearch'

// ---------------------------------------------------------------------------
// Cocher une partie d'une liste, puis l'enregistrer d'un coup (#602)
//
// La feuille de composition du capitaine, en outil général : mêmes pièces
// (`Selection.tsx`), même disposition — titre qui compte, recherche au-delà
// d'une dizaine de noms, ronds rouges, « Annuler / Enregistrer » en bas. Elle
// sert les deux sens des groupes d'un club : les groupes d'un licencié depuis
// sa fiche, et les membres d'un groupe depuis l'onglet Club.
//
// Un brouillon plutôt qu'une écriture par case : l'API remplace l'ensemble en
// une requête, et « Annuler » doit vouloir dire que rien n'a bougé.
// ---------------------------------------------------------------------------

export interface ChecklistOption {
  id: string
  label: string
  /** Une seconde ligne, plus discrète : « Non licencié », « Archivé ». */
  hint?: string
}

/**
 * Une ligne cochable. Une seule cible, la ligne entière — là où celle du
 * capitaine en a deux parce que son nom ouvre un aperçu, ce qu'un groupe
 * n'a pas.
 */
function CheckRow({
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
      style={[selection.row, s.row]}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={option.label}
    >
      <View style={selection.checkTarget}>
        <SelectMark picked={checked} />
      </View>
      <Text style={[selection.name, s.name, checked && selection.namePicked]} numberOfLines={1}>
        {option.label}
      </Text>
      {option.hint ? <Text style={s.hint}>{option.hint}</Text> : null}
    </TouchableOpacity>
  )
}

export function ChecklistSheet({
  title,
  header,
  options,
  selected,
  emptyLabel,
  saveDisabled,
  onSave,
  onClose,
  testID = 'checklist-sheet',
  rowTestIDPrefix = 'check-',
}: {
  title: string
  /** Sous le titre : un nom à saisir, un refus à dire. */
  header?: ReactNode
  options: ChecklistOption[]
  selected: readonly string[]
  emptyLabel: string
  saveDisabled?: boolean
  /** `false` refuse l'enregistrement et garde la feuille ouverte. */
  onSave: (ids: string[]) => void | boolean | Promise<boolean>
  onClose: () => void
  testID?: string
  rowTestIDPrefix?: string
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const searchable = options.length > PLAYER_SEARCH_THRESHOLD

  const shown = useMemo(
    () => (searchable ? options.filter((o) => matchesSearch(o.label, query)) : options),
    [options, query, searchable],
  )

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function save() {
    // Ce qui était coché sans être proposé reste coché : l'enregistrement
    // remplace l'ensemble, et une case que personne n'a vue n'est pas une
    // case que quelqu'un a décochée.
    const offered = new Set(options.map((o) => o.id))
    const ids = [
      ...options.map((o) => o.id).filter((id) => draft.has(id)),
      ...selected.filter((id) => !offered.has(id)),
    ]
    setBusy(true)
    const result = await onSave(ids)
    setBusy(false)
    if (result !== false) onClose()
  }

  return (
    <Sheet onClose={onClose} testID={testID}>
      {/* Compté dans le titre, comme « Sélection — Rixheim PPA 5 (2/4) ». */}
      <Text style={selection.title} testID={`${testID}-title`}>
        {title} ({draft.size})
      </Text>
      {header}
      {searchable && (
        <SelectionSearch testID={`${testID}-search`} value={query} onChangeText={setQuery} />
      )}
      <SelectionList>
        {options.length === 0 && <Text style={selection.empty}>{emptyLabel}</Text>}
        {shown.map((o) => (
          <CheckRow
            key={o.id}
            testID={`${rowTestIDPrefix}${o.id}`}
            option={o}
            checked={draft.has(o.id)}
            onToggle={() => toggle(o.id)}
          />
        ))}
        {searchable && query.trim() !== '' && shown.length === 0 && (
          <Text style={selection.empty}>Aucun résultat pour « {query.trim()} ».</Text>
        )}
      </SelectionList>
      <SelectionActions
        cancelTestID={`${testID}-cancel`}
        saveTestID={`${testID}-save`}
        saveDisabled={saveDisabled || busy}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
  )
}

const s = StyleSheet.create({
  row: { minHeight: 44 },
  name: { flex: 1 },
  hint: { fontSize: 12, color: colors.textSecondary, marginLeft: 8 },
})
