import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { ClubLogo } from '@/components/ClubLogo'
import { IdentityCard } from '@/components/IdentityCard'
import { PlayerPhaseHistory, InfoRow } from '@/components/PlayerPhaseHistory'
import { ModalShell } from '@/components/ModalShell'

export function PlayerDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { players, clubs } = useAppData()
  const [zoom, setZoom] = useState(false)

  const player = players.find((p) => p.id === id)
  const club = clubs.find((c) => c.id === player?.clubId)

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
          {player.email && <InfoRow label="Email" value={player.email} />}
          {player.phone && <InfoRow label="Téléphone" value={player.phone} />}
        </dl>
      </section>

      <PlayerPhaseHistory playerId={player.id} />

      {/* Avatar lightbox */}
      {zoom && player.avatarUpdatedAt && (
        <ModalShell
          onClose={() => setZoom(false)}
          closeOnBackdrop
          label="Avatar"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-6"
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
