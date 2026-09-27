import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { PageHeader } from '@/components/PageHeader'
import { HeaderAction } from '@/components/Button'
import { PlusIcon } from '@/components/icons'
import { RowActions } from '@/components/RowActions'
import { KindPill, OccurrenceCard } from '@/components/TrainingCard'
import { useConfirm } from '@/components/useConfirm'
import { AddDatesDialog, CancelSessionDialog, TrainingEditor } from '@/components/TrainingDialogs'
import { clubMemberGroups } from '@/lib/memberGroups'
import { longDate } from '@/lib/pushNotifications'
import { sortByName } from '@/lib/sortByName'
import { todayIso } from '@/lib/weeks'
import {
  audienceLabel, clubTrainings,
  expectedMemberIds, formatTimeRange, mayManageTrainings, occurrenceKey, placeLabel, recurrenceLabel,
  trainingAddress, upcomingOccurrences, type TrainingOccurrence,
} from '@/lib/trainings'
import type { Training } from '@/types'

/** How far ahead the list looks — four weeks, a coach's planning horizon. */
const HORIZON_DAYS = 28

/**
 * The club's collective trainings (#608): what is coming up, who is expected,
 * and — for a guided session — who is coming.
 *
 * Every member of the club reads it; its administrators also run it: the
 * series, the dates of a guided one, and the evenings a regular slot is off.
 */
export function TrainingsPage() {
  const { user } = useAuth()
  const data = useAppData()
  const {
    clubs, users, memberGroups, trainings, trainingSessions, trainingAvailabilities,
    addTraining, updateTraining, deleteTraining, addTrainingDates, setTrainingSessionState,
    deleteTrainingDate, setTrainingAvailability,
  } = data
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<{ training?: Training } | null>(null)
  const [addingDatesTo, setAddingDatesTo] = useState<Training | null>(null)
  const [cancelling, setCancelling] = useState<TrainingOccurrence | null>(null)

  const clubId = user?.clubId
  const club = clubs.find((c) => c.id === clubId)
  const canManage = mayManageTrainings(user, clubId)
  const today = todayIso()
  const groups = clubMemberGroups(memberGroups, clubId)
  const occurrences = upcomingOccurrences(data, clubId, today, HORIZON_DAYS)
  const series = clubTrainings(trainings, clubId)

  const byDate = useMemo(() => {
    const out = new Map<string, TrainingOccurrence[]>()
    for (const o of occurrences) out.set(o.date, [...(out.get(o.date) ?? []), o])
    return [...out.entries()]
  }, [occurrences])

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

  const removeSeries = async (t: Training) => {
    const ok = await confirm({
      title: `Supprimer « ${t.displayName} » ?`,
      message: t.kind === 'guided'
        ? 'Toutes ses séances et les réponses données sont supprimées.'
        : 'Le créneau et ses exceptions sont supprimés.',
      confirmLabel: 'Supprimer',
    })
    if (ok) deleteTraining(clubId, t.id)
  }

  return (
    <div className="space-y-5">
      {confirmDialog}
      <PageHeader
        title="Entraînements"
        club={club}
        actions={canManage && (
          <HeaderAction icon={<PlusIcon />} label="Nouvel entraînement" onClick={() => setEditing({})} />
        )}
      />

      <section aria-labelledby="trainings-upcoming" className="space-y-3">
        <h2 id="trainings-upcoming" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prochaines séances
        </h2>
        {byDate.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {series.length
              ? 'Aucune séance dans les quatre prochaines semaines.'
              : canManage
                ? 'Aucun entraînement pour l’instant. Créez un créneau libre ou une série de séances dirigées.'
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
                  canManage={canManage}
                  onAnswer={(playerId, status) => setTrainingAvailability(o.training.id, o.date, playerId, status)}
                  onCancel={() => setCancelling(o)}
                  onRestore={() => restore(o)}
                  onRemoveDate={() => removeDate(o)}
                />
              ))}
            </div>
          ))
        )}
      </section>

      {series.length > 0 && (
        <section aria-labelledby="trainings-series" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 id="trainings-series" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Créneaux et séries
          </h2>
          <ul className="mt-3 space-y-2">
            {series.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {t.displayName}
                    <KindPill kind={t.kind} />
                  </p>
                  <p className="text-slate-500">
                    {t.kind === 'regular' ? recurrenceLabel(t) : formatTimeRange(t)}
                    {placeLabel(trainingAddress(t, clubs)) && ` · ${placeLabel(trainingAddress(t, clubs))}`}
                  </p>
                  <p className="text-slate-500">{audienceLabel(t, groups)}</p>
                  {t.notes && <p className="mt-1 text-slate-600">{t.notes}</p>}
                </div>
                {canManage && (
                  <RowActions
                    menuOnly
                    label={`Actions — ${t.displayName}`}
                    actions={[
                      { label: 'Modifier', onClick: () => setEditing({ training: t }) },
                      t.kind === 'guided' && { label: 'Ajouter des dates', onClick: () => setAddingDatesTo(t) },
                      { label: 'Supprimer', tone: 'danger', onClick: () => removeSeries(t) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <TrainingEditor
          training={editing.training}
          addresses={club?.addresses ?? []}
          groups={groups}
          onSave={(draft) => editing.training
            ? updateTraining(clubId, editing.training.id, draft)
            : addTraining(clubId, draft)}
          onAddDates={(trainingId, dates) => addTrainingDates(clubId, trainingId, dates)}
          onClose={() => setEditing(null)}
        />
      )}
      {addingDatesTo && (
        <AddDatesDialog
          training={addingDatesTo}
          existingDates={trainingSessions.filter((x) => x.trainingId === addingDatesTo.id).map((x) => x.date)}
          onAdd={(dates) => addTrainingDates(clubId, addingDatesTo.id, dates)}
          onClose={() => setAddingDatesTo(null)}
        />
      )}
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
