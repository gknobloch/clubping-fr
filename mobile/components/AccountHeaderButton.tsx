import { TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'

// Account entry point, rendered by AppHeader on every screen (#365).
//
// Compte left the tab bar to make room for Club and keep five tabs, which is
// what the web does too — there the avatar in the top bar is the way to one's
// own profile. A member who is not a player (an admin) has no avatar to show,
// so they get the generic person icon.
//
// Spacing belongs to AppHeader's side slot, so this carries none of its own.
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

