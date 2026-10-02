import { Link } from 'react-router-dom'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { LicenceBadge } from '@/components/LicenceBadge'
import {
  selectionVerdict,
  type PhaseAvailabilityColumn,
  type PhaseAvailabilityGrid,
} from '@/lib/phaseAvailability'
import type { AvailabilityStatus } from '@/types'

// ---------------------------------------------------------------------------
// Les disponibilités de toute la phase, pour une équipe (#623)
//
// Players down, the team's matches across, and two counts after each name —
// «5/7» answered yes, «3/7» on a line-up: the planning a captain draws up for
// the phase. Under them, per journée, how many said yes and how many the
// line-up names. Same grid as the app's `team/disponibilites` screen, from the
// same derivation.
//
// Name and counts are sticky: on a phone the journées scroll sideways under
// them, so a row never loses whose it is. Turned sideways, a phase of seven
// fits, which is what the hint below `sm:` says.
// ---------------------------------------------------------------------------

// The OUI / PE / NON palette of `Availability.tsx`, as a filled cell.
const CELL: Record<AvailabilityStatus, { short: string; label: string; cls: string }> = {
  available: { short: 'OUI', label: 'Oui', cls: 'bg-green-50 text-green-700' },
  maybe: { short: 'PE', label: 'Peut-être', cls: 'bg-amber-50 text-amber-700' },
  unavailable: { short: 'NON', label: 'Non', cls: 'bg-accent-50 text-accent-600' },
}

const TOTAL_LABEL_CLASS =
  'sticky left-0 z-10 border-r !border-r-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5'

/** Past this many journées, a phone standing up scrolls. */
const PORTRAIT_FITS = 4

export function PhaseAvailabilitySection({
  grid,
  columns,
  required,
  unlicensed,
  onGame,
}: {
  grid: PhaseAvailabilityGrid
  columns: PhaseAvailabilityColumn[]
  /** Players the division fields per match — what both totals are read against. */
  required: number
  unlicensed: Set<string>
  onGame: (gameId: string) => void
}) {
  if (grid.rows.length === 0 || columns.length === 0) return null
  const total = columns.length

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Disponibilités de la phase
        </h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500" aria-label="Légende">
          {(Object.keys(CELL) as AvailabilityStatus[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CELL[k].cls}`}>{CELL[k].short}</span>
              {CELL[k].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-4 w-6 rounded bg-slate-50 ring-2 ring-inset ring-slate-800" />
            Dans la composition
          </li>
        </ul>
      </div>

      {total > PORTRAIT_FITS && (
        <p className="px-5 pb-3 text-xs text-slate-500 sm:hidden">
          Tournez le téléphone pour voir toute la phase.
        </p>
      )}

      <div className="overflow-x-auto">
        {/* `border-separate`, not `border-collapse`: collapsed borders leave
            a pixel beside a sticky cell that the scrolled journées show
            through. Row rules are therefore drawn on the cells. */}
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 [&>th]:border-y [&>th]:border-slate-200">
              <th className="sticky left-0 z-10 w-32 min-w-32 bg-slate-50 px-3 py-2 text-left font-semibold uppercase tracking-wide sm:w-48 sm:min-w-48 sm:px-5">
                Joueur
              </th>
              <th className="sticky left-32 z-10 w-12 min-w-12 bg-slate-50 py-2 text-center font-semibold uppercase tracking-wide sm:left-48">
                Oui
              </th>
              <th className="sticky left-44 z-10 w-12 min-w-12 border-r bg-slate-50 py-2 text-center font-semibold uppercase tracking-wide sm:left-60">
                <abbr title="Sélectionné" className="no-underline">Sél.</abbr>
              </th>
              {columns.map((c) => (
                <th key={c.gameId} className="min-w-12 px-1 py-1 font-normal">
                  <button
                    type="button"
                    onClick={() => onGame(c.gameId)}
                    className="flex min-h-11 w-full flex-col items-center justify-center rounded-md hover:bg-slate-100 md:min-h-0 md:py-1"
                    aria-label={`Journée ${c.number}, le ${c.date}`}
                  >
                    <span className="text-xs font-semibold text-slate-800">J{c.number}</span>
                    <span className="text-[11px] text-slate-500">{c.date}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.player.id} className="[&>*]:border-b [&>*]:border-slate-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-32 min-w-32 max-w-32 bg-white px-3 py-1.5 text-left font-normal sm:w-48 sm:min-w-48 sm:max-w-48 sm:px-5"
                >
                  <Link
                    to={`/joueurs/${row.player.id}`}
                    className={`block truncate text-slate-800 hover:text-accent-600 ${TEXT_TARGET_CLASS}`}
                  >
                    {/* The initial on a phone: the surname is what tells two apart. */}
                    <span className="sm:hidden">
                      {`${row.player.firstName.charAt(0)}. ${row.player.lastName}`}
                    </span>
                    <span className="hidden sm:inline">
                      {`${row.player.firstName} ${row.player.lastName}`}
                    </span>
                  </Link>
                  {unlicensed.has(row.player.id) && <LicenceBadge />}
                </th>
                {/* A renfort is listed because a line-up names them; the
                    column says why it has no «Oui» total instead of giving one. */}
                <td className="sticky left-32 z-10 bg-white text-center font-semibold text-slate-800 sm:left-48">
                  {row.available === null ? (
                    <abbr title="Renfort" className="text-xs font-medium text-slate-500 no-underline">
                      Renf.
                    </abbr>
                  ) : (
                    `${row.available}/${total}`
                  )}
                </td>
                {/* Played-for is the second question; the one asked is availability. */}
                <td className="sticky left-44 z-10 border-r !border-r-slate-200 bg-white text-center font-semibold text-slate-500 sm:left-60">
                  {row.selected}/{total}
                </td>
                {row.cells.map((cell) => {
                  const v = cell.status ? CELL[cell.status] : undefined
                  return (
                    <td key={cell.gameId} className="px-1 py-1.5">
                      <span
                        className={`flex h-8 items-center justify-center rounded-md text-[11px] font-semibold ${
                          v ? v.cls : 'bg-slate-50 text-slate-300'
                        } ${cell.selected ? 'ring-2 ring-inset ring-slate-800' : ''}`}
                        aria-label={(v ? v.label : 'Sans réponse') + (cell.selected ? ', dans la composition' : '')}
                      >
                        {v ? v.short : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <th colSpan={3} scope="row" className={TOTAL_LABEL_CLASS}>
                Disponibles
              </th>
              {grid.availableByGame.map((n, i) => (
                <td
                  key={columns[i]?.gameId ?? i}
                  className={`py-2 text-center font-semibold ${n >= required ? 'text-green-700' : 'text-accent-600'}`}
                >
                  {n}
                </td>
              ))}
            </tr>
            <tr className="bg-slate-50 [&>*]:border-t [&>*]:border-slate-100">
              <th colSpan={3} scope="row" className={TOTAL_LABEL_CLASS}>
                Sélectionnés
              </th>
              {grid.selectedByGame.map((n, i) => {
                const verdict = selectionVerdict(n, required)
                return (
                  <td
                    key={columns[i]?.gameId ?? i}
                    className={`py-2 text-center font-semibold ${
                      verdict === 'ok' ? 'text-green-700' : verdict === 'off' ? 'text-accent-600' : 'text-slate-400'
                    }`}
                  >
                    {n}/{required}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
