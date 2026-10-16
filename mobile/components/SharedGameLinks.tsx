import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Sheet } from '@/components/Sheet'
import { SelectionList, selection } from '@/components/Selection'
import { Avatar } from '@/components/Avatar'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { peekSharedGame, takeSharedGame, useSharedGameVersion } from '@/utils/sharedGameLink'
import { sharedGameOpening, type SharedGameCandidate } from '@shared/lib/gameShare'
import { profileName } from '@shared/lib/profiles'
import { getTeamName } from '@shared/lib/teamName'

/**
 * Opens a shared match (#747) — held by `+native-intent` until there is a
 * session and data to open it with, then under the profile that plays it.
 *
 * Lives beside the navigator, like push (#495), and mounts only with a
 * session: a link tapped signed out waits for the sign-in. By then `profiles`
 * is what the server said (AuthContext holds `loading` until it has), or
 * empty offline — and offline there is no switching, so it opens as whoever
 * is signed in.
 */
export function SharedGameLinks() {
  const router = useRouter()
  const { user, profiles, switchProfile } = useAuth()
  const { games, teams, gameSelections, clubs, players, users, loading } = useAppData()
  const version = useSharedGameVersion()
  // Several profiles play in it: the match, and whom to offer.
  const [asking, setAsking] = useState<{ gameId: string; candidates: SharedGameCandidate[] } | null>(null)
  const busy = useRef(false)

  const openAs = useCallback(async ({ profileId, teamId }: SharedGameCandidate, gameId: string) => {
    if (user && profileId !== user.id && profiles.some((p) => p.id === profileId)) {
      try {
        await switchProfile(profileId)
      } catch {
        /* unreachable or refused: open on the current profile */
      }
    }
    router.push({ pathname: '/match/[id]', params: { id: gameId, teamId } })
  }, [user, profiles, switchProfile, router])

  useEffect(() => {
    const shared = peekSharedGame()
    if (!shared || !user || busy.current) return
    const game = games.find((g) => g.id === shared.gameId)
    if (!game) {
      // Still arriving — wait. Arrived without it (a re-imported poule
      // dropped the fixture, or a link from another site's data): say so.
      if (!loading && games.length) {
        takeSharedGame()
        Alert.alert('Match introuvable', "Ce match n'existe plus dans le calendrier.")
      }
      return
    }
    takeSharedGame()
    const opening = sharedGameOpening({
      shared, game, teams, gameSelections, profiles, currentProfile: user,
    })
    if (opening.kind === 'ask') {
      setAsking({ gameId: game.id, candidates: opening.candidates })
      return
    }
    busy.current = true
    void openAs(opening, game.id).finally(() => {
      busy.current = false
    })
  }, [version, user, games, teams, gameSelections, profiles, loading, openAs])

  if (!asking) return null

  const close = () => setAsking(null)
  const choose = (c: SharedGameCandidate) => {
    close()
    void openAs(c, asking.gameId)
  }

  return (
    <Sheet onClose={close} testID="shared-game-profiles">
      <Text style={selection.title}>Ouvrir le match en tant que…</Text>
      <Text style={s.hint}>Plusieurs de vos profils jouent ce match.</Text>
      <SelectionList>
        {asking.candidates.map((c) => {
          const p = profiles.find((x) => x.id === c.profileId) ?? (user?.id === c.profileId ? user : undefined)
          const team = teams.find((t) => t.id === c.teamId)
          const current = c.profileId === user?.id
          const name = p ? profileName(p) : ''
          return (
            <TouchableOpacity
              key={c.profileId}
              testID={`shared-game-profile-${c.profileId}`}
              style={s.row}
              onPress={() => choose(c)}
              accessibilityRole="button"
              accessibilityLabel={current ? `${name}, profil actuel` : name}
            >
              <Avatar
                playerId={c.profileId}
                avatarUpdatedAt={(players.find((x) => x.id === c.profileId) ?? users.find((x) => x.id === c.profileId))?.avatarUpdatedAt}
                firstName={p?.firstName}
                lastName={p?.lastName}
                size={36}
              />
              <View style={s.body}>
                <Text style={[s.name, current && s.nameCurrent]} numberOfLines={1}>{name}</Text>
                {team ? <Text style={s.team} numberOfLines={1}>{getTeamName(team, clubs)}</Text> : null}
              </View>
              {current ? (
                <View style={s.badge}>
                  <Text style={s.badgeText}>Profil actuel</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )
        })}
      </SelectionList>
      <TouchableOpacity testID="shared-game-profiles-close" style={selection.cancelBtn} onPress={close}>
        <Text style={selection.cancelTxt}>Annuler</Text>
      </TouchableOpacity>
    </Sheet>
  )
}

const s = StyleSheet.create({
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  body: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  nameCurrent: { fontFamily: fonts.semiBold, color: colors.accent },
  team: { fontSize: 12, color: colors.textSecondary },
  badge: { backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.accent },
})
