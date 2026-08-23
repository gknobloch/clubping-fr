import { Link } from 'react-router-dom'
import { ChevronRightIcon, HomeIcon, AwayIcon } from '@/components/icons'
import { MatchDate } from '@/components/MatchDate'
import type { Game, MatchDay, Team } from '@/types'

export interface MatchDayCardEntry {
  team: Team
  game: Game
  matchDay: MatchDay
  opponentName: string
  /** Own team name, for the "Rixheim PPA 5 – Kembs TT 3" line. */
  teamName: string
  divisionName?: string
  /** The signed-in player is on this team — shown first and called out. */
  isMine?: boolean
  isHome: boolean
  dateLabel: string
  /** False while the receiving club's playing day is unknown (#429). */
  confirmed: boolean
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
      {entries.map(({ team, game, matchDay, teamName, divisionName, isMine, opponentName, isHome, dateLabel, confirmed, time, availableCount, selectedCount, playersPerGame }) => {
        const short = selectedCount < playersPerGame || availableCount < playersPerGame
        const matchup = isHome ? `${teamName} – ${opponentName}` : `${opponentName} – ${teamName}`
        return (
          <li key={`${game.id}-${team.id}`}>
            <Link
              to={`/journees/${game.id}?equipe=${team.id}`}
              className={`flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm hover:bg-accent-50/40 ${
                isMine ? 'border-accent-500' : 'border-slate-200 hover:border-accent-300'
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* Pill row, as in the native app: which round, which division,
                    which of the club's teams — the three things that tell you
                    whose match this is at a glance. */}
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    J{matchDay.number}
                  </span>
                  {divisionName && (
                    <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {divisionName}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                    {team.color && (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: team.color }}
                        aria-hidden
                      />
                    )}
                    Équipe {team.number}
                  </span>
                  {isMine && (
                    <span className="rounded-md border border-accent-300 bg-accent-50 px-1.5 py-0.5 text-[11px] font-semibold text-accent-700">
                      Mon équipe
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="shrink-0 text-slate-400">
                    {isHome ? <HomeIcon /> : <AwayIcon />}
                  </span>
                  <span className="truncate font-medium text-slate-800">{matchup}</span>
                </span>
                <span className="text-xs text-slate-500">
                  <MatchDate label={dateLabel} confirmed={confirmed} />
                  {time ? ` · ${time}` : ''}
                </span>
                <span className={`text-xs ${short ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                  {availableCount} dispo · Compo {selectedCount}/{playersPerGame}
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
