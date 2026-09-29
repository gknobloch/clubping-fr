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
  MORE_SESSIONS, accueilSessions, audienceLabel, carouselPages, expectedMemberIds, moreSessionsLabel, placeLabel,
  trainingAddress, upcomingSessionsFor, type TrainingOccurrence,
} from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Prochains entraînements, sur l'accueil (#608)
//
// Un groupe à lui, après tout ce qui concerne les matchs — les deux ne se
// mêlent pas. Un seul carrousel des cinq prochaines séances de ce membre,
// dirigées et libres mêlées dans l'ordre des dates : chaque carte dit déjà de
// quelle sorte elle est, et deux carrousels côte à côte faisaient lire deux
// rangées pour une seule question, « quand est mon prochain entraînement ? ».
// Deux cartes par page sur une tablette, une sur un téléphone, la dernière
// page portant ce qui reste ; les points sont ceux du carrousel des matchs.
// S'il y en a plus, une dernière carte le dit : « +5 autres séances » quand
// chaque série a une fin, « Et les suivantes » quand un créneau n'en a pas.
// Chaque carte est celle de l'onglet — une séance dirigée se répond donc de la
// même façon aux deux endroits. Rien du tout quand aucune séance ne l'attend.
// ---------------------------------------------------------------------------

const GAP = 12

export function NextTrainingSection() {
  const router = useRouter()
  const { user } = useAuth()
  const data = useAppData()
  const { clubs, users, memberGroups, trainingAvailabilities, setTrainingAvailability } = data
  const { isTablet } = useLayout()
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(0)
  // Each page's own height. A horizontal ScrollView is as tall as its tallest
  // page, so a short Tuesday card sat above a band of nothing sized for the
  // cancelled evening or the « more » card — plain to see on a phone. Measured
  // instead, and the pager takes the height of the page on screen.
  const [heights, setHeights] = useState<number[]>([])
  const measurePage = (i: number, h: number) =>
    setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })))

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const today = todayIso()
  const sessions = upcomingSessionsFor({ ...data, memberGroups: groups }, users, clubId, user?.id, today)
  if (!sessions.length || !user) return null

  const { items, more } = accueilSessions(sessions, today)
  const perPage = isTablet ? 2 : 1
  const pages = carouselPages(items, perPage)
  // Every card the same width, the last page's lone one included.
  const cardWidth = (width - GAP * (perPage - 1)) / perPage

  const expectedAt = (o: TrainingOccurrence) => {
    const ids = expectedMemberIds(o.training, groups, users)
    return sortByName(
      users
        .filter((u) => ids.includes(u.id))
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    )
  }

  return (
    <View testID="home-next-training" style={s.section}>
      <Text style={s.sectionLabel}>Prochains entraînements</Text>
      <View testID="home-trainings" style={s.carousel} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Measured before it is drawn: a page is the block's width, and a
            pager guessing it would snap between half cards. */}
        {width > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={pages.length > 1}
            testID="home-trainings-pager"
            style={[{ width }, heights[page] ? { height: heights[page] } : null]}
            // Pages keep their own height rather than stretching to the row's.
            contentContainerStyle={s.pages}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {pages.map((cards, i) => (
              <View
                key={i}
                testID={`home-trainings-page-${i}`}
                style={[s.page, { width }]}
                onLayout={(e) => measurePage(i, e.nativeEvent.layout.height)}
              >
                {cards.map((o) =>
                  o === MORE_SESSIONS ? (
                    <TouchableOpacity
                      key="more"
                      testID="home-trainings-more"
                      // The first page's height, so the last card reads as one more card.
                      style={[s.more, { width: cardWidth }, heights[0] ? { minHeight: heights[0] } : null]}
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
                  ) : (
                    <View key={`${o.training.id}-${o.date}`} style={{ width: cardWidth }}>
                      <TrainingCard
                        occurrence={o}
                        showDate
                        place={placeLabel(trainingAddress(o.training, clubs))}
                        audience={audienceLabel(o.training, groups)}
                        expected={expectedAt(o)}
                        answers={trainingAvailabilities}
                        viewerId={user.id}
                        // The accueil answers for the member; running the series
                        // is the Entraînements tab's.
                        canManage={false}
                        onAnswer={(status) => setTrainingAvailability(o.training.id, o.date, user.id, status)}
                        onCancel={() => {}}
                        onRestore={() => {}}
                        onAddToCalendar={() => offerTrainingCalendar(o, trainingAddress(o.training, clubs))}
                      />
                    </View>
                  ),
                )}
              </View>
            ))}
          </ScrollView>
        )}
        <PagerDots index={page} total={pages.length} testID="home-trainings-dots" />
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

// The accueil's own furniture — its section label and "Tous mes matchs" row —
// so the block reads as part of the same page.
const s = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: -4 },
  carousel: { gap: 8 },
  pages: { alignItems: 'flex-start' },
  page: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
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
