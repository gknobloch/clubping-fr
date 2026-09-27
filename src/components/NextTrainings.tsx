import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { OccurrenceCard } from '@/components/TrainingCard'
import { PhaseSwitchButton } from '@/components/icons'
import { clubMemberGroups } from '@/lib/memberGroups'
import { sortByName } from '@/lib/sortByName'
import { todayIso } from '@/lib/weeks'
import {
  TRAINING_KIND_PLURALS, audienceLabel, expectedMemberIds, placeLabel, trainingAddress,
  upcomingSessionsFor, type TrainingOccurrence,
} from '@/lib/trainings'
import type { TrainingKind } from '@/types'

/**
 * Prochains entraînements, on the Accueil (#608) — the same block as the app's.
 *
 * Its own group, after everything about matches: one column per kind from md:
 * up — the regular slot on one side, the guided series on the other — stacked
 * below that. Each is a carousel of the member's next three sessions of that
 * kind, stepped like the match carousel above it (‹ 1/3 ›), and each card is
 * the Entraînements page's own, so a guided session is answered the same way
 * in both places. Nothing at all when neither kind is waiting on them.
 */
export function NextTrainings() {
  const { user } = useAuth()
  const data = useAppData()
  const { users, memberGroups } = data

  const clubId = user?.clubId
  const groups = clubMemberGroups(memberGroups, clubId)
  const scoped = { ...data, memberGroups: groups }
  const today = todayIso()
  const regular = upcomingSessionsFor(scoped, users, clubId, user?.id, today, 'regular')
  const guided = upcomingSessionsFor(scoped, users, clubId, user?.id, today, 'guided')
  if ((!regular.length && !guided.length) || !user) return null

  return (
    <section aria-labelledby="home-trainings" className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between">
        <h2 id="home-trainings" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prochains entraînements
        </h2>
        <Link to="/entrainements" className="flex min-h-11 items-center text-sm font-medium text-accent-600 hover:text-accent-800 md:min-h-0">
          Tous les entraînements
        </Link>
      </div>
      <div className={`grid gap-3 ${regular.length && guided.length ? 'md:grid-cols-2' : ''}`}>
        {regular.length > 0 && <TrainingCarousel kind="regular" sessions={regular} groups={groups} />}
        {guided.length > 0 && <TrainingCarousel kind="guided" sessions={guided} groups={groups} />}
      </div>
    </section>
  )
}

function TrainingCarousel({
  kind,
  sessions,
  groups,
}: {
  kind: TrainingKind
  sessions: TrainingOccurrence[]
  groups: ReturnType<typeof clubMemberGroups>
}) {
  const { user } = useAuth()
  const { clubs, users, trainingAvailabilities, setTrainingAvailability } = useAppData()
  const [index, setIndex] = useState(0)
  const i = Math.min(index, sessions.length - 1)
  const o = sessions[i]
  const ids = expectedMemberIds(o.training, groups, users)
  const expected = sortByName(
    users
      .filter((u) => ids.includes(u.id))
      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
  )

  return (
    <div role="group" aria-label={TRAINING_KIND_PLURALS[kind]} className="flex min-w-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{TRAINING_KIND_PLURALS[kind]}</p>
        {sessions.length > 1 && (
          <div className="flex items-center gap-1">
            <PhaseSwitchButton dir="prev" disabled={i <= 0} onClick={() => setIndex(i - 1)} prevLabel="Séance précédente" />
            <span className="text-xs font-medium text-slate-400">{i + 1}/{sessions.length}</span>
            <PhaseSwitchButton
              dir="next"
              disabled={i >= sessions.length - 1}
              onClick={() => setIndex(i + 1)}
              nextLabel="Séance suivante"
            />
          </div>
        )}
      </div>
      <OccurrenceCard
        occurrence={o}
        showDate
        place={placeLabel(trainingAddress(o.training, clubs))}
        audience={audienceLabel(o.training, groups)}
        expected={expected}
        answers={trainingAvailabilities}
        viewerId={user?.id}
        // The Accueil answers for the member; running the series — calling a
        // session off, answering for others — is the Entraînements page's.
        canManage={false}
        onAnswer={(playerId, status) => setTrainingAvailability(o.training.id, o.date, playerId, status)}
        onCancel={() => {}}
        onRestore={() => {}}
        onRemoveDate={() => {}}
      />
    </div>
  )
}
