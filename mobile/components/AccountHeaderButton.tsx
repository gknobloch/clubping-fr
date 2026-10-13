import { useState } from 'react'
import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { AccountMenu } from '@/components/AccountMenu'

// Account entry point, rendered by AppHeader on every screen (#365).
//
// Compte left the tab bar to make room for Club and keep five tabs, which is
// what the web does too — there the avatar in the top bar is the way to one's
// own profile. A member who is not a player (an admin) has no avatar to show,
// so they get the generic person icon.
//
// It opens the account menu (#720) — who is signed in, the way to Compte, and
// the other profiles to switch to — rather than Compte itself.
//
// Spacing belongs to AppHeader's side slot, so this carries none of its own.
export function AccountHeaderButton({ menuTop }: {
  /** The header's bottom edge, which the menu hangs from. */
  menuTop: number
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { players } = useAppData()

  if (!user) return null
  const player = user.isPlayer ? players.find((p) => p.id === user.id) : undefined

  return (
    <>
      <TouchableOpacity
        testID="account-button"
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Mon compte"
        accessibilityState={{ expanded: open }}
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
      {open && <AccountMenu top={menuTop} onClose={() => setOpen(false)} />}
    </>
  )
}

