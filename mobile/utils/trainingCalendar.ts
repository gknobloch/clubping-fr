import { Alert, Linking } from 'react-native'
import { apiUrl } from '@/constants/api'
import { openMatchInCalendar } from '@/utils/addToCalendar'
import { buildTrainingEvent, seriesCalendarPath, type TrainingOccurrence } from '@shared/lib/trainings'
import type { Address } from '@shared/types'

/**
 * « Ajouter à mon agenda » for a guided session (#608): this date alone, or
 * the whole series.
 *
 * The one date goes through the OS's own "new event" screen, as a match does
 * (#416). The series cannot: that screen takes one event, and writing several
 * ourselves would need the calendar permission this app deliberately does not
 * hold (#418). So the series is the API's .ics, opened in the phone's browser
 * — which hands it to the calendar, and iOS offers « Ajouter tout ». The link
 * carries the series' own key, since the browser carries no session.
 */
export function offerTrainingCalendar(o: TrainingOccurrence, address: Address | undefined) {
  Alert.alert('Ajouter à mon agenda', o.training.displayName, [
    { text: 'Cette séance', onPress: () => void openMatchInCalendar(buildTrainingEvent(o, address)) },
    ...(o.training.calendarToken
      ? [{
          text: 'Toute la série',
          onPress: () => {
            Linking.openURL(apiUrl(seriesCalendarPath(o.training))).catch(() =>
              Alert.alert('Calendrier', "Impossible d'ouvrir le calendrier de la série."))
          },
        }]
      : []),
    { text: 'Annuler', style: 'cancel' as const },
  ])
}
