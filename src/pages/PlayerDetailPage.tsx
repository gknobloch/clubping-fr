import { useState } from 'react'
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
import { activeSeasonId } from '@/lib/season'
import { categoryFor } from '@/lib/seasonCategories'
import { clubLicences } from '@/lib/seasonLicences'
import { LicenceBadge } from '@/components/LicenceBadge'
import { ChecklistDialog } from '@/components/ChecklistDialog'
import { clubMemberGroups, groupsOfMember, mayManageMemberGroups } from '@/lib/memberGroups'

export function PlayerDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const {
    players, clubs, playerSeasonCategories, playerSeasonLicences, seasons,
    memberGroups, setGroupsOfMember,
  } = useAppData()
  const [zoom, setZoom] = useState(false)
  const [editingGroups, setEditingGroups] = useState(false)

  const player = players.find((p) => p.id === id)
  const club = clubs.find((c) => c.id === player?.clubId)

  // A category belongs to a season (#482); the one shown is the season being
  // played.
  const seasonId = activeSeasonId(seasons)
  const category = categoryFor(playerSeasonCategories, seasonId, player?.id)
  // Did the federation list their licence this season? (#488) Judged against
  // their own club, since one club's import says nothing about another's.
  const unlicensed = player
    && clubLicences(
      playerSeasonLicences,
      seasonId,
      players.filter((p) => p.clubId === player.clubId).map((p) => p.id),
    ).statusOf(player.id) === 'missing'
  // The club's groups (#602), and the ones this member is in. The payload only
  // carries the viewer's own club's, so a member of another club reads none.
  const clubGroups = clubMemberGroups(memberGroups, player?.clubId)
  const memberOf = groupsOfMember(clubGroups, player?.id)
  const canFileGroups = mayManageMemberGroups(user, player?.clubId)

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
        title={(
          <span className="flex flex-wrap items-center gap-2">
            {player.firstName} {player.lastName}
            {unlicensed && <LicenceBadge />}
          </span>
        )}
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
          <InfoRow
            label="Catégorie"
            value={categoryDisplay(category) || 'Inconnue'}
          />
          {player.email && <InfoRow label="Email" value={player.email} />}
          {player.phone && <InfoRow label="Téléphone" value={player.phone} />}
        </dl>
      </section>

      {/* Groups (#602) — only once the club has any: before that there is
          nothing to be in, and nothing to file anybody into. */}
      {clubGroups.length > 0 && (
        <section
          aria-labelledby="player-groups-title"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="player-groups-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Groupes
            </h2>
            {canFileGroups && (
              <button
                type="button"
                onClick={() => setEditingGroups(true)}
                className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
              >
                Modifier
              </button>
            )}
          </div>
          {memberOf.length === 0 ? (
            <p className="text-sm text-slate-400">Dans aucun groupe.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {memberOf.map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/joueurs?groupes=${encodeURIComponent(g.id)}`}
                    className="inline-flex min-h-11 items-center rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200 md:min-h-0 md:py-1"
                  >
                    {g.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <PlayerPhaseHistory playerId={player.id} />

      {editingGroups && (
        <ChecklistDialog
          idPrefix="player-groups-editor"
          // Named like the captain's « Sélection — Rixheim PPA 5 »: who is
          // being filed, then the count.
          title={`Groupes — ${player.firstName} ${player.lastName}`}
          options={clubGroups.map((g) => ({ id: g.id, label: g.displayName }))}
          selected={memberOf.map((g) => g.id)}
          emptyLabel="Ce club n'a aucun groupe."
          onSave={(ids) => setGroupsOfMember(player.clubId, player.id, ids)}
          onClose={() => setEditingGroups(false)}
        />
      )}

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
