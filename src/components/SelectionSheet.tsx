import { useMemo, useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { AVAILABILITY_COLORS, AVAILABILITY_LABELS } from '@/components/availabilityControls'
import { sortByName } from '@/lib/sortByName'
import type { AvailabilityStatus, Player } from '@/types'

/**
 * Line-up picker, mirroring the native app's CaptainSelectionSheet: this team's
 * roster under "Cette équipe", then the club players still eligible under
 * "Autres joueurs" (#382).
 *
 * It replaced a per-player team dropdown on each roster row, which asked the
 * captain to think one player at a time about a decision they make as a group
 * — "who are my four?" — and offered no way at all to reach beyond the roster
 * from a phone (#380).
 *
 * Choices are held locally and applied on Enregistrer, so a half-made line-up
 * is never written and Annuler really cancels.
 */
export function SelectionSheet({
  teamLabel,
  playersPerGame,
  roster,
  others,
  initialSelection,
  availabilityOf,
  /** playerId → team number already fielding them this round. */
  committedElsewhere,
  onSave,
  onClose,
}: {
  teamLabel: string
  playersPerGame: number
  roster: Player[]
  others: Player[]
  initialSelection: string[]
  availabilityOf: (playerId: string) => AvailabilityStatus | undefined
  committedElsewhere: Map<string, number>
  onSave: (playerIds: string[]) => void
  onClose: () => void
}) {
  const [selection, setSelection] = useState<string[]>(initialSelection)
  const [limitHit, setLimitHit] = useState(false)

  const full = selection.length >= playersPerGame

  const toggle = (playerId: string) => {
    setLimitHit(false)
    setSelection((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId)
      // The web has no native alert to fall back on, and #375 established we do
      // not want one: the limit is said in the sheet instead.
      if (prev.length >= playersPerGame) {
        setLimitHit(true)
        return prev
      }
      return [...prev, playerId]
    })
  }

  const sortedRoster = useMemo(() => sortByName(roster), [roster])
  const sortedOthers = useMemo(() => sortByName(others), [others])

  const row = (player: Player) => {
    const picked = selection.includes(player.id)
    const lockedTeam = picked ? undefined : committedElsewhere.get(player.id)
    const locked = lockedTeam !== undefined
    const status = availabilityOf(player.id)
    return (
      <li key={player.id}>
        <button
          type="button"
          disabled={locked}
          onClick={() => toggle(player.id)}
          aria-pressed={picked}
          className="flex min-h-11 w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-white"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
              picked
                ? 'border-accent-600 bg-accent-600 text-white'
                : 'border-slate-300 text-transparent'
            }`}
            aria-hidden
          >
            ✓
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              locked ? 'text-slate-400' : picked ? 'font-semibold text-slate-900' : 'text-slate-800'
            }`}
          >
            {player.firstName} {player.lastName}
          </span>
          {locked ? (
            <span className="shrink-0 text-xs text-slate-500">Équipe {lockedTeam}</span>
          ) : status ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${AVAILABILITY_COLORS[status]}22`, color: AVAILABILITY_COLORS[status] }}
            >
              {AVAILABILITY_LABELS[status]}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-slate-400">—</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <ModalShell onClose={onClose} closeOnBackdrop labelledBy="selection-title" z={40}>
      <div className="rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="border-b border-slate-100 px-4 pt-4 pb-3">
          <h2 id="selection-title" className="font-display text-base font-bold text-slate-800">
            Sélection — {teamLabel} ({selection.length}/{playersPerGame})
          </h2>
          {limitHit && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Maximum {playersPerGame} joueurs par match. Retirez un joueur avant d’en ajouter un
              autre.
            </p>
          )}
        </div>

        <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cette équipe
        </p>
        <ul>{sortedRoster.map(row)}</ul>

        {sortedOthers.length > 0 && (
          <>
            <p className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Autres joueurs
            </p>
            <ul>{sortedOthers.map(row)}</ul>
          </>
        )}

        <div className="flex gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className={`flex-1 ${NEUTRAL_BUTTON_CLASS}`}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(selection)
              onClose()
            }}
            className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
          >
            Enregistrer
          </button>
        </div>
        {full && (
          <p className="px-4 pb-4 text-center text-xs text-slate-500">Composition complète.</p>
        )}
      </div>
    </ModalShell>
  )
}
