import { useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import {
  TRAINING_KIND_LABELS, WEEKDAY_NAMES, isIsoDate, weeklyDates,
  type TrainingDraft, type TrainingResult,
} from '@/lib/trainings'
import type { Address, MemberGroup, Training, TrainingKind } from '@/types'

// The forms behind the Entraînements page (#608): a series, a run of dates,
// and calling one date off. Each is a `ModalShell`, so a bottom sheet below sm:.

const INPUT =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 ' +
  'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'
const LABEL = 'block text-sm font-medium text-slate-700'

function DialogCard({ titleId, title, children }: { titleId: string; title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
      <h2 id={titleId} className="font-display text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  )
}

function Actions({
  onCancel, submitLabel, submitDisabled, cancelLabel = 'Annuler',
}: { onCancel: () => void; submitLabel: string; submitDisabled?: boolean; cancelLabel?: string }) {
  return (
    <div className="mt-5 flex gap-2">
      <button type="button" onClick={onCancel} className={`${NEUTRAL_BUTTON_CLASS} flex-1`}>{cancelLabel}</button>
      <button type="submit" disabled={submitDisabled} className={`${PRIMARY_BUTTON_CLASS} flex-1 disabled:opacity-50`}>
        {submitLabel}
      </button>
    </div>
  )
}

/**
 * Create a series, or edit one.
 *
 * The kind is chosen once, at creation: a guided series' dates are its rows
 * and a regular one's rows are exceptions, so switching would turn one into
 * the other without a word. A new guided series is created with its first run
 * of dates — a series with no date is a series nobody sees.
 */
export function TrainingEditor({
  training,
  addresses,
  groups,
  onSave,
  onAddDates,
  onClose,
}: {
  training?: Training
  addresses: Address[]
  /** The club's member groups (#602). */
  groups: MemberGroup[]
  onSave: (draft: TrainingDraft) => Promise<TrainingResult>
  /** Only for a new guided series, once it exists. */
  onAddDates: (trainingId: string, dates: string[]) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<TrainingKind>(training?.kind ?? 'guided')
  const [displayName, setDisplayName] = useState(training?.displayName ?? '')
  const [weekday, setWeekday] = useState<number>(training?.weekday ?? 2)
  const [startTime, setStartTime] = useState(training?.startTime ?? '20:00')
  const [endTime, setEndTime] = useState(training?.endTime ?? '')
  const [addressId, setAddressId] = useState(training?.addressId ?? '')
  const [groupIds, setGroupIds] = useState<string[]>(training?.memberGroupIds ?? [])
  const [validFrom, setValidFrom] = useState(training?.validFrom ?? '')
  const [validUntil, setValidUntil] = useState(training?.validUntil ?? '')
  const [notes, setNotes] = useState(training?.notes ?? '')
  const [firstDate, setFirstDate] = useState('')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isNew = !training
  const dates = isNew && kind === 'guided' ? weeklyDates(firstDate, repeatUntil || undefined) : []
  const toggleGroup = (id: string) =>
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const draft: TrainingDraft = {
      kind,
      displayName: displayName.trim(),
      startTime,
      ...(endTime ? { endTime } : {}),
      ...(addressId ? { addressId } : {}),
      memberGroupIds: groupIds,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(kind === 'regular'
        ? { weekday, ...(validFrom ? { validFrom } : {}), ...(validUntil ? { validUntil } : {}) }
        : {}),
    }
    const result = await onSave(draft)
    setSaving(false)
    if (!result.ok) { setError(result.message); return }
    if (dates.length) onAddDates(result.training.id, dates)
    onClose()
  }

  const titleId = 'training-editor-title'
  return (
    <ModalShell onClose={onClose} labelledBy={titleId}>
      <DialogCard titleId={titleId} title={isNew ? 'Nouvel entraînement' : "Modifier l'entraînement"}>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {isNew && (
            <fieldset>
              <legend className={LABEL}>Type</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['guided', 'regular'] as TrainingKind[]).map((k) => (
                  <label
                    key={k}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium ${
                      kind === k ? 'border-accent-600 bg-accent-50 text-accent-700' : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    <input type="radio" name="training-kind" value={k} checked={kind === k}
                      onChange={() => setKind(k)} className="sr-only" />
                    {TRAINING_KIND_LABELS[k]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {kind === 'guided'
                  ? 'Des séances datées, avec un encadrant. Chacun indique s’il vient.'
                  : 'Un créneau qui revient chaque semaine. Pas de réponse demandée.'}
              </p>
            </fieldset>
          )}

          <div>
            <label htmlFor="training-name" className={LABEL}>Nom</label>
            <input id="training-name" type="text" value={displayName} maxLength={60} className={INPUT}
              placeholder={kind === 'guided' ? 'Dirigé jeunes' : 'Entraînement libre'}
              onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          {kind === 'regular' && (
            <div>
              <label htmlFor="training-weekday" className={LABEL}>Jour</label>
              <select id="training-weekday" value={weekday} className={INPUT}
                onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAY_NAMES.slice(1).map((name, i) => (
                  <option key={name} value={i + 1}>{name[0].toUpperCase() + name.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="training-start" className={LABEL}>Début</label>
              <input id="training-start" type="time" value={startTime} required className={INPUT}
                onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="training-end" className={LABEL}>Fin <span className="font-normal text-slate-400">(facultatif)</span></label>
              <input id="training-end" type="time" value={endTime} className={INPUT}
                onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {addresses.length > 0 && (
            <div>
              <label htmlFor="training-address" className={LABEL}>Lieu</label>
              <select id="training-address" value={addressId} className={INPUT}
                onChange={(e) => setAddressId(e.target.value)}>
                <option value="">Adresse par défaut du club</option>
                {addresses.map((a) => <option key={a.id} value={a.id}>{a.label || a.city}</option>)}
              </select>
            </div>
          )}

          <fieldset>
            <legend className={LABEL}>Pour qui</legend>
            {groups.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Tout le club. Créez des groupes sur la page du club pour viser une partie des membres.
              </p>
            ) : (
              <>
                <div className="mt-1 flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const on = groupIds.includes(g.id)
                    return (
                      <button key={g.id} type="button" aria-pressed={on} onClick={() => toggleGroup(g.id)}
                        className={`min-h-11 rounded-full border px-3 text-sm md:min-h-8 ${
                          on ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 text-slate-700'
                        }`}>
                        {g.displayName}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {groupIds.length ? 'Les membres des groupes choisis.' : 'Aucun groupe choisi : tout le club.'}
                </p>
              </>
            )}
          </fieldset>

          {kind === 'regular' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="training-from" className={LABEL}>Du <span className="font-normal text-slate-400">(facultatif)</span></label>
                <input id="training-from" type="date" value={validFrom} className={INPUT}
                  onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="training-until" className={LABEL}>Au <span className="font-normal text-slate-400">(facultatif)</span></label>
                <input id="training-until" type="date" value={validUntil} className={INPUT}
                  onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
          )}

          {isNew && kind === 'guided' && (
            <DateRunFields
              first={firstDate} until={repeatUntil} onFirst={setFirstDate} onUntil={setRepeatUntil} count={dates.length}
            />
          )}

          <div>
            <label htmlFor="training-notes" className={LABEL}>Informations <span className="font-normal text-slate-400">(facultatif)</span></label>
            <textarea id="training-notes" value={notes} rows={2} maxLength={300} className={INPUT}
              placeholder="Encadrant, matériel, niveau…" onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Actions onCancel={onClose} submitLabel="Enregistrer"
            submitDisabled={saving || !displayName.trim() || (isNew && kind === 'guided' && !dates.length)} />
        </form>
      </DialogCard>
    </ModalShell>
  )
}

/** A first date and an optional weekly repeat — how a coach's run is typed in. */
function DateRunFields({
  first, until, onFirst, onUntil, count,
}: {
  first: string; until: string; onFirst: (v: string) => void; onUntil: (v: string) => void; count: number
}) {
  return (
    <div>
      {/* Bottom-aligned: the second label wraps on a phone, the inputs must not. */}
      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <label htmlFor="training-first-date" className={LABEL}>Première séance</label>
          <input id="training-first-date" type="date" value={first} className={INPUT}
            onChange={(e) => onFirst(e.target.value)} />
        </div>
        <div>
          <label htmlFor="training-repeat-until" className={LABEL}>
            Chaque semaine jusqu’au <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input id="training-repeat-until" type="date" value={until} min={first || undefined} className={INPUT}
            onChange={(e) => onUntil(e.target.value)} />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {count === 0
          ? 'Choisissez au moins une date.'
          : `${count} séance${count > 1 ? 's' : ''}. Chaque date se retire ensuite une à une.`}
      </p>
    </div>
  )
}

/** Add a run of dates to a guided series. */
export function AddDatesDialog({
  training, onAdd, onClose,
}: { training: Training; onAdd: (dates: string[]) => void; onClose: () => void }) {
  const [first, setFirst] = useState('')
  const [until, setUntil] = useState('')
  const dates = weeklyDates(first, until || undefined)
  const titleId = 'training-dates-title'
  return (
    <ModalShell onClose={onClose} labelledBy={titleId}>
      <DialogCard titleId={titleId} title={`Ajouter des dates — ${training.displayName}`}>
        <form
          className="mt-4"
          onSubmit={(e) => { e.preventDefault(); if (dates.length) { onAdd(dates); onClose() } }}
        >
          <DateRunFields first={first} until={until} onFirst={setFirst} onUntil={setUntil} count={dates.length} />
          <Actions onCancel={onClose} submitLabel="Ajouter" submitDisabled={!dates.length || !isIsoDate(first)} />
        </form>
      </DialogCard>
    </ModalShell>
  )
}

/**
 * Call one date off. The reason is optional and goes out with the notice to
 * whoever was counting on the session.
 */
export function CancelSessionDialog({
  title, onConfirm, onClose,
}: { title: string; onConfirm: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  const titleId = 'training-cancel-title'
  return (
    <ModalShell onClose={onClose} labelledBy={titleId}>
      <DialogCard titleId={titleId} title={title}>
        <form className="mt-4" onSubmit={(e) => { e.preventDefault(); onConfirm(note.trim()); onClose() }}>
          <label htmlFor="training-cancel-note" className={LABEL}>
            Motif <span className="font-normal text-slate-400">(facultatif)</span>
          </label>
          <input id="training-cancel-note" type="text" value={note} maxLength={120} className={INPUT}
            placeholder="Gymnase fermé, tournoi…" onChange={(e) => setNote(e.target.value)} />
          <p className="mt-2 text-xs text-slate-500">
            La séance reste affichée, marquée annulée. Les membres déjà prévenus, ou qui avaient dit
            venir, reçoivent un avis.
          </p>
          {/* « Retour », not « Annuler », beside a button that cancels the session. */}
          <Actions onCancel={onClose} cancelLabel="Retour" submitLabel="Annuler la séance" />
        </form>
      </DialogCard>
    </ModalShell>
  )
}
