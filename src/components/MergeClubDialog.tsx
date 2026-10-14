import { useMemo, useState } from 'react'
import type { Club } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { DANGER_BUTTON_CLASS, NEUTRAL_BUTTON_CLASS } from '@/components/Button'
import { clubMergeKeeper, clubMergeRefusal } from '@/lib/clubMerge'
import { townKey } from '@/lib/clubTown'

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * Fold a club into another (#730) — the AGR import's bare « Kembs ASL TT »
 * into the FFTT's « Kembs TT ». Which row stays is the rule's, not the
 * admin's (`clubMergeKeeper`), so the dialog says it before anything is
 * sent; what cannot be merged without a decision says why, and the button
 * waits.
 */
export function MergeClubDialog({ club, onClose }: { club: Club; onClose: () => void }) {
  const { clubs, teams, users, memberGroups, competitionGroups, mergeClubs } = useAppData()
  const [otherId, setOtherId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clubs of the same town first: that is where a duplicate is.
  const { sameTown, others } = useMemo(() => {
    const town = townKey(club.displayName)
    const candidates = clubs
      .filter((c) => c.id !== club.id && !c.isArchived)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'))
    const near = (c: Club) => !!town && townKey(c.displayName) === town
    return { sameTown: candidates.filter(near), others: candidates.filter((c) => !near(c)) }
  }, [clubs, club])

  const other = clubs.find((c) => c.id === otherId)
  const pair = other ? clubMergeKeeper(club, other) : null
  const refusal = pair && clubMergeRefusal(pair.keep, pair.remove, { teams, memberGroups, competitionGroups })
  const moving = pair && [
    plural(teams.filter((t) => t.clubId === pair.remove.id).length, 'équipe', 'équipes'),
    plural(users.filter((u) => u.clubId === pair.remove.id).length, 'membre', 'membres'),
    plural(pair.remove.addresses.length, 'adresse', 'adresses'),
  ].join(', ')

  const submit = async () => {
    if (!pair || refusal) return
    setBusy(true)
    setError(null)
    const r = await mergeClubs(pair.remove.id, pair.keep.id)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }

  return (
    <ModalShell onClose={onClose} labelledBy="merge-club-title">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 id="merge-club-title" className="font-display text-lg font-semibold text-slate-800">
          Fusionner « {club.displayName} »
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Deux fiches pour un même club : équipes, membres, adresses, canaux, affiliations, groupes et
          entraînements passent sur celle qui est gardée, et l’autre est supprimée.
        </p>
        <div className="mt-4">
          <label htmlFor="merge-club-other" className="block text-sm font-medium text-slate-700">
            Avec
          </label>
          <select
            id="merge-club-other"
            value={otherId}
            onChange={(e) => { setOtherId(e.target.value); setError(null) }}
            className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="">Choisir un club</option>
            {sameTown.length > 0 && (
              <optgroup label="Même ville">
                {sameTown.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </optgroup>
            )}
            <optgroup label={sameTown.length > 0 ? 'Autres clubs' : 'Clubs'}>
              {others.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </optgroup>
          </select>
        </div>

        {pair && (
          <div className="mt-4 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="merge-club-summary">
            <p>
              Gardé : <span className="font-medium">{pair.keep.displayName}</span>
            </p>
            <p>
              Supprimé : <span className="font-medium">{pair.remove.displayName}</span> — {moving} passent
              sur {pair.keep.displayName}.
            </p>
            {pair.keep.id !== other?.id && (
              <p className="text-xs text-slate-500">
                « {pair.keep.displayName} » est gardé : c’est sous son numéro que les imports le retrouvent.
              </p>
            )}
          </div>
        )}
        {(refusal || error) && (
          <p role="alert" className="mt-3 text-sm text-red-600">{refusal?.message ?? error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!pair || !!refusal || busy}
            className={DANGER_BUTTON_CLASS}
          >
            {busy ? 'Fusion…' : 'Fusionner'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
