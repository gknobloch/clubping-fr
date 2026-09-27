import { useMemo, useState } from 'react'
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { Screen, contentWidth } from '@/components/Screen'
import { TrainingCard, CancelTrainingSheet } from '@/components/TrainingCard'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { todayIso } from '@/utils/weeks'
import { clubMemberGroups } from '@shared/lib/memberGroups'
import { longDate } from '@shared/lib/pushNotifications'
import { sortByName } from '@shared/lib/sortByName'
import {
  audienceLabel, expectedMemberIds, mayManageTrainings, occurrenceKey, placeLabel, trainingAddress,
  upcomingOccurrences, type TrainingOccurrence,
} from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Entraînements (#608)
//
// Les quatre semaines à venir du club : les séances dirigées, où chacun dit
// s'il vient, et les créneaux libres, avec leurs soirs annulés. Poussé sur la
// pile du Club — un entraînement est l'affaire du club, comme ses groupes.
//
// L'administrateur y annule et rétablit une séance, parce que c'est dans le
// gymnase qu'on apprend qu'il est fermé. Créer une série et poser ses dates
// restent sur le web, où il y a la place de le faire.
// ---------------------------------------------------------------------------

const HORIZON_DAYS = 28

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function TrainingsScreen() {
  const { user } = useAuth()
  const data = useAppData()
  const {
    clubs, users, memberGroups, trainingAvailabilities, refreshing, refresh,
    setTrainingAvailability, setTrainingSessionState,
  } = data
  const [cancelling, setCancelling] = useState<TrainingOccurrence | null>(null)

  const clubId = user?.clubId
  const today = todayIso()
  const groups = clubMemberGroups(memberGroups, clubId)
  const canManage = mayManageTrainings(user, clubId)
  const occurrences = upcomingOccurrences(data, clubId, today, HORIZON_DAYS)

  const byDate = useMemo(() => {
    const out = new Map<string, TrainingOccurrence[]>()
    for (const o of occurrences) out.set(o.date, [...(out.get(o.date) ?? []), o])
    return [...out.entries()]
  }, [occurrences])

  const named = useMemo(
    () => users.map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    [users],
  )

  return (
    <Screen>
      <ScrollView
        testID="trainings-list"
        contentContainerStyle={[s.scroll, contentWidth()]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {byDate.length === 0 ? (
          <Text style={s.empty}>
            {canManage
              ? 'Aucune séance dans les quatre prochaines semaines. Les entraînements se créent sur le site.'
              : 'Aucune séance dans les quatre prochaines semaines.'}
          </Text>
        ) : (
          byDate.map(([date, list]) => (
            <View key={date} style={s.day}>
              <Text style={s.dayTitle}>
                {date === today ? `Aujourd’hui — ${longDate(date)}` : upperFirst(longDate(date))}
              </Text>
              {list.map((o) => {
                const ids = expectedMemberIds(o.training, groups, users)
                return (
                  <TrainingCard
                    key={occurrenceKey(o.training.id, o.date)}
                    occurrence={o}
                    place={placeLabel(trainingAddress(o.training, clubs))}
                    audience={audienceLabel(o.training, groups)}
                    expected={sortByName(named.filter((u) => ids.includes(u.id)))}
                    answers={trainingAvailabilities}
                    viewerId={user?.id}
                    canManage={canManage}
                    onAnswer={(status) => user && setTrainingAvailability(o.training.id, o.date, user.id, status)}
                    onCancel={() => setCancelling(o)}
                    onRestore={() => clubId && setTrainingSessionState(clubId, o.training.id, o.date, { cancelled: false })}
                  />
                )
              })}
            </View>
          ))
        )}
      </ScrollView>

      {cancelling && clubId && (
        <CancelTrainingSheet
          title={`Annuler la séance du ${longDate(cancelling.date)} ?`}
          onConfirm={(note) =>
            setTrainingSessionState(clubId, cancelling.training.id, cancelling.date, { cancelled: true, note })}
          onClose={() => setCancelling(null)}
        />
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 18 },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 32 },
  day: { gap: 8 },
  dayTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
})
