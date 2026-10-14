import { useState } from 'react'
import { formatRankingShort } from '@/lib/ranking'
import { placeBestRanked, reservedLine, reservedLineNote, sheetLetters, sheetOrderRefusal, type SheetSide } from '@/lib/matchSheet'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS } from '@/components/Button'

export interface MatchSheetPlayer {
  id: string
  firstName: string
  lastName: string
  license?: string
  /** Phase points, from this team's roster or the player's own team. */
  points?: string
}

/**
 * Read-only aid for filling the official FFTT match sheet at the table (#383),
 * mirroring the native app's MatchSheet: club identity, then the line-up with
 * each player's position letter, licence and phase points.
 *
 * The letters are the federation's (`src/lib/matchSheet.ts`): A, B, C, D /
 * W, X, Y, Z at the FFTT, A, B, C, D / U, V, W, X at the AGR — a toggle
 * between the two sides rather than a guess, and the letter follows the row,
 * not the player. At the AGR, four a side, the best ranked holds A or V
 * (#650): the sheet opens with them there and refuses a move that would put
 * anyone else there, saying why.
 *
 * Nothing here is written. The order is a convenience for copying onto paper,
 * which is why it resets on close and why the sheet says so.
 */
export function MatchSheetView({
  matchup,
  clubName,
  affiliationNumber,
  players,
  /** Home side defaults to A..; the visiting side to ..Z. */
  isHome = true,
  federationId,
  onClose,
}: {
  matchup: string
  clubName: string
  affiliationNumber?: string
  players: MatchSheetPlayer[]
  isHome?: boolean
  /** Whose ranking the values are: « 1731 pts », or « 45 » at the AGR (#646, #735). */
  federationId?: string
  onClose: () => void
}) {
  const [side, setSide] = useState<SheetSide>(isHome ? 'home' : 'away')
  const [order, setOrder] = useState(() => placeBestRanked(players, federationId, isHome ? 'home' : 'away'))
  const [refusal, setRefusal] = useState<string | null>(null)

  const n = order.length
  const homeSet = sheetLetters(federationId, n, 'home')
  const awaySet = sheetLetters(federationId, n, 'away')
  const letters = side === 'home' ? homeSet : awaySet
  const reserved = reservedLine(federationId, n, side)
  const note = reservedLineNote(federationId, n)

  // The other side has its own reserved line: switching re-places the best
  // ranked there rather than refusing the order the sheet itself set up.
  const changeSide = (next: SheetSide) => {
    setSide(next)
    setOrder((prev) => placeBestRanked(prev, federationId, next))
    setRefusal(null)
  }

  // Buttons rather than the app's drag: a dependable touch drag is a lot of
  // code for an occasional gesture and leaves keyboard users out, and moving a
  // row by one is already how /divisions reorders (#383).
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    const next = order.slice()
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    const why = sheetOrderRefusal(next, federationId, side)
    setRefusal(why)
    if (!why) setOrder(next)
  }

  const toggleClass = (active: boolean) =>
    `min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold md:min-h-0 md:py-1 ${
      active ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  return (
    <ModalShell onClose={onClose} closeOnBackdrop labelledBy="match-sheet-title" z={40}>
      <div className="rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="border-b border-slate-100 px-4 pt-4 pb-3">
          <h2 id="match-sheet-title" className="font-display text-lg font-semibold text-slate-800">
            Feuille de match
          </h2>
          <p className="mt-1 text-sm text-slate-600">{matchup}</p>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Club</p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Nom</dt>
              <dd className="truncate font-medium text-slate-800">{clubName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">N° club</dt>
              <dd className="font-medium text-slate-800">{affiliationNumber || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Joueurs ({n})
            </p>
            {n > 0 && (
              <div className="flex w-40 gap-1" role="group" aria-label="Jeu de lettres">
                <button type="button" onClick={() => changeSide('home')} className={toggleClass(side === 'home')}>
                  {homeSet.join('')}
                </button>
                <button type="button" onClick={() => changeSide('away')} className={toggleClass(side === 'away')}>
                  {awaySet.join('')}
                </button>
              </div>
            )}
          </div>

          {n === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Aucun joueur sélectionné. Composez l'équipe pour remplir la feuille.
            </p>
          ) : (
            <>
              <ul className="mt-2">
                {order.map((player, i) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <span
                      className={`w-5 shrink-0 text-center font-display text-base font-bold ${i === reserved ? 'rounded bg-accent-50 text-accent-700' : 'text-accent-600'}`}
                    >
                      {letters[i]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{player.firstName}</span>
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {player.lastName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      {/* `||`, not `??`: unset points come through as '' from
                          the roster, which `??` would happily render. */}
                      <span className="block font-mono">{player.license || '—'}</span>
                      <span className="block">{formatRankingShort(player.points, federationId)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        aria-label={`Monter ${player.firstName} ${player.lastName}`}
                        className="flex h-6 w-8 items-center justify-center text-slate-400 hover:text-slate-700 disabled:text-slate-200"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, i + 1)}
                        disabled={i === order.length - 1}
                        aria-label={`Descendre ${player.firstName} ${player.lastName}`}
                        className="flex h-6 w-8 items-center justify-center text-slate-400 hover:text-slate-700 disabled:text-slate-200"
                      >
                        ▼
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {refusal && <p role="alert" className="mt-3 text-sm text-red-600">{refusal}</p>}
              {note && <p className="mt-3 text-xs text-slate-600">{note}</p>}
              <p className="mt-3 text-xs text-slate-500">
                L'ordre est indicatif et n'est pas enregistré.
              </p>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className={`w-full ${NEUTRAL_BUTTON_CLASS}`}>
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
