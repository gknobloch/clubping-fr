import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { PageHeader } from '@/components/PageHeader'
import { HeaderAction, NEUTRAL_BUTTON_CLASS } from '@/components/Button'
import { EditIcon } from '@/components/icons'
import { OccurrenceCard } from '@/components/TrainingCard'
import { useConfirm } from '@/components/useConfirm'
import { CancelSessionDialog } from '@/components/TrainingDialogs'
import { clubMemberGroups } from '@/lib/memberGroups'
import { longDate } from '@/lib/pushNotifications'
import { sortByName } from '@/lib/sortByName'
import { todayIso } from '@/lib/weeks'
import {
  LIST_PAGE_SIZE, audienceLabel, clubTrainings, expectedMemberIds, mayManageSchedule, mayManageTrainings,
  occurrenceKey, placeLabel, trainingAddress, upcomingOccurrences, type TrainingOccurrence,
} from '@/lib/trainings'

/**
 * The club's collective trainings (#608): the sessions coming up, who is
 * expected, and — for a guided session — who is coming.
 *
 * Every member of the club reads it; whoever runs a series calls its sessions
 * off and restores them here. The series themselves — creating, editing, a
 * guided series' dates — are on the club's page (`ClubTrainings`), since they
 * describe the club rather than a week of it.
 */
export function TrainingsPage() {
  const { user } = useAuth()
  const data = useAppData()
  const {
    clubs, users, memberGroups, trainings, trainingAvailabilities,
    setTrainingSessionState, deleteTrainingDate, setTrainingAvailability,
  } = data
  const navigate = useNavigate()
  const [confirm, confirmDialog] = useConfirm()
  const [cancelling, setCancelling] = useState<TrainingOccurrence | null>(null)

  const clubId = user?.clubId
  const club = clubs.find((c) => c.id === clubId)
  const canManage = mayManageTrainings(user, clubId)
  const today = todayIso()
  const groups = clubMemberGroups(memberGroups, clubId)
  const occurrences = upcomingOccurrences(data, clubId, today)
  const series = clubTrainings(trainings, clubId)
  // Ten at a time (#608): a weekly slot alone is fifty evenings a year.
  const [limit, setLimit] = useState(LIST_PAGE_SIZE)
  // Whoever runs a series — the club's admins, a guided series' managers — gets
  // the way to them.
  const runsASeries = canManage || series.some((t) => mayManageSchedule(user, t))

  const byDate = useMemo(() => {
    const out = new Map<string, TrainingOccurrence[]>()
    for (const o of occurrences.slice(0, limit)) out.set(o.date, [...(out.get(o.date) ?? []), o])
    return [...out.entries()]
  }, [occurrences, limit])

  if (!clubId) return <Navigate to="/" replace />

  const restore = (o: TrainingOccurrence) =>
    setTrainingSessionState(clubId, o.training.id, o.date, { cancelled: false })

  const removeDate = async (o: TrainingOccurrence) => {
    const ok = await confirm({
      title: `Retirer la séance du ${longDate(o.date)} ?`,
      message: 'Les réponses déjà données pour cette date sont retirées avec elle.',
      confirmLabel: 'Retirer',
    })
    if (ok) deleteTrainingDate(clubId, o.training.id, o.date)
  }

  return (
    <div className="space-y-5">
      {confirmDialog}
      <PageHeader
        title="Entraînements"
        club={club}
        actions={runsASeries && (
          <HeaderAction
            variant="secondary"
            icon={<EditIcon />}
            label="Gérer les séries"
            onClick={() => navigate('/club#entrainements')}
          />
        )}
      />

      <section aria-labelledby="trainings-upcoming" className="space-y-3">
        <h2 id="trainings-upcoming" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prochaines séances
        </h2>
        {byDate.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {series.length
              ? 'Aucune séance à venir.'
              : canManage
                ? 'Aucun entraînement pour l’instant. Créez un créneau libre ou une série dirigée depuis la page du club.'
                : 'Le club n’a pas encore publié ses entraînements.'}
          </p>
        ) : (
          byDate.map(([date, list]) => (
            <div key={date} className="space-y-2">
              {/* First letter only: `capitalize` would write "Septembre". */}
              <h3 className="text-sm font-semibold text-slate-700">
                {date === today ? `Aujourd’hui — ${longDate(date)}` : upperFirst(longDate(date))}
              </h3>
              {list.map((o) => (
                <OccurrenceCard
                  key={occurrenceKey(o.training.id, o.date)}
                  occurrence={o}
                  place={placeLabel(trainingAddress(o.training, clubs))}
                  audience={audienceLabel(o.training, groups)}
                  expected={sortByName(
                    users
                      .filter((u) => expectedMemberIds(o.training, groups, users).includes(u.id))
                      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
                  )}
                  answers={trainingAvailabilities}
                  viewerId={user?.id}
                  // Per series (#608): a guided one's own managers run its dates.
                  canManage={mayManageSchedule(user, o.training)}
                  onAnswer={(playerId, status) => setTrainingAvailability(o.training.id, o.date, playerId, status)}
                  onCancel={() => setCancelling(o)}
                  onRestore={() => restore(o)}
                  onRemoveDate={() => removeDate(o)}
                />
              ))}
            </div>
          ))
        )}
        {occurrences.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + LIST_PAGE_SIZE)}
            className={`${NEUTRAL_BUTTON_CLASS} w-full`}
          >
            Voir plus
          </button>
        )}
      </section>

      {cancelling && (
        <CancelSessionDialog
          title={`Annuler la séance du ${longDate(cancelling.date)} ?`}
          onConfirm={(note) => setTrainingSessionState(clubId, cancelling.training.id, cancelling.date, {
            cancelled: true, note,
          })}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  )
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
