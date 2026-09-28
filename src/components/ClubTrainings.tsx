import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { RowActions } from '@/components/RowActions'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { useConfirm } from '@/components/useConfirm'
import { KindPill } from '@/components/TrainingCard'
import { AddDatesDialog, TrainingEditor } from '@/components/TrainingDialogs'
import { clubMemberGroups } from '@/lib/memberGroups'
import { sortByName } from '@/lib/sortByName'
import {
  audienceLabel, clubTrainings, formatTimeRange, mayManageSchedule, mayManageTrainings, placeLabel,
  recurrenceLabel, trainingAddress,
} from '@/lib/trainings'
import type { Training, User } from '@/types'

/**
 * A club's training series (#608) — its regular slots and its guided series,
 * on the club's own page since they describe the club: what it trains, when,
 * where and for whom. The Entraînements page lists the sessions they make.
 *
 * Every member of the club reads it; its admins create, edit and delete a
 * series, and a guided series' managers add its dates. On both club screens,
 * like `ClubMemberGroups`: /club for the club, /clubs/:id for a general admin.
 */
export function ClubTrainings({
  clubId,
  idPrefix = 'club',
  variant = 'panel',
}: {
  clubId: string
  idPrefix?: string
  /** Same two furnitures as `ClubMemberGroups` — see there. */
  variant?: 'panel' | 'section'
}) {
  const { user } = useAuth()
  const {
    clubs, users, memberGroups, trainings, trainingSessions,
    addTraining, updateTraining, deleteTraining, addTrainingDates,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<{ training?: Training } | null>(null)
  const [addingDatesTo, setAddingDatesTo] = useState<Training | null>(null)
  // « Gérer les séries » on the Entraînements page lands here (#entrainements):
  // the router changes the page, not the scroll.
  const location = useLocation()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (location.hash === '#entrainements') ref.current?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const club = clubs.find((c) => c.id === clubId)
  const canManage = mayManageTrainings(user, clubId)
  const groups = clubMemberGroups(memberGroups, clubId)
  const series = clubTrainings(trainings, clubId)
  const members = sortByName(
    users
      .filter((u) => u.clubId === clubId)
      .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
  )
  const nameOf = (id: string) => {
    const u: User | undefined = users.find((x) => x.id === id)
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null
  }

  // Nothing to read and nothing to do: a member of a club with no training is
  // spared a section about a feature they cannot use.
  if (!canManage && series.length === 0) return null

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

  const isSection = variant === 'section'
  return (
    <section
      ref={ref}
      id="entrainements"
      aria-labelledby={`${idPrefix}-trainings-title`}
      className={
        isSection
          ? 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isSection ? (
          <h3 id={`${idPrefix}-trainings-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Entraînements
          </h3>
        ) : (
          <h2 id={`${idPrefix}-trainings-title`} className="font-display text-lg font-semibold text-slate-800">
            Entraînements
          </h2>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing({})}
            className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
          >
            + Nouvel entraînement
          </button>
        )}
      </div>
      {canManage && (
        <p className="mt-2 text-sm text-slate-600">
          Les créneaux libres qui reviennent chaque semaine, et les séries de séances dirigées. Leurs
          séances sont sur la page <Link to="/entrainements" className="font-medium text-accent-600 hover:underline">Entraînements</Link>.
        </p>
      )}

      {series.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Aucun entraînement.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {series.map((t) => {
            const place = placeLabel(trainingAddress(t, clubs))
            const managers = t.managerIds.map(nameOf).filter(Boolean)
            return (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {t.displayName}
                    <KindPill kind={t.kind} />
                  </p>
                  <p className="text-slate-500">
                    {t.kind === 'regular' ? recurrenceLabel(t) : formatTimeRange(t)}
                    {place && ` · ${place}`}
                  </p>
                  <p className="text-slate-500">{audienceLabel(t, groups)}</p>
                  {managers.length > 0 && (
                    <p className="text-slate-500">Responsable{managers.length > 1 ? 's' : ''} : {managers.join(', ')}</p>
                  )}
                  {t.notes && <p className="mt-1 text-slate-600">{t.notes}</p>}
                </div>
                {mayManageSchedule(user, t) && (
                  <RowActions
                    menuOnly
                    label={`Actions — ${t.displayName}`}
                    actions={[
                      // The series itself is the admins'; its dates, its managers' too.
                      canManage && { label: 'Modifier', onClick: () => setEditing({ training: t }) },
                      t.kind === 'guided' && { label: 'Ajouter des dates', onClick: () => setAddingDatesTo(t) },
                      canManage && { label: 'Supprimer', tone: 'danger', onClick: () => removeSeries(t) },
                    ]}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <TrainingEditor
          training={editing.training}
          addresses={club?.addresses ?? []}
          groups={groups}
          members={members}
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
    </section>
  )
}
