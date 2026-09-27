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
  audienceLabel, expectedMemberIds, formatTime, nextRegularSession, nextSessionToAnswer, placeLabel,
  trainingAddress, type TrainingOccurrence,
} from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Prochains entraînements, sur l'accueil (#608)
//
// Ce que la semaine tient pour ce membre, sous le prochain match : la
// prochaine séance dirigée où il est attendu — avec la même carte que
// l'onglet, pour répondre d'un geste — et le prochain soir de son créneau
// libre, en une ligne, annulé compris. Par date. Rien du tout quand ni l'un
// ni l'autre ne l'attend : une section vide sur l'accueil ne dirait rien.
// ---------------------------------------------------------------------------

export function NextTrainingSection() {
  const router = useRouter()
  const { user } = useAuth()
  const data = useAppData()
  const { clubs, users, memberGroups, trainingAvailabilities, setTrainingAvailability } = data

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const scoped = { ...data, memberGroups: groups }
  const today = todayIso()
  const guided = nextSessionToAnswer(scoped, users, clubId, user?.id, today)
  const regular = nextRegularSession(scoped, users, clubId, user?.id, today)
  if ((!guided && !regular) || !user) return null

  const open = () => router.push('/entrainements')
  const expectedAt = (o: TrainingOccurrence) => {
    const ids = expectedMemberIds(o.training, groups, users)
    return sortByName(
      users
        .filter((u) => ids.includes(u.id))
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    )
  }
  const items = [guided, regular]
    .filter((o): o is TrainingOccurrence => !!o)
    .sort((a, b) => a.date.localeCompare(b.date) || a.training.startTime.localeCompare(b.training.startTime))

  return (
    <View testID="home-next-training" style={s.column}>
      <Text style={s.sectionLabel}>Prochains entraînements</Text>
      {items.map((o) =>
        o === guided ? (
          <TrainingCard
            key="guided"
            occurrence={o}
            showDate
            place={placeLabel(trainingAddress(o.training, clubs))}
            audience={audienceLabel(o.training, groups)}
            expected={expectedAt(o)}
            answers={trainingAvailabilities}
            viewerId={user.id}
            // The calendar is run from its own tab; the accueil only answers.
            canManage={false}
            onAnswer={(status) => setTrainingAvailability(o.training.id, o.date, user.id, status)}
            onCancel={() => {}}
            onRestore={() => {}}
          />
        ) : (
          <TouchableOpacity
            key="regular"
            testID="home-next-regular"
            style={s.row}
            onPress={open}
            accessibilityRole="link"
          >
            <Ionicons name="barbell-outline" size={18} color={colors.textSecondary} />
            <View style={s.rowBody}>
              <Text style={[s.rowTitle, o.cancelled && s.rowCancelled]}>{o.training.displayName}</Text>
              <Text style={[s.rowSub, o.cancelled && s.rowSubCancelled]} numberOfLines={2}>
                {longDate(o.date)} à {formatTime(o.training.startTime)}
                {o.cancelled ? ` — annulé${o.note ? ` : ${o.note}` : ''}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ),
      )}
      <TouchableOpacity testID="home-all-trainings" style={s.row} onPress={open} accessibilityRole="link">
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[s.rowTitle, s.rowBody]}>Tous les entraînements</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

// The accueil's own furniture — its section label and "Tous mes matchs" row —
// so the block reads as part of the same page.
const s = StyleSheet.create({
  column: { gap: 12 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: -4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  rowCancelled: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowSubCancelled: { color: colors.danger },
})
