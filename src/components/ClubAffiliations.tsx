import { useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { RowActions } from '@/components/RowActions'
import { useConfirm } from '@/components/useConfirm'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { FFTT_FEDERATION_ID, federationOptionLabel } from '@/lib/federations'
import type { Club, ClubAffiliation } from '@/types'

const INPUT_CLASS =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

/**
 * A club's federations other than the FFTT (#643) — Kembs plays the AGR too,
 * under the name « KEMBS ASL TT ».
 *
 * The FFTT number is the « N° affiliation FFTT » field above it, kept on the
 * club row (see migration 0061); this lists the rest. The name is the one the
 * federation prints on its calendars, which is what they will be matched
 * against (#647) — left blank, it is the club's own.
 *
 * Says nothing while the FFTT is the only federation there is.
 */
export function ClubAffiliations({ club, canEdit, idPrefix }: { club: Club; canEdit: boolean; idPrefix: string }) {
  const { federations, setClubAffiliation, removeClubAffiliation } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [editing, setEditing] = useState<{ isNew: boolean; draft: ClubAffiliation } | null>(null)

  const others = federations.filter((f) => f.id !== FFTT_FEDERATION_ID)
  if (others.length === 0) return null

  const affiliations = (club.affiliations ?? []).filter((a) => a.federationId !== FFTT_FEDERATION_ID)
  const joinable = others.filter((f) => !affiliations.some((a) => a.federationId === f.id))
  const shortName = (id: string) => federations.find((f) => f.id === id)?.shortName ?? id.toUpperCase()

  const openAdd = () =>
    setEditing({ isNew: true, draft: { federationId: joinable[0].id, affiliationNumber: '', name: '' } })

  const save = () => {
    if (!editing) return
    const { federationId, affiliationNumber, name } = editing.draft
    setClubAffiliation(club.id, {
      federationId,
      affiliationNumber: affiliationNumber.trim(),
      ...(name?.trim() ? { name: name.trim() } : {}),
    })
    setEditing(null)
  }

  const remove = async (affiliation: ClubAffiliation) => {
    const label = shortName(affiliation.federationId)
    if (await confirm({
      title: `Retirer le club de la fédération ${label} ?`,
      // A fact, not a consequence: teams belong to poules, not to this row.
      message: `Les équipes que le club y engage et leurs rencontres restent en place.`,
      confirmLabel: 'Retirer',
    })) {
      removeClubAffiliation(club.id, affiliation.federationId)
    }
  }

  const setDraft = (patch: Partial<ClubAffiliation>) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">Autres fédérations</h3>
        {canEdit && joinable.length > 0 && (
          <button
            type="button"
            onClick={openAdd}
            className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
          >
            Ajouter une fédération
          </button>
        )}
      </div>
      {affiliations.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Aucune.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {affiliations.map((a) => (
            <li key={a.federationId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  {shortName(a.federationId)}
                </span>
                {a.affiliationNumber
                  ? <span className="text-slate-900">n° <span className="font-mono">{a.affiliationNumber}</span></span>
                  : <span className="text-slate-500">sans numéro</span>}
                {a.name && <span className="block truncate text-slate-500">{a.name}</span>}
              </div>
              {canEdit && (
                <RowActions
                  label={`Actions — ${shortName(a.federationId)}`}
                  actions={[
                    { label: 'Modifier', onClick: () => setEditing({ isNew: false, draft: { ...a, name: a.name ?? '' } }) },
                    { label: 'Retirer', tone: 'danger', onClick: () => remove(a) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ModalShell onClose={() => setEditing(null)} labelledBy={`${idPrefix}-affiliation-title`}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 id={`${idPrefix}-affiliation-title`} className="font-display text-lg font-semibold text-slate-800">
              {editing.isNew ? 'Ajouter une fédération' : `Affiliation ${shortName(editing.draft.federationId)}`}
            </h2>
            <div className="mt-4 space-y-4">
              {editing.isNew && joinable.length > 1 && (
                <div>
                  <label htmlFor={`${idPrefix}-affiliation-federation`} className="block text-sm font-medium text-slate-700">
                    Fédération
                  </label>
                  <select
                    id={`${idPrefix}-affiliation-federation`}
                    value={editing.draft.federationId}
                    onChange={(e) => setDraft({ federationId: e.target.value })}
                    className={INPUT_CLASS}
                  >
                    {joinable.map((f) => <option key={f.id} value={f.id}>{federationOptionLabel(f)}</option>)}
                  </select>
                </div>
              )}
              {editing.isNew && joinable.length === 1 && (
                <p className="text-sm text-slate-600">{federationOptionLabel(joinable[0])}</p>
              )}
              <div>
                <label htmlFor={`${idPrefix}-affiliation-number`} className="block text-sm font-medium text-slate-700">
                  N° affiliation
                </label>
                <input
                  id={`${idPrefix}-affiliation-number`}
                  type="text"
                  inputMode="numeric"
                  value={editing.draft.affiliationNumber}
                  onChange={(e) => setDraft({ affiliationNumber: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-affiliation-name`} className="block text-sm font-medium text-slate-700">
                  Nom dans cette fédération
                </label>
                <input
                  id={`${idPrefix}-affiliation-name`}
                  type="text"
                  value={editing.draft.name ?? ''}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  placeholder={club.displayName}
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Tel qu'il apparaît sur ses calendriers. Laissé vide : le nom du club.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={NEUTRAL_BUTTON_CLASS}>
                Annuler
              </button>
              <button type="button" onClick={save} className={PRIMARY_BUTTON_CLASS}>
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
