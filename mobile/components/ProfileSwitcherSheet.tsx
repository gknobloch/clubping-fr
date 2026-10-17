import { StyleSheet, Text, TouchableOpacity } from 'react-native'
import { Sheet } from '@/components/Sheet'
import { SelectionList, selection } from '@/components/Selection'
import { ProfileChoices } from '@/components/ProfileChoices'
import { colors } from '@/constants/colors'

/**
 * « Changer de profil », from Compte (#640): every profile of the person, the
 * current one marked. The rows are `ProfileChoices`, shared with the header's
 * account menu (#720).
 */
export function ProfileSwitcherSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} testID="profile-sheet">
      <Text style={selection.title}>Changer de profil</Text>
      <Text style={s.hint}>Les profils liés à votre adresse e-mail.</Text>
      <SelectionList>
        <ProfileChoices onSwitched={onClose} />
      </SelectionList>
      <TouchableOpacity testID="profile-sheet-close" style={selection.cancelBtn} onPress={onClose}>
        <Text style={selection.cancelTxt}>Fermer</Text>
      </TouchableOpacity>
    </Sheet>
  )
}

const s = StyleSheet.create({
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
})
