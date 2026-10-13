import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { FFTT_FEDERATION_ID, clubFederationIds } from '@/lib/federations'
import type { Club, Player } from '@/types'

const INPUT_CLASS =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

/**
 * Give a licensee a profile in another club (#644): Gilles, at Rixheim for the
 * FFTT, joins Landser for the AGR. The server copies the person — name,
 * address, phone, birth — so the two profiles share the address that links
 * them (#640); this asks only what belongs to the new club, which one and the
 * licences played there.
 */
export function AddToClubDialog({
  player,
  clubs,
  onClose,
}: {
  player: Player
  /** The clubs the viewer may add the licensee to — never empty. */
  clubs: Club[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { federations = [], addProfileInClub } = useAppData()
  const sortedClubs = [...clubs].sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'))
  const [clubId, setClubId] = useState(sortedClubs[0].id)
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<{ message: string; id?: string } | null>(null)

  const club = sortedClubs.find((c) => c.id === clubId) ?? sortedClubs[0]
  const federationIds = clubFederationIds(club)
  const shortName = (id: string) => federations.find((f) => f.id === id)?.shortName ?? id.toUpperCase()

  const save = async () => {
    setSaving(true)
    setRefusal(null)
    const result = await addProfileInClub(player.id, {
      clubId: club.id,
      licenseNumber: federationIds.includes(FFTT_FEDERATION_ID) ? (numbers[FFTT_FEDERATION_ID] ?? '').trim() : '',
      licences: federationIds
        .filter((id) => id !== FFTT_FEDERATION_ID && (numbers[id] ?? '').trim())
        .map((federationId) => ({ federationId, number: numbers[federationId].trim() })),
    })
    setSaving(false)
    if (result.ok) {
      onClose()
      navigate(`/joueurs/${encodeURIComponent(result.id)}`)
    } else {
      setRefusal({ message: result.message, ...(result.id ? { id: result.id } : {}) })
    }
  }

  return (
    <ModalShell onClose={onClose} labelledBy="add-to-club-title">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 id="add-to-club-title" className="font-display text-lg font-semibold text-slate-800">
          Ajouter à un autre club
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {player.firstName} {player.lastName} aura un second profil, avec ses nom, e-mail,
          téléphone et naissance.
          {player.email
            ? ' Avec la même adresse, il passera de l’un à l’autre à la connexion.'
            : ''}
        </p>
        {/* The address is the whole link (#640): without one, nothing joins them. */}
        {!player.email && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sans adresse e-mail, les deux profils ne seront pas reliés : ajoutez-en une
            pour qu’il passe de l’un à l’autre.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {clubs.length > 1 ? (
            <div>
              <label htmlFor="add-to-club-club" className="block text-sm font-medium text-slate-700">Club</label>
              <select
                id="add-to-club-club"
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className={INPUT_CLASS}
              >
                {sortedClubs.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-sm text-slate-700">
              Club : <span className="font-medium">{club.displayName}</span>
            </p>
          )}
          {federationIds.map((federationId) => (
            <div key={federationId}>
              <label htmlFor={`add-to-club-licence-${federationId}`} className="block text-sm font-medium text-slate-700">
                N° licence {shortName(federationId)}
              </label>
              <input
                id={`add-to-club-licence-${federationId}`}
                type="text"
                inputMode="numeric"
                value={numbers[federationId] ?? ''}
                onChange={(e) => setNumbers((n) => ({ ...n, [federationId]: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          ))}
        </div>
        {refusal && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {refusal.message}
            {refusal.id && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => { onClose(); navigate(`/joueurs/${encodeURIComponent(refusal.id!)}`) }}
                  className="font-medium underline"
                >
                  Voir ce profil
                </button>
              </>
            )}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>Annuler</button>
          <button type="button" onClick={save} disabled={saving} className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-40`}>
            Ajouter
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
