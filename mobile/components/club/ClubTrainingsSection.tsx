import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import {
  audienceLabel, formatTimeRange, placeLabel, recurrenceLabel, trainingAddress,
} from '@shared/lib/trainings'
import type { Club, MemberGroup, Training, User } from '@shared/types'
import { ClubSection, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Entraînements (#608)
//
// Les séries du club — ses créneaux libres et ses séries dirigées : ce qu'il
// entraîne, quand, où et pour qui. Une section du Club, parce qu'elles
// décrivent le club ; leurs séances sont dans l'onglet Entraînements, où
// mène chaque ligne.
//
// En lecture ici : créer une série, la modifier ou poser ses dates se fait sur
// le site, où il y a la place de le faire. Annuler une séance se fait depuis
// l'onglet Entraînements, dans le gymnase.
// ---------------------------------------------------------------------------

export function ClubTrainingsSection({
  club,
  series,
  groups,
  users,
  canManage,
}: {
  club: Club
  series: Training[]
  groups: MemberGroup[]
  users: User[]
  canManage: boolean
}) {
  const router = useRouter()
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null
  }

  return (
    <ClubSection title="Entraînements" testID="club-trainings">
      {series.length === 0 ? (
        <Text style={section.empty}>Aucun entraînement.</Text>
      ) : (
        series.map((t) => {
          const place = placeLabel(trainingAddress(t, [club]))
          const managers = t.managerIds.map(nameOf).filter(Boolean)
          return (
            <TouchableOpacity
              key={t.id}
              testID={`club-training-${t.id}`}
              style={section.row}
              onPress={() => router.push('/entrainements')}
              accessibilityRole="link"
              accessibilityLabel={`${t.displayName} — voir les séances`}
            >
              <Ionicons name="barbell-outline" size={20} color={colors.textSecondary} style={section.rowIcon} />
              <View style={section.rowBody}>
                <View style={section.rowTitleLine}>
                  <Text style={section.rowTitle}>{t.displayName}</Text>
                  <View style={section.badge}>
                    <Text style={section.badgeText}>{t.kind === 'guided' ? 'Dirigé' : 'Libre'}</Text>
                  </View>
                </View>
                <Text style={section.rowSubtitle}>
                  {t.kind === 'regular' ? recurrenceLabel(t) : formatTimeRange(t)}
                  {place ? ` · ${place}` : ''}
                </Text>
                <Text style={section.rowSubtitle}>{audienceLabel(t, groups)}</Text>
                {managers.length > 0 && (
                  <Text style={section.rowSubtitle}>
                    Responsable{managers.length > 1 ? 's' : ''} : {managers.join(', ')}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )
        })
      )}
      {canManage && (
        <Text style={section.hint}>Créer ou modifier un entraînement se fait sur le site.</Text>
      )}
    </ClubSection>
  )
}
