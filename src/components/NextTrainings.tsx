import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { OccurrenceCard } from '@/components/TrainingCard'
import { ChevronRightIcon } from '@/components/icons'
import { clubMemberGroups } from '@/lib/memberGroups'
import { longDate } from '@/lib/pushNotifications'
import { sortByName } from '@/lib/sortByName'
import { todayIso } from '@/lib/weeks'
import {
  audienceLabel, expectedMemberIds, formatTime, nextRegularSession, nextSessionToAnswer, placeLabel,
  trainingAddress, type TrainingOccurrence,
} from '@/lib/trainings'

/**
 * Prochains entraînements, on the Accueil (#608) — the same block as the app's.
 *
 * What the week holds for this member: the next guided session they are
 * expected at, with the Entraînements page's own card so it is answered the
 * same way, and the next evening of their regular slot in one line, cancelled
 * or not. By date. Nothing at all when neither is waiting on them.
 */
export function NextTrainings() {
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
    <section aria-labelledby="home-trainings" className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between">
        <h2 id="home-trainings" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prochains entraînements
        </h2>
        <Link to="/entrainements" className="flex min-h-11 items-center text-sm font-medium text-accent-600 hover:text-accent-800 md:min-h-0">
          Tous les entraînements
        </Link>
      </div>
      {items.map((o) =>
        o === guided ? (
          <OccurrenceCard
            key="guided"
            occurrence={o}
            showDate
            place={placeLabel(trainingAddress(o.training, clubs))}
            audience={audienceLabel(o.training, groups)}
            expected={expectedAt(o)}
            answers={trainingAvailabilities}
            viewerId={user.id}
            // The calendar is run from its own page; the Accueil only answers.
            canManage={false}
            onAnswer={(playerId, status) => setTrainingAvailability(o.training.id, o.date, playerId, status)}
            onCancel={() => {}}
            onRestore={() => {}}
            onRemoveDate={() => {}}
          />
        ) : (
          <Link
            key="regular"
            to="/entrainements"
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm hover:border-slate-300"
          >
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${o.cancelled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                {o.training.displayName}
              </span>
              <span className={`block text-xs ${o.cancelled ? 'text-red-700' : 'text-slate-500'}`}>
                {longDate(o.date)} à {formatTime(o.training.startTime)}
                {o.cancelled ? ` — annulé${o.note ? ` : ${o.note}` : ''}` : ''}
              </span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
        ),
      )}
    </section>
  )
}
