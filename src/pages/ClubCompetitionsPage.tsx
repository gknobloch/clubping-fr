import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { PageHeader } from '@/components/PageHeader'
import { CompetitionMatrix } from '@/components/CompetitionMatrix'
import { ClubCompetitions } from '@/components/ClubCompetitions'

/**
 * A club's own competitions screen (#482).
 *
 * It used to be a section at the bottom of /club, under the addresses and the
 * channels, where a club admin had no reason to scroll. Eligibility is not part
 * of a club's identity card — it is a thing you come to manage — so it gets its
 * own place in the navigation.
 *
 * Two shapes for one question. On a desktop the whole club and every
 * competition fit in one grid, and the question a club admin actually has is
 * comparative: who is missing from the youth championship, who did we add to
 * the veterans. Below `md:` that grid is unreadable, so the per-competition
 * list takes over — the same trade the journées screen already makes.
 */
export function ClubCompetitionsPage() {
  const { user } = useAuth()
  const { clubs, players, competitions, competitionEligibilities, setCompetitionEligibility } = useAppData()

  const clubId = user?.clubId ?? null
  const club = clubId ? clubs.find((c) => c.id === clubId) ?? null : null
  const canManage = user?.role === 'club_admin'

  const active = useMemo(
    () => competitions.filter((c) => !c.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [competitions],
  )
  const clubPlayers = useMemo(
    () => players.filter((p) => p.clubId === clubId && p.status === 'active'),
    [players, clubId],
  )
  // This club's amendments only: GET /api/data carries every club's, and one
  // club's exception must not decide another's grid.
  const overrides = useMemo(
    () => competitionEligibilities.filter((e) => e.clubId === clubId),
    [competitionEligibilities, clubId],
  )

  if (!clubId) return <Navigate to="/" replace />
  if (!club) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-600">Club introuvable.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Compétitions" club={{ id: club.id, displayName: club.displayName }} />

      {active.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">
            Aucune compétition n'est définie. Tous les licenciés du club restent proposés partout.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Chaque compétition admet certaines catégories par défaut. Vous pouvez ajouter un
            licencié qu'elle écarte, ou en retirer un qu'elle admet — sauf sur une compétition
            réservée, où vous ne pouvez que retirer.
          </p>

          {/* Desktop: the grid. Below md: the per-competition list. */}
          <div className="hidden md:block">
            <CompetitionMatrix
              players={clubPlayers}
              competitions={active}
              overrides={overrides}
              canManage={canManage}
              onSet={(competitionId, playerId, effect) =>
                setCompetitionEligibility(clubId, competitionId, playerId, effect)}
            />
          </div>
          <div className="md:hidden">
            <ClubCompetitions clubId={clubId} idPrefix="club-competitions" variant="section" />
          </div>
        </>
      )}
    </div>
  )
}
