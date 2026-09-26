import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { GROUP_MATCH_LABELS, type GroupMatch } from '@shared/lib/memberGroups'
import type { MemberGroup } from '@shared/types'

// ---------------------------------------------------------------------------
// Filtrer les joueurs par groupe (#602)
//
// Des pastilles, comme sur le web : un club a une poignée de groupes, et une
// rangée de noms dit d'un coup d'œil ce que la liste montre. Elle défile de
// côté plutôt que de passer à la ligne — sous le champ de recherche, chaque
// ligne de plus est une ligne de joueurs de moins.
//
// « Au moins un / Tous » n'apparaît qu'à la deuxième pastille : avant, les
// deux réponses sont les mêmes.
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
  if (groups.length === 0) return null
  const chosen = groups.filter((g) => selected.includes(g.id)).map((g) => g.id)

  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id], mode)

  return (
    <View style={s.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        keyboardShouldPersistTaps="handled"
      >
        {groups.map((g) => {
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
      </ScrollView>

      {chosen.length >= 2 && (
        <View style={s.modes} accessibilityRole="radiogroup">
          {(['any', 'all'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              testID={`group-mode-${m}`}
              style={[s.mode, mode === m && s.modeOn]}
              onPress={() => onChange(chosen, m)}
              accessibilityRole="radio"
              accessibilityLabel={GROUP_MATCH_LABELS[m]}
              accessibilityState={{ checked: mode === m }}
            >
              <Text style={[s.modeText, mode === m && s.modeTextOn]}>{GROUP_MATCH_LABELS[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 10, gap: 8 },
  chips: { gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textSecondary },
  chipTextOn: { color: colors.accent, fontFamily: fonts.semiBold },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  clearText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.accent },
  modes: {
    flexDirection: 'row', alignSelf: 'flex-start',
    borderRadius: 10, borderWidth: 1, borderColor: colors.accent, overflow: 'hidden',
  },
  mode: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.card },
  modeOn: { backgroundColor: colors.accent },
  modeText: { fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  modeTextOn: { color: '#ffffff', fontFamily: fonts.semiBold },
})
