import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'accent'
}

/**
 * Drop-in replacement for `window.confirm` (#375), shaped to keep the call
 * sites recognisable:
 *
 *     const [confirm, confirmDialog] = useConfirm()
 *     if (await confirm({ title: 'Archiver ce club ?' })) archiveClub(id)
 *     // …and render {confirmDialog} somewhere in the tree.
 *
 * Resolving a promise rather than taking a callback is what keeps the guard a
 * plain `if` at the call site, so migrating the twenty-one native dialogs is a
 * one-line change each rather than a restructure into callbacks.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    setOptions(null)
    // Cleared first: ModalShell returns focus to the trigger on unmount, and
    // the caller may navigate away in its `then`.
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.(ok)
  }, [])

  const dialog = options ? (
    <ConfirmDialog
      {...options}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return [confirm, dialog]
}
