import { useState } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Avatar } from '@/components/Avatar'
import { AccountMenu } from '@/components/AccountMenu'
import { ProfileClubMark } from '@/components/ProfileAvatar'
import { colors } from '@/constants/colors'
import { managedSession, profileClubName } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

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
// The club rides in its corner (#749): which club one is in reads without
// opening anything — the reason the switcher was hard to use was that only
// the menu said it. On a profile somebody delegated, the photo is ringed too;
// the banner under the header says whose.
//
// Spacing belongs to AppHeader's side slot, so this carries none of its own.
export function AccountHeaderButton({ menuTop }: {
  /** The header's bottom edge, which the menu hangs from. */
  menuTop: number
}) {
  const { user, profiles } = useAuth()
  const [open, setOpen] = useState(false)
  const { players, users, clubs } = useAppData()

  if (!user) return null
  // The person's photo (#741), whatever the profile: a general admin profile
  // joined to its person shows the photo set from a club profile.
  const avatarUpdatedAt = (players.find((p) => p.id === user.id) ?? users.find((u) => u.id === user.id))?.avatarUpdatedAt
  const current: Profile = profiles?.find((p) => p.id === user.id) ?? {
    id: user.id,
    role: user.role,
    clubId: user.clubId,
    clubName: clubs?.find((c) => c.id === user.clubId)?.displayName,
  }
  const hasClub = !!current.clubId || user.role === 'general_admin'
  const managed = !!managedSession(profiles, user.id)

  return (
    <>
      <TouchableOpacity
        testID="account-button"
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Mon compte"
        accessibilityHint={hasClub ? profileClubName(current) : undefined}
        accessibilityState={{ expanded: open }}
      >
        <View style={s.box}>
          {/* Initials for a player; for a profile that does not play, the
              generic icon until the person has a photo. */}
          {user.isPlayer || avatarUpdatedAt ? (
            <Avatar
              playerId={user.id}
              avatarUpdatedAt={avatarUpdatedAt}
              firstName={user.firstName}
              lastName={user.lastName}
              size={30}
              style={managed ? s.managed : undefined}
            />
          ) : (
            <Ionicons name="person-circle-outline" size={30} color={managed ? colors.accent : '#fff'} />
          )}
          {/* Cut out of the bar's navy, so it reads as a badge on the photo. */}
          {hasClub && <ProfileClubMark profile={current} size={16} style={s.badge} />}
        </View>
      </TouchableOpacity>
      {open && <AccountMenu top={menuTop} onClose={() => setOpen(false)} />}
    </>
  )
}


const s = StyleSheet.create({
  box: { width: 30, height: 30 },
  badge: { position: 'absolute', right: -4, bottom: -4, borderWidth: 2, borderColor: colors.primary },
  managed: { borderWidth: 2, borderColor: colors.accent },
})
