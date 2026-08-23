import { Alert } from 'react-native'
import { createEventInCalendarAsync } from 'expo-calendar'
import type { MatchEvent } from '@shared/lib/calendar'

// The native dialog refuses a second one while it is opening, and a card in a
// carousel is easy to double-tap.
let opening = false

/**
 * Hands a match to the OS's own "new event" screen, pre-filled (#416).
 *
 * The calendar to file it under, the reminder and any edit are left to that
 * screen: it knows the phone's calendars, and on iOS 17+ it needs no access to
 * them — we never read the player's calendar, we only propose an event.
 *
 * Shared by the match detail and the Accueil card (#426), which is where a
 * player answers OUI and then wants the evening blocked.
 */
export async function openMatchInCalendar(event: MatchEvent): Promise<void> {
  if (opening) return
  opening = true
  try {
    await createEventInCalendarAsync(event)
  } catch {
    Alert.alert('Calendrier', "Impossible d'ouvrir le calendrier du téléphone.")
  } finally {
    opening = false
  }
}
