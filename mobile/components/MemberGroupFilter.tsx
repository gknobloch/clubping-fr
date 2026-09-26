import { useState } from 'react'
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native'
import { ChecklistSheet } from '@/components/ChecklistSheet'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { GROUP_MATCH_LABELS, inlineGroupChips, type GroupMatch } from '@shared/lib/memberGroups'
import type { MemberGroup } from '@shared/types'

// ---------------------------------------------------------------------------
// Filtrer les joueurs par groupe (#602)
//
// Des pastilles, comme sur le web, et qui passent à la ligne comme sur le web :
// défilant de côté, la dernière se coupait au bord (« Compétiteurs S… ») et
// rien ne disait qu'il en restait. Deux lignes au plus : au-delà, le reste se
// replie en « +N », qui ouvre tous les groupes dans la feuille du capitaine.
// `inlineGroupChips` en décide, de la même façon que sur le web.
//
// OU / ET n'est pas ici : c'est `GroupMatchSwitch`, rangé avec l'autre
// interrupteur de la liste.
// ---------------------------------------------------------------------------

export function MemberGroupFilter({
  groups,
  selected,
  mode,
  onChange,
}: {
  groups: MemberGroup[]
  selected: readonly string[]
  mode: GroupMatch
  onChange: (selected: string[], mode: GroupMatch) => void
}) {
  const [picking, setPicking] = useState(false)
  if (groups.length === 0) return null
  const chosen = groups.filter((g) => selected.includes(g.id)).map((g) => g.id)
  const { inline, hidden } = inlineGroupChips(groups, chosen)

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id], mode)

  return (
    <View style={s.chips} accessibilityLabel="Filtrer par groupe">
      {inline.map((g) => {
        const on = chosen.includes(g.id)
        return (
          <TouchableOpacity
            key={g.id}
            testID={`group-chip-${g.id}`}
            style={[s.chip, on && s.chipOn]}
            onPress={() => toggle(g.id)}
            accessibilityRole="button"
            accessibilityLabel={g.displayName}
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>{g.displayName}</Text>
          </TouchableOpacity>
        )
      })}
      {hidden > 0 && (
        <TouchableOpacity
          testID="group-filter-more"
          style={[s.chip, s.more]}
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`${hidden} autre${hidden > 1 ? 's' : ''} groupe${hidden > 1 ? 's' : ''}`}
        >
          <Text style={s.moreText}>+{hidden}</Text>
        </TouchableOpacity>
      )}
      {chosen.length > 0 && (
        <TouchableOpacity
          testID="group-filter-clear"
          style={s.clear}
          onPress={() => onChange([], mode)}
          accessibilityRole="button"
        >
          <Text style={s.clearText}>Effacer</Text>
        </TouchableOpacity>
      )}
      {picking && (
        <ChecklistSheet
          testID="group-filter-sheet"
          rowTestIDPrefix="group-pick-"
          title="Groupes"
          searchLabel="Rechercher un groupe"
          saveLabel="Appliquer"
          options={groups.map((g) => ({ id: g.id, label: g.displayName }))}
          selected={chosen}
          emptyLabel="Ce club n’a aucun groupe."
          onSave={(ids) => onChange(ids, mode)}
          onClose={() => setPicking(false)}
        />
      )}
    </View>
  )
}

/**
 * OU ou ET, en interrupteur comme « Joueurs actifs uniquement » juste en
 * dessous : éteint, « Au moins un groupe » ; allumé, « Tous les groupes » — et
 * le libellé dit lequel est en vigueur. Seulement à partir de deux groupes
 * choisis : avant, les deux réponses sont les mêmes.
 */
export function GroupMatchSwitch({
  groups,
  selected,
  mode,
  onChange,
}: {
  groups: MemberGroup[]
  selected: readonly string[]
  mode: GroupMatch
  onChange: (selected: string[], mode: GroupMatch) => void
}) {
  const chosen = groups.filter((g) => selected.includes(g.id)).map((g) => g.id)
  if (chosen.length < 2) return null
  const label = GROUP_MATCH_LABELS[mode]
  return (
    <View style={s.switchRow}>
      <Switch
        testID="group-match-switch"
        value={mode === 'all'}
        onValueChange={(all) => onChange(chosen, all ? 'all' : 'any')}
        trackColor={{ true: colors.accent, false: colors.border }}
        accessibilityLabel={label}
      />
      <Text style={s.switchLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textSecondary },
  chipTextOn: { color: colors.accent, fontFamily: fonts.semiBold },
  more: { borderColor: colors.accentSoftBorder },
  moreText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.accent },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  clearText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.accent },
  // The same row as « Joueurs actifs uniquement » on the Joueurs screen.
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  switchLabel: { fontSize: 13, color: colors.textSecondary },
})
