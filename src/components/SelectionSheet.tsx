import { useMemo, useState } from 'react'
import { SelectionPanel, SelectionRow, SelectionSectionLabel } from '@/components/SelectionPanel'
import { AVAILABILITY_COLORS, AVAILABILITY_LABELS } from '@/components/availabilityControls'
import { sortByName } from '@/lib/sortByName'
import {
  PLAYER_SEARCH_LABEL,
  PLAYER_SEARCH_THRESHOLD,
  filterPlayersBySearch,
} from '@/lib/playerSearch'
import { selectablePlayers } from '@/lib/playerVisibility'
import { LicenceBadge } from '@/components/LicenceBadge'
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
  /** Those the federation has not listed a licence for this season (#488). */
  unlicensed,
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
  unlicensed?: ReadonlySet<string>
  onSave: (playerIds: string[]) => void
  onClose: () => void
}) {
  const [selection, setSelection] = useState<string[]>(initialSelection)
  const [limitHit, setLimitHit] = useState(false)
  const [query, setQuery] = useState('')

  const full = selection.length >= playersPerGame

  // Named, not counted: a captain needs to know *who* to check on, and the
  // sheet is where the mistake would be made (#488).
  const pickedUnlicensed = useMemo(() => {
    if (!unlicensed?.size) return []
    return [...roster, ...others]
      .filter((p) => selection.includes(p.id) && unlicensed.has(p.id))
      .map((p) => `${p.firstName} ${p.lastName}`)
  }, [selection, roster, others, unlicensed])

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

  // The callers already keep archived players out of `others`; the roster is
  // the team's own list, where one may have been archived since (#454). Kept
  // when already picked, so a stale name can still be removed.
  const sortedRoster = useMemo(
    () => sortByName(selectablePlayers(roster, initialSelection)),
    [roster, initialSelection],
  )
  const sortedOthers = useMemo(() => sortByName(others), [others])

  // Past a dozen names this stops being a list you read (#454). Counted over
  // the whole sheet rather than one section: it is the scrolling that hurts.
  const searchable = sortedRoster.length + sortedOthers.length > PLAYER_SEARCH_THRESHOLD
  const shownRoster = searchable ? filterPlayersBySearch(sortedRoster, query) : sortedRoster
  const shownOthers = searchable ? filterPlayersBySearch(sortedOthers, query) : sortedOthers
  const noMatch = searchable && query.trim() !== '' && shownRoster.length + shownOthers.length === 0

  const row = (player: Player) => {
    const picked = selection.includes(player.id)
    const lockedTeam = picked ? undefined : committedElsewhere.get(player.id)
    const locked = lockedTeam !== undefined
    const status = availabilityOf(player.id)
    return (
      <SelectionRow
        key={player.id}
        picked={picked}
        disabled={locked}
        dimmed={locked}
        onToggle={() => toggle(player.id)}
        label={`${player.firstName} ${player.lastName}`}
        badge={unlicensed?.has(player.id) && <LicenceBadge />}
        trailing={
          locked ? (
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
          )
        }
      />
    )
  }

  return (
    <SelectionPanel
      titleId="selection-title"
      title={<>Sélection — {teamLabel} ({selection.length}/{playersPerGame})</>}
      header={
        <>
          {pickedUnlicensed.length > 0 && (
            <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {pickedUnlicensed.length === 1
                ? `${pickedUnlicensed[0]} n’a pas de licence validée pour cette saison à la FFTT.`
                : `${pickedUnlicensed.length} joueurs alignés n’ont pas de licence validée pour cette saison à la FFTT : ${pickedUnlicensed.join(', ')}.`}
              {' '}Vérifiez avant la rencontre.
            </p>
          )}
          {limitHit && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Maximum {playersPerGame} joueurs par match. Retirez un joueur avant d’en ajouter un
              autre.
            </p>
          )}
        </>
      }
      search={searchable
        ? { id: 'selection-search', label: PLAYER_SEARCH_LABEL, value: query, onChange: setQuery }
        : undefined}
      onCancel={onClose}
      onSave={() => {
        onSave(selection)
        onClose()
      }}
      footer={full && (
        <p className="px-4 pb-4 text-center text-xs text-slate-500">Composition complète.</p>
      )}
    >
      {/* Without a query the header shows even on an empty roster, as it always
          has; while filtering an empty section is just noise. */}
      {(shownRoster.length > 0 || query.trim() === '') && (
        <>
          <SelectionSectionLabel first>Cette équipe</SelectionSectionLabel>
          <ul>{shownRoster.map(row)}</ul>
        </>
      )}

      {shownOthers.length > 0 && (
        <>
          <SelectionSectionLabel>Autres joueurs</SelectionSectionLabel>
          <ul>{shownOthers.map(row)}</ul>
        </>
      )}

      {noMatch && (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Aucun joueur ne correspond à « {query.trim()} ».
        </p>
      )}
    </SelectionPanel>
  )
}
