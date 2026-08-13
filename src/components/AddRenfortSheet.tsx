import { useMemo, useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS } from '@/components/Button'
import { AVAILABILITY_COLORS, AVAILABILITY_LABELS } from '@/components/availabilityControls'
import { sortByName } from '@/lib/sortByName'
import type { AvailabilityStatus, Player } from '@/types'

/**
 * Picks a club player from outside the team's roster to field for one game — a
 * renfort (#380).
 *
 * The desktop matrix has always allowed this through its "Autres joueurs"
 * section, but that section is desktop-only, so a captain composing from a
 * phone simply could not field a borrowed player. Fielding one is routine in
 * championship play, especially when the roster is short of availability.
 *
 * Ineligible players are listed and disabled rather than filtered out. Brûlage
 * is the rule captains most often trip over, and a name that is simply absent
 * looks like a bug or a missing licence; a name greyed out with a reason
 * teaches the rule.
 */
export function AddRenfortSheet({
  candidates,
  teamLabel,
  lineUpFull,
  isEligible,
  availabilityOf,
  teamNameOf,
  onPick,
  onClose,
}: {
  /** Club players not already on the roster or in the line-up. */
  candidates: Player[]
  teamLabel: string
  /** The line-up already has its full complement — adding will exceed it. */
  lineUpFull?: boolean
  isEligible: (playerId: string) => boolean
  availabilityOf: (playerId: string) => AvailabilityStatus | undefined
  /** The player's own team this phase, if any. */
  teamNameOf: (playerId: string) => string | undefined
  onPick: (playerId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q
      ? candidates.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      : candidates
    // Eligible first: the ineligible ones are there to explain themselves, not
    // to be scrolled past on the way to a usable name.
    const sorted = sortByName(matching)
    return [...sorted.filter((p) => isEligible(p.id)), ...sorted.filter((p) => !isEligible(p.id))]
  }, [candidates, query, isEligible])

  return (
    <ModalShell onClose={onClose} closeOnBackdrop labelledBy="renfort-title" z={40}>
      <div className="rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="border-b border-slate-100 px-4 pt-4 pb-3">
          <h2 id="renfort-title" className="font-display text-lg font-semibold text-slate-800">
            Ajouter un renfort
          </h2>
          <p className="mt-1 text-sm text-slate-500">Pour {teamLabel}</p>
          {/* Adding is still allowed — the model tolerates an over-full
              line-up and the desktop matrix always has, and a captain often
              adds before removing. Saying so beats a count that quietly turns
              red after the fact. */}
          {lineUpFull && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La composition est déjà complète. Ajouter un renfort la fera dépasser : pensez à
              retirer un joueur.
            </p>
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom…"
            aria-label="Rechercher un joueur"
            className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0"
          />
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            {candidates.length === 0
              ? 'Tous les joueurs du club sont déjà dans cette composition.'
              : 'Aucun joueur à ce nom.'}
          </p>
        ) : (
          <ul>
            {shown.map((player) => {
              const eligible = isEligible(player.id)
              const status = availabilityOf(player.id)
              const ownTeam = teamNameOf(player.id)
              return (
                <li key={player.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    disabled={!eligible}
                    onClick={() => onPick(player.id)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-white"
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate font-medium ${eligible ? 'text-slate-800' : 'text-slate-400'}`}
                      >
                        {player.firstName} {player.lastName}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        {ownTeam && <span>{ownTeam}</span>}
                        {status && (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: AVAILABILITY_COLORS[status] }}
                              aria-hidden
                            />
                            {AVAILABILITY_LABELS[status]}
                          </span>
                        )}
                      </span>
                    </span>
                    {eligible ? (
                      <span className="shrink-0 text-sm font-medium text-accent-600">Ajouter</span>
                    ) : (
                      <span
                        className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        title="Ce joueur a déjà joué dans une équipe supérieure : le brûlage l'empêche de descendre."
                      >
                        Brûlage
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className={`w-full ${NEUTRAL_BUTTON_CLASS}`}>
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
