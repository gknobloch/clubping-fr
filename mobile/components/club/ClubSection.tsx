import type { ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Les sections de l'onglet Club (#604)
//
// Aperçu, Canaux, Administrateurs, Groupes, Compétitions : empilées sur un
// téléphone, une à la fois à côté d'un rail sur une tablette. Chacune porte le
// même cadre — un titre, et à droite l'action qui en crée un de plus — pour
// que les cinq se lisent comme une seule page.
// ---------------------------------------------------------------------------

export function ClubSection({
  title,
  action,
  testID,
  children,
}: {
  title: string
  /** « + Nouveau », « + Désigner » — shown to whoever may use it. */
  action?: { label: string; onPress: () => void; testID?: string }
  testID?: string
  children: ReactNode
}) {
  return (
    <View style={section.card} testID={testID}>
      <View style={section.header}>
        <Text style={section.title}>{title}</Text>
        {action && (
          <TouchableOpacity
            testID={action.testID}
            onPress={action.onPress}
            hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
            accessibilityRole="button"
          >
            <Text style={section.action}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  )
}

/** A row's trailing icon button — edit, delete — at the 44pt floor. */
export function RowIcon({
  name,
  label,
  onPress,
  danger,
  testID,
}: {
  name: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  danger?: boolean
  testID?: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={section.iconButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={name} size={20} color={danger ? colors.danger : colors.accent} />
    </TouchableOpacity>
  )
}

export const section = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  action: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.accent },
  empty: { fontSize: 14, color: colors.textSecondary },
  hint: { fontSize: 13, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  rowIcon: { width: 20 },
  rowBody: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowTitle: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  rowSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: { backgroundColor: colors.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, color: colors.textSecondary },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
