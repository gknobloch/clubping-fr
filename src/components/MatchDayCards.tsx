import { Link } from 'react-router-dom'
import type { Game, MatchDay, Team } from '@/types'

export interface MatchDayCardEntry {
  team: Team
  game: Game
  matchDay: MatchDay
  opponentName: string
  isHome: boolean
  dateLabel: string
  time?: string
  availableCount: number
  selectedCount: number
  playersPerGame: number
}

/**
 * Mobile view of a journée: one card per club team, tapping through to the
 * match detail. Replaces the matrix below `md:` — 14 columns and 964px cannot
 * be made to fit a 375px screen, and shrinking them would only make the matrix
 * unreadable (#306). Mirrors the native app's Journées list.
 */
export function MatchDayCards({ entries }: { entries: MatchDayCardEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Aucun match cette journée.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map(({ team, game, opponentName, isHome, dateLabel, time, availableCount, selectedCount, playersPerGame }) => {
        const short = selectedCount < playersPerGame || availableCount < playersPerGame
        return (
          <li key={`${game.id}-${team.id}`}>
            <Link
              to={`/journees/${game.id}?equipe=${team.id}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-accent-300 hover:bg-accent-50/40"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  {team.color && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate font-medium text-slate-800">
                    Équipe {team.number}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {isHome ? 'reçoit' : 'se déplace'}
                  </span>
                </span>
                <span className="truncate text-sm text-slate-600">{opponentName}</span>
                <span className="text-xs text-slate-500">
                  {dateLabel}
                  {time ? ` · ${time}` : ''}
                </span>
                <span className={`text-xs ${short ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                  {availableCount} dispo · Compo {selectedCount}/{playersPerGame}
                </span>
              </span>
              <svg
                className="h-5 w-5 shrink-0 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
