import { useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, SecondaryButton } from '@/components/Button'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@/lib/playerSearch'
import type { Player } from '@/types'

/**
 * "+ Ajouter un joueur", as a searchable sheet rather than a `<select>` (#454).
 *
 * The native dropdown it replaces listed the whole club in licence order of
 * arrival: fine for a club of eight, a scroll through fifty names for anyone
 * else, and on a phone a spinning wheel where the keyboard does nothing at all.
 *
 * The sheet stays open after a pick. Adding a line-up is four or five names in
 * a row, and the list shrinking under the finger is the confirmation — closing
 * on each pick would mean reopening the sheet four times.
 */
export function PlayerPicker({
  players,
  onPick,
  label = '+ Ajouter un joueur',
  title = 'Ajouter un joueur',
  emptyLabel = 'Tous les joueurs disponibles sont dans l’équipe.',
}: {
  /** Those still addable — the caller removes anyone already on the roster. */
  players: Player[]
  onPick: (playerId: string) => void
  label?: string
  title?: string
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const searchable = players.length > PLAYER_SEARCH_THRESHOLD
  const shown = searchable ? filterPlayersBySearch(players, query) : players

  return (
    <>
      <SecondaryButton
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
      >
        {label}
      </SecondaryButton>

      {open && (
        <ModalShell
          onClose={() => setOpen(false)}
          closeOnBackdrop
          labelledBy="player-picker-title"
          z={40}
        >
          <div className="max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="border-b border-slate-100 px-4 pt-4 pb-3">
              <h2
                id="player-picker-title"
                className="font-display text-base font-bold text-slate-800"
              >
                {title}
              </h2>
            </div>

            {searchable && (
              <div className="border-b border-slate-100 px-4 py-3">
                <label htmlFor="player-picker-search" className="sr-only">
                  {PLAYER_SEARCH_LABEL}
                </label>
                <input
                  id="player-picker-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={PLAYER_SEARCH_LABEL}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            )}

            <ul>
              {shown.map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => onPick(player.id)}
                    className="flex min-h-11 w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                      {player.firstName} {player.lastName}
                    </span>
                    {player.licenseNumber && (
                      <span className="shrink-0 text-xs text-slate-400">
                        {player.licenseNumber}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {shown.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {query.trim() !== ''
                  ? `Aucun joueur ne correspond à « ${query.trim()} ».`
                  : emptyLabel}
              </p>
            )}

            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`w-full ${NEUTRAL_BUTTON_CLASS}`}
              >
                Fermer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  )
}
