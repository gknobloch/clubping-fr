import { ModalShell } from '@/components/ModalShell'
import { DANGER_BUTTON_CLASS, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

// In-app replacement for `window.confirm` (#375). The native dialog is not
// merely ugly on a phone: iOS Safari lets a member tick "Block All Dialogs"
// after any dialog, and from then on `window.confirm` returns false without
// showing anything, for the whole site. Every destructive action guarded by it
// — logout, archive, delete — becomes a silent no-op, with nothing on screen to
// say the action did not happen.
//
// Anchored to the bottom below sm: the way GameQuickView already is, so the
// buttons land under the thumb rather than mid-screen.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string
  /** Optional detail under the title. Keep the consequence here, not in the title. */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for anything that destroys or hides data; `accent` otherwise. */
  tone?: 'danger' | 'accent'
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ModalShell
      onClose={onCancel}
      closeOnBackdrop
      labelledBy="confirm-dialog-title"
      z={50}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h2 id="confirm-dialog-title" className="font-display text-lg font-semibold text-slate-800">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={NEUTRAL_BUTTON_CLASS}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={tone === 'danger' ? DANGER_BUTTON_CLASS : PRIMARY_BUTTON_CLASS}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
