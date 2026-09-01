import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { IdentityCard } from '@/components/IdentityCard'
import { PlayerPhaseHistory, InfoRow } from '@/components/PlayerPhaseHistory'
import { ModalShell } from '@/components/ModalShell'
import { categoryDisplay } from '@/lib/playerCategories'
import { eligibleCompetitions } from '@/lib/competitionEligibility'

export function PlayerDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { players, clubs, competitions, competitionEligibilities } = useAppData()
  const [zoom, setZoom] = useState(false)

  const player = players.find((p) => p.id === id)
  const club = clubs.find((c) => c.id === player?.clubId)

  // "What is this licensee eligible for?" — the answer is a list, since a
  // cadet plays in their own category and with the adults (#482). Overrides
  // are read for their own club only: another club's exception is not theirs.
  const ordered = [...competitions].sort((a, b) => a.sortOrder - b.sortOrder)
  const eligible = player
    ? eligibleCompetitions(
        player,
        ordered,
        competitionEligibilities.filter((e) => e.clubId === player.clubId),
      )
    : []

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
      {competitions.some((c) => !c.isArchived) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Compétitions
          </h2>
          {eligible.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ce joueur n'est éligible à aucune compétition.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {eligible.map((c) => (
                <li
                  key={c.id}
                  className="rounded-full bg-accent-50 px-3 py-1 text-sm font-medium text-accent-700"
                >
                  {c.displayName}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <PlayerPhaseHistory playerId={player.id} />

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
