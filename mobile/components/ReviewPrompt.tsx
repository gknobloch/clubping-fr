import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Sheet } from '@/components/Sheet'
import { selection } from '@/components/Selection'
import { colors } from '@/constants/colors'
import {
  fetchReviewPrompt, onOwnYes, openReviewPage, recordReviewEvent, requestSystemReview,
} from '@/utils/storeReview'
import { managedSession } from '@shared/lib/profiles'
import { reviewPromptDue, type ReviewPromptEvent } from '@shared/lib/reviewPrompt'

/** Long enough for the « Oui » to settle on screen before anything rises over it. */
const AFTER_ANSWER_MS = 1200

/**
 * Asks for a store review (#781), right after the member said « Oui » for
 * themselves — a task just finished, never the middle of one.
 *
 * Mounted beside the navigator with a session, like push. Each condition
 * below is a reason not to ask, in the order they are cheapest to check:
 * - a managed profile (#749): the person holding the phone is acting for
 *   someone else, and the app is not the subject;
 * - data from the cache: offline, and the person's answer could not be read;
 * - already tried in this run of the app: one look per launch at most;
 * - what the server remembers (`reviewPromptDue`): the first fortnight, a few
 *   answers, months between two prompts, three at most, and never again once
 *   declined or reviewed.
 *
 * Then iOS hands the moment to the system's prompt (guideline 5.6.1 allows no
 * other), and Android shows our sheet.
 */
export function ReviewPrompt() {
  const { user, profiles } = useAuth()
  const { gameAvailabilities, stale } = useAppData()
  const [asking, setAsking] = useState(false)
  const tried = useRef(false)
  // The listener outlives renders; it reads the latest of these.
  const latest = useRef({ user, profiles, gameAvailabilities, stale })
  latest.current = { user, profiles, gameAvailabilities, stale }

  const consider = useCallback(async () => {
    const { user: me, profiles: reach, stale: cached } = latest.current
    if (!me || tried.current || cached || managedSession(reach, me.id)) return
    tried.current = true
    const state = await fetchReviewPrompt()
    if (!state) return
    // Read after the round trip: the answer that raised this is in by now.
    const ownAnswers = latest.current.gameAvailabilities
      .filter((a) => a.playerId === me.id && !a.overriddenBy).length
    if (!reviewPromptDue(state, Date.now(), ownAnswers)) return
    setTimeout(() => {
      if (Platform.OS === 'ios') {
        void requestSystemReview().then((requested) => {
          if (requested) void recordReviewEvent('asked')
        })
      } else {
        setAsking(true)
      }
    }, AFTER_ANSWER_MS)
  }, [])

  useEffect(() => onOwnYes(() => void consider()), [consider])

  if (!asking) return null

  const answer = (event: ReviewPromptEvent) => {
    setAsking(false)
    void recordReviewEvent(event)
    if (event === 'reviewed') void openReviewPage()
  }

  return (
    // The backdrop is « Plus tard »: dismissed is not declined.
    <Sheet onClose={() => answer('asked')} testID="review-prompt">
      <Text style={selection.title}>Un avis sur Club Ping ?</Text>
      <Text style={s.body}>
        Quelques mots sur Google Play aident d’autres clubs à trouver l’app. Ça prend une minute.
      </Text>
      {/* Stacked, one per row: « Ne plus demander » beside « Plus tard »
          would wrap on a 343pt column. */}
      <View style={s.buttons}>
        <View style={selection.actions}>
          <TouchableOpacity testID="review-prompt-review" style={selection.saveBtn} onPress={() => answer('reviewed')}>
            <Text style={selection.saveTxt}>Donner mon avis</Text>
          </TouchableOpacity>
        </View>
        <View style={selection.actions}>
          <TouchableOpacity testID="review-prompt-later" style={selection.cancelBtn} onPress={() => answer('asked')}>
            <Text style={selection.cancelTxt}>Plus tard</Text>
          </TouchableOpacity>
        </View>
        <View style={selection.actions}>
          <TouchableOpacity testID="review-prompt-never" style={selection.cancelBtn} onPress={() => answer('declined')}>
            <Text style={selection.cancelTxt}>Ne plus demander</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 16 },
  buttons: { gap: 10 },
})
