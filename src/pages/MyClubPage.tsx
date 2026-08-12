import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ClubDetailView, ChannelIcon, channelTypeLabel } from '@/components/ClubDetailView'
import { ClubLogo } from '@/components/ClubLogo'
import { IdentityCard } from '@/components/IdentityCard'
import { PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'

export function MyClubPage() {
  const { user } = useAuth()
  const { clubs } = useAppData()
  const [editing, setEditing] = useState(false)

  const clubId = user?.clubId ?? null
  const currentClub = clubId
    ? (clubs.find((c) => c.id === clubId) ?? null)
    : null
  const canEdit = user !== null && user.role === 'club_admin'

  if (!clubId) {
    return <Navigate to="/" replace />
  }

  if (!currentClub) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-600">Club introuvable.</p>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-slate-800">{currentClub.displayName}</h1>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
          >
            Terminé
          </button>
        </div>
        <ClubDetailView club={currentClub} canEdit idPrefix="my-club" />
      </div>
    )
  }

  const addresses = currentClub.addresses ?? []
  const channels = [...(currentClub.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-5">
      {/* Identity */}
      <IdentityCard
        leading={<ClubLogo clubId={currentClub.id} logoUpdatedAt={currentClub.logoUpdatedAt} size={56} />}
        title={currentClub.displayName}
        trailing={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`shrink-0 ${PRIMARY_BUTTON_CLASS}`}
            >
              Modifier
            </button>
          )
        }
      >
        <p className="text-slate-500">N° {currentClub.affiliationNumber}</p>
      </IdentityCard>

      {/* Addresses */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adresses</h3>
        {addresses.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Aucune adresse.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {addresses.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{a.label}</span>
                {a.isDefault && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    Par défaut
                  </span>
                )}
                <p className="text-slate-500">
                  {a.street}, {a.postalCode} {a.city}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Communication channels */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Canaux de communication</h3>
        {channels.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Aucun canal.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span className="shrink-0 text-slate-400">
                  <ChannelIcon type={ch.type} />
                </span>
                <a
                  href={ch.link}
                  target="_blank"
                  rel="noreferrer"
                  className={`min-w-0 truncate font-medium text-slate-800 hover:underline ${TEXT_TARGET_CLASS}`}
                >
                  {ch.displayName?.trim() || channelTypeLabel(ch.type)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
