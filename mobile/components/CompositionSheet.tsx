import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Aligner un joueur depuis la grille (#468)
//
// The web lets a captain set, from the matrix itself, which of the club's teams
// a player turns out for on a given journée — a `TeamSelect` in the Compo cell.
// This is that control, as a sheet: a 96pt column has no room for a dropdown,
// and `Sheet` is already a bottom sheet on a phone and a centred dialog on a
// slab (#446).
//
// The options are the club's teams that actually play that round and that the
// player is *eligible* for — brûlage and the same-poule rule, both from
// `isPlayerEligibleForTeam`. A team the player is already fielded in stays on
// the list whatever the rules now say, or there would be no way to undo it.
// ---------------------------------------------------------------------------

export interface CompositionOption {
  teamId: string
  number: number
  color?: string
  isHome: boolean
  opponentName: string
}

export function CompositionSheet({
  title,
  subtitle,
  options,
  value,
  onPick,
  onClose,
}: {
  /** Who is being fielded. */
  title: string
  /** Which round — «J5 · sam. 17 janv.». */
  subtitle?: string
  options: CompositionOption[]
  /** The team they are currently fielded in, if any. */
  value?: string
  onPick: (teamId: string | null) => void
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose} testID="composition-sheet" maxHeight="70%">
      <View style={s.body}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

        <ScrollView style={s.list} contentContainerStyle={s.listContent}>
          {options.map((option) => {
            const active = value === option.teamId
            return (
              <TouchableOpacity
                key={option.teamId}
                testID={`compose-team-${option.teamId}`}
                style={[s.option, active && s.optionActive]}
                onPress={() => onPick(option.teamId)}
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : {}}
              >
                <View style={[s.dot, { backgroundColor: option.color ?? colors.accent }]} />
                <View style={s.optionBody}>
                  <Text style={[s.optionText, active && s.optionTextActive]}>
                    Équipe {option.number}
                  </Text>
                  <Text style={s.optionMeta} numberOfLines={1}>
                    {option.isHome ? '⌂ ' : '↗ '}{option.opponentName}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}

          {options.length === 0 && (
            <Text style={s.empty}>
              Aucune équipe où l&apos;aligner cette journée — le brûlage ferme les autres.
            </Text>
          )}
        </ScrollView>

        <TouchableOpacity
          testID="compose-none"
          style={[s.option, !value && s.optionActive]}
          onPress={() => onPick(null)}
          accessibilityRole="button"
          accessibilityState={!value ? { selected: true } : {}}
        >
          <View style={[s.dot, s.dotEmpty]} />
          <Text style={[s.optionText, !value && s.optionTextActive]}>Ne pas aligner</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 10 },
  title: { fontSize: 17, fontFamily: fonts.semiBold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: -6, marginBottom: 4 },
  list: { flexGrow: 0 },
  listContent: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionBody: { flex: 1 },
  optionText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  optionTextActive: { color: colors.accent },
  optionMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
  empty: { fontSize: 13, color: colors.textSecondary, paddingVertical: 8 },
})
