import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { LicenceBadge } from '@/components/LicenceBadge'
import {
  selectionVerdict,
  type PhaseAvailabilityColumn,
  type PhaseAvailabilityGrid,
} from '@/lib/phaseAvailability'
import type { AvailabilityStatus, Player } from '@/types'

// ---------------------------------------------------------------------------
// Les disponibilités de toute la phase, pour une équipe (#623)
//
// Players down, the team's matches across, and two counts after each name —
// «5/7» answered yes, «3/7» on a line-up: the planning a captain draws up for
// the phase. Then one Renforts row, whoever and however many: per journée, the
// faces of the borrowed players its line-up names, their names a click away.
// Under them, per journée, how many of the roster said yes and how many the
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
  // One popover at a time, keyed on its match.
  const [openRenforts, setOpenRenforts] = useState<string | null>(null)
  if (grid.rows.length === 0 || columns.length === 0) return null
  const total = columns.length

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Disponibilités de la phase
        </h2>
        {/* OUI / PE / NON need no key — they are the app's own answers,
            everywhere. The frame is this grid's alone. */}
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-4 w-6 rounded bg-slate-50 ring-2 ring-inset ring-slate-800" aria-hidden="true" />
          Dans la composition
        </p>
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
                // 2px a side, not 4: a column is 48px below `sm:`, and the
                // button inside has to keep the 44 a finger needs (#372).
                <th key={c.gameId} className="min-w-12 px-0.5 py-1 font-normal">
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
                  {/* The whole cell is the link: «E. Lotz» alone is 41px, and
                      a target is 44 (#372). */}
                  <Link
                    to={`/joueurs/${row.player.id}`}
                    className={`w-full min-w-0 text-slate-800 hover:text-accent-600 ${TEXT_TARGET_CLASS}`}
                  >
                    {/* The initial on a phone: the surname is what tells two apart. */}
                    <span className="truncate sm:hidden">
                      {`${row.player.firstName.charAt(0)}. ${row.player.lastName}`}
                    </span>
                    <span className="hidden truncate sm:inline">
                      {`${row.player.firstName} ${row.player.lastName}`}
                    </span>
                  </Link>
                  {unlicensed.has(row.player.id) && <LicenceBadge />}
                </th>
                <td className="sticky left-32 z-10 bg-white text-center font-semibold text-slate-800 sm:left-48">
                  {row.available}/{total}
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
            {grid.renfortGames > 0 && (
              <tr className="[&>*]:border-b [&>*]:border-slate-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium text-slate-500 sm:px-5"
                >
                  Renforts
                </th>
                {/* No «Oui» total: how much of this team's phase a borrowed
                    player could play is nobody's question. */}
                <td className="sticky left-32 z-10 bg-white sm:left-48" />
                <td className="sticky left-44 z-10 border-r !border-r-slate-200 bg-white text-center font-semibold text-slate-500 sm:left-60">
                  {grid.renfortGames}/{total}
                </td>
                {grid.renforts.map((list, i) => (
                  <td key={columns[i]?.gameId ?? i} className="px-0.5 py-1.5">
                    {list.length > 0 && (
                      <RenfortsCell
                        title={`Renforts · J${columns[i].number}`}
                        renforts={list}
                        open={openRenforts === columns[i].gameId}
                        onToggle={() =>
                          setOpenRenforts((cur) => (cur === columns[i].gameId ? null : columns[i].gameId))
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
            )}
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

/** Past this many, the stack says «+N» rather than growing past its column. */
const STACKED_AVATARS = 2

const POPOVER_WIDTH = 240
const POPOVER_MARGIN = 8

/**
 * One match's renforts as a stack of faces, and their names in a popover that
 * opens *upward* — the row sits on the totals.
 *
 * The popover is `fixed`, placed from the cell's own rectangle and kept inside
 * the viewport: positioned within the cell it was clipped by the scroller as
 * soon as the cell sat near its right edge, which on a phone is most of them.
 * Fixed, it would drift off its cell on a scroll, so a scroll closes it.
 */
function RenfortsCell({
  title,
  renforts,
  open,
  onToggle,
}: {
  title: string
  renforts: Player[]
  open: boolean
  onToggle: () => void
}) {
  const shown = renforts.slice(0, STACKED_AVATARS)
  const more = renforts.length - shown.length
  const names = renforts.map((p) => `${p.firstName} ${p.lastName}`).join(', ')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // The caller's toggle is a fresh function each render; the effect below is
  // about opening, not about that, so it reads the latest through a ref.
  const toggleRef = useRef(onToggle)
  toggleRef.current = onToggle

  useEffect(() => {
    if (!open) return
    setRect(buttonRef.current?.getBoundingClientRect() ?? null)
    const close = () => toggleRef.current()
    // Capture: the table's own scroller does not bubble its scroll to window.
    window.addEventListener('scroll', close, { capture: true, once: true })
    return () => window.removeEventListener('scroll', close, { capture: true })
  }, [open])

  const left = rect
    ? Math.max(
        POPOVER_MARGIN,
        Math.min(window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      )
    : undefined

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Renforts : ${names}`}
        className="group flex min-h-11 w-full items-center justify-center md:min-h-8"
      >
        {/* Framed like any cell of the line-up: a renfort is only listed
            because the line-up names them. */}
        <span className="flex h-8 w-full items-center justify-center rounded-md bg-slate-50 ring-2 ring-inset ring-slate-800 group-hover:bg-slate-100">
          {shown.map((p, i) => (
            <span key={p.id} className={`rounded-full ring-2 ring-slate-50 ${i > 0 ? '-ml-2' : ''}`}>
              <Avatar
                playerId={p.id}
                avatarUpdatedAt={p.avatarUpdatedAt}
                firstName={p.firstName}
                lastName={p.lastName}
                size={22}
              />
            </span>
          ))}
          {more > 0 && <span className="ml-1 text-xs font-semibold text-slate-500">+{more}</span>}
        </span>
      </button>
      {open && (
        <>
          {/* Anywhere else closes it. Fixed, so the scroller does not clip it. */}
          <button
            type="button"
            aria-label="Fermer"
            className="fixed inset-0 z-20 cursor-default"
            onClick={onToggle}
          />
          <div
            role="dialog"
            aria-label={title}
            className="fixed z-30 -translate-y-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
            style={{ width: POPOVER_WIDTH, left, top: rect ? rect.top - 4 : undefined }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <ul className="mt-2 space-y-1.5">
              {renforts.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Avatar
                    playerId={p.id}
                    avatarUpdatedAt={p.avatarUpdatedAt}
                    firstName={p.firstName}
                    lastName={p.lastName}
                    size={28}
                  />
                  <Link
                    to={`/joueurs/${p.id}`}
                    className={`min-w-0 flex-1 text-sm text-slate-800 hover:text-accent-600 ${TEXT_TARGET_CLASS}`}
                  >
                    <span className="truncate">
                      {p.firstName} {p.lastName}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
