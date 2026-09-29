import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { OccurrenceCard } from '@/components/TrainingCard'
import { PhaseSwitchButton } from '@/components/icons'
import { clubMemberGroups } from '@/lib/memberGroups'
import { sortByName } from '@/lib/sortByName'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { todayIso } from '@/lib/weeks'
import {
  MORE_SESSIONS, accueilSessions, audienceLabel, carouselPages, expectedMemberIds, moreSessionsLabel, placeLabel,
  trainingAddress, upcomingSessionsFor, type TrainingOccurrence,
} from '@/lib/trainings'

/**
 * Prochains entraînements, on the Accueil (#608) — the same block as the app's.
 *
 * Its own group, after everything about matches. One carousel of the member's
 * next five sessions, guided and regular mixed in date order — each card says
 * which it is — stepped like the match carousel above it (‹ 1/3 ›): two cards
 * to a page from md: up, one below, the last page holding what is left. When
 * there are more, a last card says so. Each card is the Entraînements page's
 * own, so a guided session is answered the same way in both places. Nothing at
 * all when no session is waiting on them.
 */
export function NextTrainings() {
  const { user } = useAuth()
  const data = useAppData()
  const { clubs, users, memberGroups, trainingAvailabilities, setTrainingAvailability } = data
  const [index, setIndex] = useState(0)
  const perPage = useIsDesktop() ? 2 : 1

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const today = todayIso()
  const sessions = upcomingSessionsFor({ ...data, memberGroups: groups }, users, clubId, user?.id, today)
  if (!sessions.length || !user) return null

  const { items, more } = accueilSessions(sessions, today)
  const pages = carouselPages(items, perPage)
  // Crossing md: changes the page count; stay on a page that exists.
  const i = Math.min(index, pages.length - 1)

  const expectedAt = (o: TrainingOccurrence) => {
    const ids = expectedMemberIds(o.training, groups, users)
    return sortByName(
      users
        .filter((u) => ids.includes(u.id))
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    )
  }

  return (
    <section aria-labelledby="home-trainings" className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between">
        <h2 id="home-trainings" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prochains entraînements
        </h2>
        {pages.length > 1 && (
          <div className="flex items-center gap-1">
            <PhaseSwitchButton dir="prev" disabled={i <= 0} onClick={() => setIndex(i - 1)} prevLabel="Séances précédentes" />
            <span className="text-xs font-medium text-slate-400">{i + 1}/{pages.length}</span>
            <PhaseSwitchButton
              dir="next"
              disabled={i >= pages.length - 1}
              onClick={() => setIndex(i + 1)}
              nextLabel="Séances suivantes"
            />
          </div>
        )}
      </div>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {pages[i].map((item) =>
          item === MORE_SESSIONS ? (
            <Link
              key="more"
              to="/entrainements"
              className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center shadow-sm hover:border-slate-400"
            >
              {more !== null ? (
                <>
                  <span className="font-display text-2xl font-semibold text-slate-800">+{more}</span>
                  <span className="text-sm text-slate-600">{moreSessionsLabel(more)} à venir</span>
                </>
              ) : (
                // A slot with no end has no total worth stating.
                <span className="text-sm text-slate-600">Et les suivantes</span>
              )}
              <span className="mt-1 text-sm font-medium text-accent-600">Voir tous les entraînements</span>
            </Link>
          ) : (
            <OccurrenceCard
              key={`${item.training.id}-${item.date}`}
              occurrence={item}
              showDate
              place={placeLabel(trainingAddress(item.training, clubs))}
              audience={audienceLabel(item.training, groups)}
              expected={expectedAt(item)}
              answers={trainingAvailabilities}
              viewerId={user.id}
              // The Accueil answers for the member; running the series — calling
              // a session off, answering for others — is the Entraînements page's.
              canManage={false}
              onAnswer={(playerId, status) => setTrainingAvailability(item.training.id, item.date, playerId, status)}
              onCancel={() => {}}
              onRestore={() => {}}
              onRemoveDate={() => {}}
            />
          ),
        )}
      </div>
      <Link
        to="/entrainements"
        className="flex min-h-11 items-center self-start text-sm font-medium text-accent-600 hover:text-accent-800 md:min-h-0"
      >
        Tous les entraînements
      </Link>
    </section>
  )
}
