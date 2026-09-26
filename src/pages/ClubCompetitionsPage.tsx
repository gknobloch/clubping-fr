import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { PageHeader } from '@/components/PageHeader'
import { ClubCompetitions } from '@/components/ClubCompetitions'

/**
 * A club's own competitions screen (#482, #604).
 *
 * Its own place in the navigation rather than a section of /club: a club comes
 * here to decide something — which of its groups a competition is reserved
 * to — not to read its identity card.
 *
 * One shape at every width since #604. The grid it used to show above `md:`
 * compared forty licensees across five competitions, which is what managing
 * exclusions one by one needed; choosing a group per competition is a short
 * list of cards that reads the same on a phone.
 */
export function ClubCompetitionsPage() {
  const { user } = useAuth()
  const { clubs } = useAppData()

  const clubId = user?.clubId ?? null
  const club = clubId ? clubs.find((c) => c.id === clubId) ?? null : null

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
      <ClubCompetitions clubId={club.id} idPrefix="club-competitions" variant="section" />
    </div>
  )
}
