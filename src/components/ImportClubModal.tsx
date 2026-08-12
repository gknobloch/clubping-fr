import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { fetchClubDetailXmlFromBrowser, hasVenueInfo, parseClubDetailXml } from '@/lib/ffttClub'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

type SearchState = 'idle' | 'loading' | 'found' | 'not_found' | 'already_exists' | 'error'

/** Editable draft of the parsed FFTT detail, pre-filled but adjustable before import. */
interface ClubDraft {
  displayName: string
  venueLabel: string
  street: string
  postalCode: string
  city: string
}

/**
 * FFTT club import dialog for the Clubs admin page (#247). A single club has
 * no related entities to reconcile (unlike divisions/teams/games), so this
 * reuses the plain manual-creation flow (`addClub`) once the FFTT detail is
 * fetched and parsed — no dedicated preview/import API endpoint needed.
 */
export function ImportClubModal({ onClose }: { onClose: () => void }) {
  const { clubs, addClub, updateClub } = useAppData()

  const [affiliationNumber, setAffiliationNumber] = useState('')
  const [state, setState] = useState<SearchState>('idle')
  const [draft, setDraft] = useState<ClubDraft | null>(null)
  const [existingClub, setExistingClub] = useState<(typeof clubs)[number] | null>(null)
  const [imported, setImported] = useState(false)

  const resetResult = () => {
    setState('idle')
    setDraft(null)
    setExistingClub(null)
    setImported(false)
  }

  const handleSearch = async () => {
    setState('loading')
    setDraft(null)
    setExistingClub(null)
    const xml = await fetchClubDetailXmlFromBrowser(affiliationNumber)
    if (xml === null) {
      setState('error')
      return
    }
    const parsed = parseClubDetailXml(xml)
    if (!parsed) {
      setState('not_found')
      return
    }
    const existing = clubs.find((c) => c.affiliationNumber === parsed.affiliationNumber)
    if (existing) {
      setExistingClub(existing)
      setState('already_exists')
      return
    }
    setDraft({
      displayName: parsed.displayName,
      venueLabel: parsed.venueLabel,
      street: parsed.street,
      postalCode: parsed.postalCode,
      city: parsed.city,
    })
    setState('found')
  }

  const handleReactivate = () => {
    if (!existingClub) return
    updateClub(existingClub.id, { isArchived: false })
    setExistingClub({ ...existingClub, isArchived: false })
  }

  const handleImport = () => {
    if (!draft) return
    addClub({
      affiliationNumber,
      displayName: draft.displayName,
      isArchived: false,
      addresses: hasVenueInfo(draft)
        ? [{
            id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: draft.venueLabel || 'Salle', street: draft.street,
            postalCode: draft.postalCode, city: draft.city, isDefault: true,
          }]
        : [],
      channels: [],
    })
    setImported(true)
    setDraft(null)
  }

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'
  const fieldClass = 'min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-club-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-club-title" className="font-display text-lg font-semibold text-slate-800">
          Importer un club depuis la FFTT
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-club-number" className="block text-sm font-medium text-slate-700">
              N° affiliation
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="import-club-number"
                type="text"
                value={affiliationNumber}
                onChange={(e) => { setAffiliationNumber(e.target.value); resetResult() }}
                className={`${inputClass} mt-0 flex-1`}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={!affiliationNumber || state === 'loading'}
                className={PRIMARY_BUTTON_CLASS}
              >
                {state === 'loading' ? 'Recherche…' : 'Rechercher'}
              </button>
            </div>
          </div>

          {state === 'error' && (
            <p className="text-sm text-red-600">Impossible de contacter la FFTT. Réessayez plus tard.</p>
          )}
          {state === 'not_found' && (
            <p className="text-sm text-slate-600">Aucun club trouvé pour ce numéro d’affiliation.</p>
          )}
          {imported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-800">Club importé.</p>
            </div>
          )}

          {state === 'already_exists' && existingClub && (
            <div className="space-y-2">
              <p className="text-sm text-amber-700">Un club avec ce numéro d’affiliation existe déjà :</p>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-800">
                  {existingClub.displayName}
                  {existingClub.isArchived && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Archivé</span>
                  )}
                </p>
                <p className="text-slate-500">N° {existingClub.affiliationNumber}</p>
                <p className="text-slate-500">
                  {existingClub.addresses?.length
                    ? existingClub.addresses.map((a) => `${a.label} · ${a.street}, ${a.postalCode} ${a.city}`).join(' / ')
                    : 'Aucun lieu de jeu enregistré.'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  to={`/clubs/${encodeURIComponent(existingClub.id)}`}
                  onClick={onClose}
                  className="text-sm font-medium text-accent-600 hover:text-accent-800"
                >
                  Modifier ce club
                </Link>
                {existingClub.isArchived && (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    className="text-sm font-medium text-green-700 hover:text-green-900"
                  >
                    Réactiver ce club
                  </button>
                )}
              </div>
            </div>
          )}

          {draft && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Vérifiez et corrigez si besoin avant d’importer :</p>
              <div className="grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Nom du club
                  <input
                    type="text"
                    value={draft.displayName}
                    onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Lieu de jeu
                  <input
                    type="text"
                    value={draft.venueLabel}
                    onChange={(e) => setDraft({ ...draft, venueLabel: e.target.value })}
                    placeholder="Salle"
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Adresse
                  <input
                    type="text"
                    value={draft.street}
                    onChange={(e) => setDraft({ ...draft, street: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <div className="flex gap-3">
                  <label className="flex w-28 flex-col gap-1 text-sm font-medium text-slate-700">
                    Code postal
                    <input
                      type="text"
                      value={draft.postalCode}
                      onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })}
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
                    Ville
                    <input
                      type="text"
                      value={draft.city}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>
              {!hasVenueInfo(draft) && (
                <p className="text-xs text-slate-400">
                  Aucun lieu de jeu renseigné par la FFTT pour ce club — il sera importé sans adresse.
                </p>
              )}
              <button
                type="button"
                onClick={handleImport}
                className={`w-full ${PRIMARY_BUTTON_CLASS}`}
              >
                Importer ce club
              </button>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={NEUTRAL_BUTTON_CLASS}
          >
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
