import { TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'

// Account entry point, in the header of every section (#365).
//
// Compte left the tab bar to make room for Club and keep five tabs, which is
// what the web does too — there the avatar in the top bar is the way to one's
// own profile. A member who is not a player (an admin) has no avatar to show,
// so they get the generic person icon.
export function AccountHeaderButton() {
  const router = useRouter()
  const { user } = useAuth()
  const { players } = useAppData()

  if (!user) return null
  const player = user.isPlayer ? players.find((p) => p.id === user.id) : undefined

  return (
    <TouchableOpacity
      onPress={() => router.push('/compte')}
      hitSlop={10}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Mon compte"
    >
      {user.isPlayer ? (
        <Avatar
          playerId={user.id}
          avatarUpdatedAt={player?.avatarUpdatedAt}
          firstName={user.firstName}
          lastName={user.lastName}
          size={30}
        />
      ) : (
        <Ionicons name="person-circle-outline" size={30} color="#fff" />
      )}
    </TouchableOpacity>
  )
}

/**
 * `headerRight` for a navigator's screenOptions. Every Stack under (tabs) sets
 * its own header, so each one has to opt in — there is no single header to
 * hang this on.
 */
export const accountHeaderRight = () => <AccountHeaderButton />

const styles = StyleSheet.create({
  // marginRight, not padding: the header's own right inset is 0 here, so
  // without it the avatar sits flush against the screen edge and looks clipped.
  button: { marginRight: 16, marginLeft: 12, paddingVertical: 2 },
})
