import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { useLayout } from '@/constants/layout'
import { TrainingCard } from '@/components/TrainingCard'
import { PagerDots } from '@/components/Pager'
import { todayIso } from '@/utils/weeks'
import { offerTrainingCalendar } from '@/utils/trainingCalendar'
import { clubMemberGroups } from '@shared/lib/memberGroups'
import { sortByName } from '@shared/lib/sortByName'
import {
  TRAINING_KIND_PLURALS, accueilColumn, audienceLabel, expectedMemberIds, moreSessionsLabel, placeLabel,
  trainingAddress, upcomingSessionsFor, type TrainingOccurrence,
} from '@shared/lib/trainings'
import type { MemberGroup, TrainingKind } from '@shared/types'

// ---------------------------------------------------------------------------
// Prochains entraînements, sur l'accueil (#608)
//
// Un groupe à lui, après tout ce qui concerne les matchs — les deux ne se
// mêlent pas. Une colonne par sorte : le créneau libre d'un côté, la série
// dirigée de l'autre, côte à côte sur une tablette et empilées sur un
// téléphone. Chacune est un carrousel des trois prochaines séances de ce
// membre, avec les points du carrousel des matchs — et, s'il y en a plus, une
// dernière page mène aux autres : « +5 autres séances » pour une série qui a
// une fin (le libellé dit aussi « 8 à venir »), « Et les suivantes » pour un
// créneau qui n'en a pas. Chaque carte est celle de l'onglet — une séance
// dirigée se répond donc de la même façon aux deux endroits. Rien du tout
// quand aucune séance ne l'attend.
// ---------------------------------------------------------------------------

export function NextTrainingSection() {
  const router = useRouter()
  const { user } = useAuth()
  const data = useAppData()
  const { users, memberGroups } = data
  const { isTablet } = useLayout()

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const scoped = { ...data, memberGroups: groups }
  const today = todayIso()
  const regular = upcomingSessionsFor(scoped, users, clubId, user?.id, today, 'regular')
  const guided = upcomingSessionsFor(scoped, users, clubId, user?.id, today, 'guided')
  if ((!regular.length && !guided.length) || !user) return null

  const sideBySide = isTablet && regular.length > 0 && guided.length > 0

  return (
    <View testID="home-next-training" style={s.section}>
      <Text style={s.sectionLabel}>Prochains entraînements</Text>
      <View style={[s.columns, sideBySide && s.columnsRow]}>
        {regular.length > 0 && (
          <TrainingCarousel kind="regular" sessions={regular} groups={groups} style={sideBySide && s.half} />
        )}
        {guided.length > 0 && (
          <TrainingCarousel kind="guided" sessions={guided} groups={groups} style={sideBySide && s.half} />
        )}
      </View>
      <TouchableOpacity
        testID="home-all-trainings"
        style={s.row}
        onPress={() => router.push('/entrainements')}
        accessibilityRole="link"
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[s.rowTitle, s.rowBody]}>Tous les entraînements</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

function TrainingCarousel({
  kind,
  sessions,
  groups,
  style,
}: {
  kind: TrainingKind
  sessions: TrainingOccurrence[]
  groups: MemberGroup[]
  style?: false | object
}) {
  const router = useRouter()
  const { user } = useAuth()
  const { clubs, users, trainingAvailabilities, setTrainingAvailability } = useAppData()
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(0)
  // Each page's own height. A horizontal ScrollView is as tall as its tallest
  // page, so a short Tuesday card sat above a band of nothing sized for the
  // cancelled evening or the « more » page beside it — plain to see once the
  // two columns stack on a phone. Measured instead, and the pager takes the
  // height of the page on screen.
  const [heights, setHeights] = useState<number[]>([])
  const measurePage = (i: number, h: number) =>
    setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })))
  // The first few, then a last page saying how many more there are — a row
  // that stopped at three without a word would read as « there are three ».
  const { shown, hasMore, more, total } = accueilColumn(sessions, todayIso())

  const expectedAt = (o: TrainingOccurrence) => {
    const ids = expectedMemberIds(o.training, groups, users)
    return sortByName(
      users
        .filter((u) => ids.includes(u.id))
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    )
  }

  return (
    <View
      testID={`home-trainings-${kind}`}
      style={[s.carousel, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Text style={s.kindLabel}>
        {TRAINING_KIND_PLURALS[kind]}
        {total !== null && <Text style={s.kindCount}> · {total} à venir</Text>}
      </Text>
      {/* Measured before it is drawn: a page is the column's width, and a
          pager guessing it would snap between half cards. */}
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={shown.length + (hasMore ? 1 : 0) > 1}
          testID={`home-trainings-${kind}-pager`}
          style={[{ width }, heights[page] ? { height: heights[page] } : null]}
          // Pages keep their own height rather than stretching to the row's.
          contentContainerStyle={s.pages}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {shown.map((o, i) => (
            <View
              key={`${o.training.id}-${o.date}`}
              testID={`home-trainings-${kind}-page-${i}`}
              style={{ width }}
              onLayout={(e) => measurePage(i, e.nativeEvent.layout.height)}
            >
              <TrainingCard
                occurrence={o}
                showDate
                place={placeLabel(trainingAddress(o.training, clubs))}
                audience={audienceLabel(o.training, groups)}
                expected={expectedAt(o)}
                answers={trainingAvailabilities}
                viewerId={user?.id}
                // The accueil answers for the member; running the series is
                // the Entraînements tab's.
                canManage={false}
                onAnswer={(status) => user && setTrainingAvailability(o.training.id, o.date, user.id, status)}
                onCancel={() => {}}
                onRestore={() => {}}
                onAddToCalendar={() => offerTrainingCalendar(o, trainingAddress(o.training, clubs))}
              />
            </View>
          ))}
          {hasMore && (
            <View
              style={{ width }}
              onLayout={(e) => measurePage(shown.length, e.nativeEvent.layout.height)}
            >
              <TouchableOpacity
                testID={`home-trainings-${kind}-more`}
                // The first card's height, so the last page reads as one more card.
                style={[s.more, heights[0] ? { minHeight: heights[0] } : null]}
                onPress={() => router.push('/entrainements')}
                accessibilityRole="link"
                accessibilityLabel={`${more !== null ? `${moreSessionsLabel(more)} à venir` : 'Et les suivantes'} — voir tous les entraînements`}
              >
                {more !== null ? (
                  <>
                    <Text style={s.moreCount}>+{more}</Text>
                    <Text style={s.moreText}>{moreSessionsLabel(more)} à venir</Text>
                  </>
                ) : (
                  // A slot with no end has no total worth stating.
                  <Text style={s.moreText}>Et les suivantes</Text>
                )}
                <Text style={s.moreLink}>Voir tous les entraînements</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
      <PagerDots
        index={page}
        total={shown.length + (hasMore ? 1 : 0)}
        testID={`home-trainings-${kind}-dots`}
      />
    </View>
  )
}

// The accueil's own furniture — its section label and "Tous mes matchs" row —
// so the block reads as part of the same page.
const s = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: -4 },
  columns: { gap: 16 },
  columnsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1 },
  carousel: { gap: 8 },
  kindLabel: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  kindCount: { fontFamily: fonts.regular, color: colors.textSecondary },
  pages: { alignItems: 'flex-start' },
  more: {
    minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 16,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
  },
  moreCount: { fontSize: 24, fontFamily: fonts.bold, color: colors.textPrimary },
  moreText: { fontSize: 14, color: colors.textSecondary },
  moreLink: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.accent, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
})
