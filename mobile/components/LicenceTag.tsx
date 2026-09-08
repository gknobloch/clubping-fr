import { View, Text, StyleSheet } from 'react-native'
import { fonts } from '@/constants/typography'
import { LICENCE_MISSING_LABEL } from '@shared/lib/seasonLicences'

/**
 * "Sans licence" — the federation did not list this member's licence for the
 * season (#488).
 *
 * Amber rather than red: it is usually a renewal in flight, not a mistake. But
 * it rides next to the name, because the moment it matters is the moment a
 * captain puts them on a team sheet without thinking about it.
 */
export function LicenceTag() {
  return (
    <View style={lt.tag}>
      <Text style={lt.txt}>{LICENCE_MISSING_LABEL}</Text>
    </View>
  )
}

const lt = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // The two amber values are local: the app's palette has no warning colour yet.
  txt: { fontSize: 11, fontFamily: fonts.semiBold, color: '#92400E' },
})
