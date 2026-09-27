import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ClubLogo } from '@/components/ClubLogo'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { formatAddress, mapsUrl } from '@/utils/club'
import type { Club } from '@shared/types'
import { ClubSection, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Aperçu : qui est le club, et où il joue (#365, #604)
// ---------------------------------------------------------------------------

export function ClubOverview({ club }: { club: Club }) {
  const addresses = club.addresses ?? []
  return (
    <>
      <View style={s.identity} testID="club-identity">
        <ClubLogo clubId={club.id} logoUpdatedAt={club.logoUpdatedAt} name={club.displayName} size={56} />
        <View style={s.identityBody}>
          <Text style={s.clubName}>{club.displayName}</Text>
          <Text style={s.affiliation}>N° {club.affiliationNumber}</Text>
        </View>
      </View>

      <ClubSection title="Adresses">
        {addresses.length === 0 ? (
          <Text style={section.empty}>Aucune adresse.</Text>
        ) : (
          addresses.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={section.row}
              onPress={() => Linking.openURL(mapsUrl(a)).catch(() => {})}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} — ouvrir dans le plan`}
            >
              <View style={section.rowBody}>
                <View style={section.rowTitleLine}>
                  <Text style={section.rowTitle}>{a.label}</Text>
                  {a.isDefault && (
                    <View style={section.badge}>
                      <Text style={section.badgeText}>Par défaut</Text>
                    </View>
                  )}
                </View>
                <Text style={section.rowSubtitle}>{formatAddress(a)}</Text>
              </View>
              <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ))
        )}
      </ClubSection>
    </>
  )
}

const s = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  identityBody: { flex: 1 },
  clubName: { fontSize: 18, fontFamily: fonts.semiBold, color: colors.textPrimary },
  affiliation: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
})
