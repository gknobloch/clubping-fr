import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { Notifications } from '@/utils/expoNotifications'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { gameIdOf, recipientOf, registerForPush, trainingOf } from '@/utils/push'

/**
 * Everything push does while the app is running (#495): register the device
 * once there is a session, and open the right match when one is tapped.
 *
 * Renders nothing, and lives inside the authenticated part of the tree so it
 * mounts with a session and unmounts at logout — the deregistration itself is
 * AuthContext's, on the logout path, because by the time this unmounts the
 * session token it needs is already gone.
 */

// A push arriving while the app is open should still be seen: without a
// handler the OS hands it to the app and shows nothing, so a member reading
// the Journées screen when a team-mate drops out sees nothing at all.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export function PushNotifications() {
  const router = useRouter()
  const { isAuthenticated, user, profiles, switchProfile } = useAuth()
  // Read when a tap arrives, not when the listener was set up: the listener
  // outlives every profile switch (#640).
  const session = useRef({ user, profiles, switchProfile })
  session.current = { user, profiles, switchProfile }
  // A response is offered twice — to the listener, and again by
  // getLastNotificationResponseAsync — and a second handling would switch
  // profile back after the member had moved on.
  const handled = useRef(new Set<string>())
  const { games, teams, loading } = useAppData()
  // The match a tap asked for, held until the data needed to open it is here.
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    void registerForPush()
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !Notifications) return
    // A tap on a notification that launched the app from cold is not delivered
    // to a listener — it is waiting to be asked for.
    // A training reminder or cancellation (#608) opens the Entraînements tab:
    // the list is short and the session is at its top, so there is nothing to
    // wait for — unlike a match, whose screen needs a team resolved first.
    const open = async (r: Parameters<typeof gameIdOf>[0]) => {
      if (!r) return
      const key = r.notification.request.identifier
      if (handled.current.has(key)) return
      handled.current.add(key)
      // The child's reminder, tapped on a parent's phone (#640): become the
      // child first, so the screen that opens is theirs. Only among the
      // profiles the server named — never on a payload's word alone, which
      // the server would refuse anyway. Offline there are none, and it opens
      // on whoever is signed in rather than not at all.
      const recipient = recipientOf(r)
      const { user: me, profiles: mine, switchProfile: become } = session.current
      if (recipient && recipient !== me?.id && mine.some((p) => p.id === recipient)) {
        try {
          await become(recipient)
        } catch {
          /* unreachable or refused: open on the current profile */
        }
      }
      if (trainingOf(r)) {
        router.push('/entrainements')
        return
      }
      const gameId = gameIdOf(r)
      if (gameId) setPendingGameId(gameId)
    }
    void Notifications.getLastNotificationResponseAsync().then(open)
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void open(r))
    return () => sub.remove()
  }, [isAuthenticated, router])

  // The match screen is one TEAM's view of a fixture, so it needs a team as
  // well as a game. The notification deliberately does not carry one: the
  // right team is whichever side of this fixture the person who tapped belongs
  // to, which is a different answer for the player and for their captain, and
  // is answered here rather than baked into a payload written a week earlier.
  useEffect(() => {
    if (!pendingGameId) return
    const game = games.find((g) => g.id === pendingGameId)
    if (!game) {
      // Still arriving — wait. Once it has arrived and the match is not in it
      // (a re-imported poule dropped the fixture), there is nothing to open.
      if (!loading && games.length) setPendingGameId(null)
      return
    }
    const mine = [game.homeTeamId, game.awayTeamId]
      .map((id) => teams.find((t) => t.id === id))
      .find((t) => t && (t.captainId === user?.id || t.playerIds?.includes(user?.id ?? '')))
    setPendingGameId(null)
    router.push({
      pathname: '/match/[id]',
      params: { id: game.id, ...(mine ? { teamId: mine.id } : {}) },
    })
  }, [pendingGameId, games, teams, loading, user, router])

  return null
}
