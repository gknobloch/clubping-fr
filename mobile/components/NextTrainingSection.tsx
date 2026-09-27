import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { TrainingCard } from '@/components/TrainingCard'
import { todayIso } from '@/utils/weeks'
import { clubMemberGroups } from '@shared/lib/memberGroups'
import { longDate } from '@shared/lib/pushNotifications'
import { sortByName } from '@shared/lib/sortByName'
import {
  audienceLabel, expectedMemberIds, nextSessionToAnswer, placeLabel, trainingAddress,
} from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Prochain entraînement dirigé, sur l'accueil (#608)
//
// La question de la semaine — « je viens mardi ? » — là où l'on ouvre l'app,
// à un geste, à côté du prochain match. La même carte que l'onglet
// Entraînements, pour qu'une réponse se donne de la même façon aux deux
// endroits. Rien du tout quand aucune séance dirigée n'attend ce membre dans
// les deux semaines : une carte vide sur l'accueil ne dirait rien d'utile.
// ---------------------------------------------------------------------------

export function NextTrainingSection() {
  const router = useRouter()
  const { user } = useAuth()
  const data = useAppData()
  const { clubs, users, memberGroups, trainingAvailabilities, setTrainingAvailability } = data

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const next = nextSessionToAnswer({ ...data, memberGroups: groups }, users, clubId, user?.id, todayIso())
  if (!next || !user) return null

  const ids = expectedMemberIds(next.training, groups, users)
  const expected = sortByName(
    users
      .filter((u) => ids.includes(u.id))
      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
  )

  return (
    <View testID="home-next-training" style={s.column}>
      <Text style={s.sectionLabel}>Prochain entraînement dirigé — {longDate(next.date)}</Text>
      <TrainingCard
        occurrence={next}
        place={placeLabel(trainingAddress(next.training, clubs))}
        audience={audienceLabel(next.training, groups)}
        expected={expected}
        answers={trainingAvailabilities}
        viewerId={user.id}
        // The calendar is run from its own tab; the accueil only answers.
        canManage={false}
        onAnswer={(status) => setTrainingAvailability(next.training.id, next.date, user.id, status)}
        onCancel={() => {}}
        onRestore={() => {}}
      />
      <TouchableOpacity
        testID="home-all-trainings"
        style={s.all}
        onPress={() => router.push('/entrainements')}
        accessibilityRole="link"
      >
        <View style={s.allLeft}>
          <Ionicons name="barbell-outline" size={18} color={colors.textSecondary} />
          <Text style={s.allTitle}>Tous les entraînements</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

// The accueil's own furniture — its section label and "Tous mes matchs" row —
// so the training block reads as part of the same page.
const s = StyleSheet.create({
  column: { gap: 12 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: -4 },
  all: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  allLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  allTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
})
