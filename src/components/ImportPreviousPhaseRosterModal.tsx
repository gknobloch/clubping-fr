import { useState } from 'react'
import type { Club, Phase, Player, Team } from '@/types'
import { ModalShell } from '@/components/ModalShell'
import { sortByName } from '@/lib/sortByName'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

interface ImportPreviousPhaseRosterModalProps {
  onClose: () => void
  club: Club
  previousPhase: Phase
  /** The club's non-archived teams in the previous phase. */
  sourceTeams: Team[]
  players: Player[]
  /** Number of the team being edited — used to preselect a same-number source team. */
  defaultTeamNumber: number
  /** Player ids already on the team being edited. */
  currentPlayerIds: string[]
  /** Player ids already on another team in the *current* phase — can't be added. */
  playerIdsInOtherTeams: Set<string>
  onConfirm: (patch: { captainId?: string; addPlayerIds: string[]; whatsappLink?: string; color?: string }) => void
}

/**
 * Lets an admin carry roster info over from a team in the previous phase
 * (#229 follow-up). Team numbers aren't guaranteed to line up between phases
 * (a club can renumber teams), so the source team defaults to a same-number
 * match but stays fully overridable; every field (captain, each player,
 * WhatsApp link) is opt-in and re-verified against the current phase before
 * being offered.
 */
export function ImportPreviousPhaseRosterModal({
  onClose, club, previousPhase, sourceTeams, players, defaultTeamNumber,
  currentPlayerIds, playerIdsInOtherTeams, onConfirm,
}: ImportPreviousPhaseRosterModalProps) {
  const sortedSourceTeams = [...sourceTeams].sort((a, b) => a.number - b.number)
  const [sourceTeamId, setSourceTeamId] = useState(
    sortedSourceTeams.find((t) => t.number === defaultTeamNumber)?.id ?? sortedSourceTeams[0]?.id ?? '',
  )
  const sourceTeam = sourceTeams.find((t) => t.id === sourceTeamId)

  const playerById = new Map(players.map((p) => [p.id, p]))
  const playerName = (id: string) => {
    const p = playerById.get(id)
    return p ? `${p.firstName} ${p.lastName}` : id
  }

  const importableFrom = (team: Team | undefined) =>
    (team?.playerIds ?? []).filter((pid) => !currentPlayerIds.includes(pid) && !playerIdsInOtherTeams.has(pid))

  const [selectedPlayerIds, setSelectedPlayerIds] = useState(() => new Set(importableFrom(sourceTeam)))
  const [importCaptain, setImportCaptain] = useState(true)
  const [importWhatsapp, setImportWhatsapp] = useState(true)
  const [importColor, setImportColor] = useState(true)

  const selectSourceTeam = (id: string) => {
    setSourceTeamId(id)
    setSelectedPlayerIds(new Set(importableFrom(sourceTeams.find((t) => t.id === id))))
    setImportCaptain(true)
    setImportWhatsapp(true)
    setImportColor(true)
  }

  const sourceRoster = sourceTeam
    ? sortByName((sourceTeam.playerIds ?? []).map((id) => playerById.get(id)).filter((p): p is Player => !!p))
    : []

  // The captain can only be carried over if they end up on the roster —
  // either newly imported or already on the team being edited.
  const captainEligible = !!sourceTeam?.captainId &&
    (selectedPlayerIds.has(sourceTeam.captainId) || currentPlayerIds.includes(sourceTeam.captainId))

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  const handleConfirm = () => {
    onConfirm({
      captainId: importCaptain && captainEligible ? sourceTeam!.captainId : undefined,
      addPlayerIds: [...selectedPlayerIds],
      whatsappLink: importWhatsapp && sourceTeam?.whatsappLink ? sourceTeam.whatsappLink : undefined,
      color: importColor && sourceTeam?.color ? sourceTeam.color : undefined,
    })
  }

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-prev-phase-title"
      z={40}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-prev-phase-title" className="font-display text-lg font-semibold text-slate-800">
          Importer depuis la phase précédente
        </h2>
        <p className="mt-1 text-sm text-slate-500">{previousPhase.displayName}</p>

        <div className="mt-4">
          <label htmlFor="import-prev-source-team" className="block text-sm font-medium text-slate-700">
            Équipe source
          </label>
          <select
            id="import-prev-source-team"
            value={sourceTeamId}
            onChange={(e) => selectSourceTeam(e.target.value)}
            className={inputClass}
          >
            {sortedSourceTeams.map((t) => (
              <option key={t.id} value={t.id}>{club.displayName} {t.number}</option>
            ))}
          </select>
        </div>

        {sourceTeam && (
          <div className="mt-4 space-y-4">
            {sourceTeam.captainId && (
              <label className={`flex items-center gap-2 ${captainEligible ? '' : 'opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={importCaptain && captainEligible}
                  disabled={!captainEligible}
                  onChange={(e) => setImportCaptain(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">
                  Capitaine : <span className="font-medium">{playerName(sourceTeam.captainId)}</span>
                </span>
              </label>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Joueurs ({sourceRoster.length})</p>
              {sourceRoster.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun joueur dans cette équipe.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {sourceRoster.map((p) => {
                    const alreadyHere = currentPlayerIds.includes(p.id)
                    const usedElsewhere = !alreadyHere && playerIdsInOtherTeams.has(p.id)
                    const disabled = alreadyHere || usedElsewhere
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!disabled && selectedPlayerIds.has(p.id)}
                            disabled={disabled}
                            onChange={(e) =>
                              setSelectedPlayerIds((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(p.id)
                                else next.delete(p.id)
                                return next
                              })
                            }
                            className="rounded border-slate-300"
                          />
                          <span className={disabled ? 'text-slate-400' : 'text-slate-800'}>
                            {p.firstName} {p.lastName}
                          </span>
                        </label>
                        {alreadyHere && <span className="text-xs text-slate-400">Déjà dans l’équipe</span>}
                        {usedElsewhere && <span className="text-xs text-amber-600">Déjà dans une autre équipe</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {sourceTeam.whatsappLink && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={importWhatsapp}
                  onChange={(e) => setImportWhatsapp(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Groupe WhatsApp</span>
              </label>
            )}

            {sourceTeam.color && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={importColor}
                  onChange={(e) => setImportColor(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Couleur</span>
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-slate-300"
                  style={{ backgroundColor: sourceTeam.color }}
                  aria-hidden="true"
                />
              </label>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={NEUTRAL_BUTTON_CLASS}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!sourceTeam}
            className={PRIMARY_BUTTON_CLASS}
          >
            Importer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
