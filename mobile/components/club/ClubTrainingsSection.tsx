import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { longDate } from '@shared/lib/pushNotifications'
import { formatTime, type TrainingOccurrence } from '@shared/lib/trainings'
import { ClubSection, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Entraînements (#608)
//
// Les trois prochaines séances, et la porte vers la liste des quatre semaines
// à venir — poussée sur la pile du Club, pour que le retour ramène ici.
// ---------------------------------------------------------------------------

export function ClubTrainingsSection({ next }: { next: TrainingOccurrence[] }) {
  const router = useRouter()
  const open = () => router.push('/club/entrainements')

  return (
    <ClubSection
      title="Entraînements"
      testID="club-trainings"
      action={{ label: 'Tout voir', onPress: open, testID: 'club-trainings-all' }}
    >
      {next.length === 0 ? (
        <Text style={section.empty}>Aucune séance dans les quatre prochaines semaines.</Text>
      ) : (
        next.map((o) => (
          <TouchableOpacity
            key={`${o.training.id}-${o.date}`}
            style={section.row}
            onPress={open}
            accessibilityRole="link"
          >
            <Ionicons name="barbell-outline" size={20} color={colors.textSecondary} style={section.rowIcon} />
            <View style={section.rowBody}>
              <Text
                style={[
                  section.rowTitle,
                  o.cancelled && { color: colors.textSecondary, textDecorationLine: 'line-through' },
                ]}
              >
                {o.training.displayName}
              </Text>
              <Text style={section.rowSubtitle}>
                {longDate(o.date)} à {formatTime(o.training.startTime)}
                {o.cancelled ? ' — annulée' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))
      )}
    </ClubSection>
  )
}
