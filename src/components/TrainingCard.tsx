import { useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { ICON_TARGET_CLASS } from '@/components/Button'
import { CalendarPlusIcon } from '@/components/icons'
import { toIcsMany } from '@/lib/ics'
import { downloadIcs } from '@/lib/icsDownload'
import { todayIso } from '@/lib/weeks'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { RowActions } from '@/components/RowActions'
import { AvailabilityButtons, AvailabilityPills, MyAvailabilityField } from '@/components/Availability'
import { longDate } from '@/lib/pushNotifications'
import {
  answerCounts, answerOf, answerTally, asksForAnswer, buildTrainingEvent, formatTimeRange, seriesCalendarDates,
  trainingAddress, trainingEventUid, type TrainingOccurrence,
} from '@/lib/trainings'
import type { AvailabilityStatus, Training, TrainingAvailability, User } from '@/types'

// One training session (#608) — the Entraînements page lists them, and the
// Accueil shows the member's next one with the same card, so an answer is
// given the same way in both places.

export function KindPill({ kind }: { kind: Training['kind'] }) {
  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 align-middle text-xs font-medium ${
      kind === 'guided' ? 'bg-accent-50 text-accent-700' : 'bg-slate-100 text-slate-600'
    }`}>
      {kind === 'guided' ? 'Dirigé' : 'Libre'}
    </span>
  )
}

/**
 * One session. A guided one carries the viewer's own answer and the tally over
 * whoever is expected, unfolding to the names; a regular one only says when,
 * where and for whom.
 */
export function OccurrenceCard({
  occurrence: o, place, audience, expected, answers, viewerId, canManage,
  onAnswer, onCancel, onRestore, onRemoveDate, showDate = false,
}: {
  occurrence: TrainingOccurrence
  place?: string
  audience: string
  expected: User[]
  answers: TrainingAvailability[]
  viewerId?: string
  canManage: boolean
  onAnswer: (playerId: string, status: AvailabilityStatus | null) => void
  onCancel: () => void
  onRestore: () => void
  onRemoveDate: () => void
  /** Say the day too — on the Accueil, where no date heading sits above the card. */
  showDate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const t = o.training
  const asks = asksForAnswer(t.kind)
  const expectedIds = expected.map((u) => u.id)
  const isExpected = !!viewerId && expectedIds.includes(viewerId)
  const mine = answerOf(answers, t.id, o.date, viewerId)
  const counts = answerCounts(answers, t.id, o.date, expectedIds)

  return (
    <article
      aria-label={`${t.displayName}, ${longDate(o.date)}`}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${o.cancelled ? 'border-slate-200 opacity-80' : 'border-slate-200'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${o.cancelled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
            {t.displayName}
            <KindPill kind={t.kind} />
          </p>
          <p className="text-sm text-slate-500">
            {showDate && `${longDate(o.date)} · `}{formatTimeRange(t)}{place && ` · ${place}`}
          </p>
          <p className="text-sm text-slate-500">{audience}</p>
          {o.cancelled && (
            <p className="mt-1 text-sm font-medium text-red-700">
              Annulée{o.note ? ` — ${o.note}` : ''}
            </p>
          )}
          {!o.cancelled && o.note && <p className="mt-1 text-sm text-slate-600">{o.note}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-1">
        {asksForAnswer(t.kind) && !o.cancelled && <AddTrainingToCalendar occurrence={o} />}
        {canManage && (
          <RowActions
            menuOnly
            label={`Actions — ${t.displayName}, ${longDate(o.date)}`}
            actions={[
              o.cancelled
                ? { label: 'Rétablir la séance', onClick: onRestore }
                : { label: 'Annuler la séance', tone: 'danger', onClick: onCancel },
              t.kind === 'guided' && { label: 'Retirer cette date', tone: 'danger', onClick: onRemoveDate },
            ]}
          />
        )}
        </div>
      </div>

      {asks && !o.cancelled && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {isExpected && viewerId && (
            // The match card's own field and buttons, so a member reads the
            // two questions as the same one (#608).
            <MyAvailabilityField>
              <AvailabilityButtons
                status={mine}
                onSet={(s) => onAnswer(viewerId, s)}
                onClear={() => onAnswer(viewerId, null)}
              />
            </MyAvailabilityField>
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`text-sm text-slate-600 hover:text-slate-900 ${TEXT_TARGET_CLASS}`}
          >
            {answerTally(counts)} {open ? '▴' : '▾'}
          </button>
          {open && (
            <ul className="space-y-1">
              {expected.map((u) => {
                const status = answerOf(answers, t.id, o.date, u.id)
                return (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700">{u.firstName} {u.lastName}</span>
                    {canManage && u.id !== viewerId ? (
                      <AvailabilityButtons size="sm" status={status}
                        onSet={(s) => onAnswer(u.id, s)} onClear={() => onAnswer(u.id, null)} />
                    ) : (
                      <AvailabilityPills size="sm" status={status} />
                    )}
                  </li>
                )
              })}
              {expected.length === 0 && <li className="text-sm text-slate-400">Personne n’est attendu.</li>}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * « Ajouter à mon agenda » for a guided session (#608): this one date, or the
 * whole series — every date still on from today — in one .ics, one event per
 * date keyed so that importing again updates rather than doubles.
 */
function AddTrainingToCalendar({ occurrence: o }: { occurrence: TrainingOccurrence }) {
  const { clubs, trainingSessions } = useAppData()
  const [open, setOpen] = useState(false)
  const address = trainingAddress(o.training, clubs)
  const seriesDates = seriesCalendarDates(trainingSessions, o.training.id, todayIso())
  const slug = o.training.displayName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const download = (dates: string[], suffix: string) => {
    setOpen(false)
    downloadIcs(
      `club-ping-${slug}${suffix}.ics`,
      toIcsMany(dates.map((date) => ({
        event: buildTrainingEvent({ training: o.training, date }, address),
        uid: trainingEventUid(o.training.id, date),
      }))),
    )
  }

  return (
    <div
      className="relative"
      // Closes when focus leaves the menu, without a document listener.
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false) }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajouter à mon agenda"
        aria-expanded={open}
        title="Ajouter à mon agenda"
        className={`${ICON_TARGET_CLASS} text-slate-500 hover:text-slate-800`}
      >
        <CalendarPlusIcon className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => download([o.date], `-${o.date}`)}
            className="flex min-h-11 w-full items-center px-4 text-left text-sm text-slate-700 hover:bg-slate-50 md:min-h-9"
          >
            Cette séance
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={seriesDates.length === 0}
            onClick={() => download(seriesDates, '')}
            className="flex min-h-11 w-full items-center px-4 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-300 md:min-h-9"
          >
            Toute la série ({seriesDates.length} date{seriesDates.length > 1 ? 's' : ''})
          </button>
        </div>
      )}
    </div>
  )
}
