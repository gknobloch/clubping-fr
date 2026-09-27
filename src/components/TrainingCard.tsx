import { useState } from 'react'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { RowActions } from '@/components/RowActions'
import { AvailabilityButtons, AvailabilityPills } from '@/components/Availability'
import { longDate } from '@/lib/pushNotifications'
import {
  answerCounts, answerOf, answerTally, asksForAnswer, formatTimeRange, type TrainingOccurrence,
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

      {asks && !o.cancelled && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {isExpected && viewerId && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">Vous venez ?</span>
              <AvailabilityButtons
                status={mine}
                onSet={(s) => onAnswer(viewerId, s)}
                onClear={() => onAnswer(viewerId, null)}
              />
            </div>
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
