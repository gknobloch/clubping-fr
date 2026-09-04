import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { IdentityCard } from '@/components/IdentityCard'
import { PlayerPhaseHistory, InfoRow } from '@/components/PlayerPhaseHistory'
import { ModalShell } from '@/components/ModalShell'
import { useAuth } from '@/contexts/AuthContext'
import { categoryDisplay } from '@/lib/playerCategories'
import {
  ELIGIBILITY_ACTION_LABELS,
  ELIGIBILITY_REASON_LABELS,
  eligibilityCell,
} from '@/lib/competitionEligibility'
import { assignmentSummary, assignmentsByPlayer } from '@/lib/competitionAssignments'
import { useConfirm } from '@/components/useConfirm'

export function PlayerDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const {
    players, clubs, competitions, competitionEligibilities, setCompetitionEligibility,
    teams, divisions, gameSelections,
  } = useAppData()
  const [zoom, setZoom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirm()

  const player = players.find((p) => p.id === id)
  const club = clubs.find((c) => c.id === player?.clubId)

  // "What is this licensee eligible for?" — the answer is a list, since a
  // cadet plays in their own category and with the adults (#482). Overrides
  // are read for their own club only: another club's exception is not theirs.
  const ordered = competitions
    .filter((c) => !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const overrides = competitionEligibilities.filter((e) => e.clubId === player?.clubId)
  // Every competition with its verdict, not only the ones that admit them: the
  // point of this section for a club admin is the ones that do NOT, since those
  // are what they might amend.
  // What each competition already has them down for, so a verdict of "non
  // éligible" beside an équipe that fields them cannot pass unremarked (#482).
  const clubTeams = useMemo(
    () => teams.filter((t) => t.clubId === player?.clubId),
    [teams, player?.clubId],
  )
  const rows = player
    ? ordered.map((competition) => ({
      competition,
      ...eligibilityCell(player, competition, overrides),
      summary: assignmentSummary(
        assignmentsByPlayer(competition.id, {
          teams: clubTeams, divisions, competitions, gameSelections,
        }).get(player.id),
      ),
    }))
    : []

  // Only the club's own admins amend, and only their own club's licensees; a
  // general admin does it from the club's page, where the whole list is.
  const canManage = !!player
    && user?.role === 'club_admin'
    && user.clubId === player.clubId

  const amend = async (
    competitionId: string,
    effect: 'included' | 'excluded' | 'default',
    summary?: string | null,
  ) => {
    if (!player) return
    if (effect === 'excluded' && summary) {
      const competition = ordered.find((c) => c.id === competitionId)
      if (!(await confirm({
        title: `Exclure ${player.firstName} ${player.lastName} de « ${competition?.displayName} » ?`,
        message: `${summary}. L'exclusion ne le retire d'aucune équipe ni d'aucune composition — elle l'empêche seulement d'être ajouté ailleurs. À vous de régler le reste.`,
        confirmLabel: 'Exclure',
      }))) return
    }
    setBusy(true)
    setError(null)
    const ok = await setCompetitionEligibility(player.clubId, competitionId, player.id, effect)
    setBusy(false)
    if (!ok) {
      setError(
        effect === 'included'
          ? "Cette compétition est réservée à certaines catégories : ce licencié ne peut pas y être ajouté."
          : "La modification n'a pas pu être enregistrée. Réessayez.",
      )
    }
  }

  if (!player) {
    return (
      <div className="space-y-4">
        <Link to="/joueurs" className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}>
          ← Joueurs
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Joueur introuvable.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link to="/joueurs" className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}>
        ← Joueurs
      </Link>

      {/* Identity */}
      <IdentityCard
        leading={
          <button
            type="button"
            onClick={() => player.avatarUpdatedAt && setZoom(true)}
            className={player.avatarUpdatedAt ? 'cursor-zoom-in' : 'cursor-default'}
            aria-label="Agrandir l'avatar"
          >
            <Avatar
              playerId={player.id}
              avatarUpdatedAt={player.avatarUpdatedAt}
              firstName={player.firstName}
              lastName={player.lastName}
              size={64}
            />
          </button>
        }
        title={`${player.firstName} ${player.lastName}`}
        trailing={club && <ClubLogo clubId={club.id} logoUpdatedAt={club.logoUpdatedAt} size={64} />}
      >
        {club && <p className="text-slate-500">{club.displayName}</p>}
      </IdentityCard>

      {/* Informations (player-level — not phase-relative) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Informations
        </h2>
        <dl className="divide-y divide-slate-100">
          {player.licenseNumber && <InfoRow label="Licence" value={player.licenseNumber} />}
          {categoryDisplay(player.category) && (
            <InfoRow label="Catégorie" value={categoryDisplay(player.category)} />
          )}
          {player.email && <InfoRow label="Email" value={player.email} />}
          {player.phone && <InfoRow label="Téléphone" value={player.phone} />}
        </dl>
      </section>

      {/* Competitions (#482) — only once a general admin has defined any;
          before that nothing is restricted and the section would say nothing. */}
      {ordered.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Compétitions
          </h2>
          {error && (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {rows.map(({ competition, eligible, reason, action, summary }) => (
              <li
                key={competition.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className={`truncate text-sm ${eligible ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                    {competition.displayName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {eligible ? 'Éligible' : 'Non éligible'} · {ELIGIBILITY_REASON_LABELS[reason]}
                  </p>
                  {!eligible && summary && (
                    <p className="text-xs font-medium text-amber-600">⚠ {summary}</p>
                  )}
                </div>
                {canManage && action !== 'none' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => amend(
                      competition.id,
                      action === 'exclude' ? 'excluded' : action === 'include' ? 'included' : 'default',
                      summary,
                    )}
                    className={`text-sm font-medium disabled:opacity-50 ${TEXT_TARGET_CLASS} ${
                      action === 'exclude' ? 'text-red-600 hover:text-red-800' : 'text-accent-600 hover:text-accent-800'
                    }`}
                  >
                    {ELIGIBILITY_ACTION_LABELS[action]}
                  </button>
                )}
                {canManage && action === 'none' && (
                  <span className="text-xs text-slate-400">
                    {ELIGIBILITY_ACTION_LABELS.none}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlayerPhaseHistory playerId={player.id} />

      {confirmDialog}

      {/* Avatar lightbox */}
      {zoom && player.avatarUpdatedAt && (
        <ModalShell
          onClose={() => setZoom(false)}
          closeOnBackdrop
          label="Avatar"
          presentation="center" z={40} backdrop="dark"
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Fermer"
            className="cursor-zoom-out"
          >
            <Avatar
              playerId={player.id}
              avatarUpdatedAt={player.avatarUpdatedAt}
              firstName={player.firstName}
              lastName={player.lastName}
              size={280}
            />
          </button>
        </ModalShell>
      )}
    </div>
  )
}
