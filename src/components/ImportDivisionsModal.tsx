import { useEffect, useMemo, useState } from 'react'
import type { Organization } from '@/types'
import { useAppData, type FfttDivisionsPreview } from '@/contexts/DataContext'
import { FFTT_PHASES } from '@/lib/ffttPhases'
import { groupOrganizationsByType } from '@/lib/ffttOrganizations'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

type PreviewState = 'idle' | 'loading' | 'done' | 'no_contest' | 'error'

/** FFTT divisions import dialog for the Divisions admin page (#219). */
export function ImportDivisionsModal({
  onClose, defaultOrganizationId = '', onImported,
}: {
  onClose: () => void
  /** Preselects the organization from the page's own filter (#259), if any. */
  defaultOrganizationId?: string
  /** Called after a successful import with the organization used, so the
   *  page's filter can be set to match what was just imported (#259). */
  onImported?: (organizationId: string) => void
}) {
  const { seasons, fetchOrganizations, fetchDivisionsPreview, importFfttDivisions } = useAppData()

  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [orgsError, setOrgsError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const selectableSeasons = seasons.filter((s) => s.status !== 'archived')
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId)
  const [seasonId, setSeasonId] = useState(
    seasons.find((s) => s.status === 'active')?.id ?? selectableSeasons[0]?.id ?? '',
  )
  const [phase, setPhase] = useState(1)

  const [preview, setPreview] = useState<FfttDivisionsPreview | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('idle')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)

  // Load the organization dropdown from the local cache; only when the cache
  // is still empty do we sync from FFTT (otherwise: the refresh button).
  useEffect(() => {
    let cancelled = false
    fetchOrganizations().then(async (list) => {
      if (!cancelled && list && list.length === 0) list = await fetchOrganizations(true)
      if (cancelled) return
      if (list) setOrgs(list)
      else setOrgsError(true)
    })
    return () => { cancelled = true }
  }, [fetchOrganizations])

  const handleRefreshOrgs = async () => {
    setRefreshing(true)
    setOrgsError(false)
    const list = await fetchOrganizations(true)
    setRefreshing(false)
    if (list) setOrgs(list)
    else setOrgsError(true)
  }

  const orgGroups = useMemo(() => groupOrganizationsByType(orgs), [orgs])

  const handleSearch = async () => {
    setPreviewState('loading')
    setPreview(null)
    setImportedCount(null)
    setImportError(false)
    const result = await fetchDivisionsPreview(organizationId, seasonId, phase)
    if (result === 'no_contest') {
      setPreviewState('no_contest')
    } else if (result === null) {
      setPreviewState('error')
    } else {
      setPreview(result)
      setPreviewState('done')
    }
  }

  const toImportCount = preview?.divisions.filter((d) => !d.exists).length ?? 0
  const seasonName = seasons.find((s) => s.id === seasonId)?.displayName ?? seasonId

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttDivisions(organizationId, seasonId, phase)
    setImporting(false)
    if (result) {
      setImportedCount(result.created.length)
      setPreview(null)
      setPreviewState('idle')
      onImported?.(organizationId)
    } else {
      setImportError(true)
    }
  }

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-divisions-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-divisions-title" className="font-display text-lg font-semibold text-slate-800">
          Importer les divisions FFTT
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-organization" className="block text-sm font-medium text-slate-700">
              Organisation
            </label>
            <div className="mt-1 flex items-center gap-2">
              <select
                id="import-organization"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className={`${inputClass} mt-0 flex-1`}
                disabled={!orgs}
              >
                <option value="">{orgs ? 'Choisir une organisation…' : 'Chargement…'}</option>
                {orgGroups.map((g) => (
                  <optgroup key={g.type} label={g.label}>
                    {g.organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} ({o.identifier})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRefreshOrgs}
                disabled={refreshing}
                title="Rafraîchir la liste depuis la FFTT"
                aria-label="Rafraîchir la liste des organisations"
                className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <svg className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5.07 14.93a8 8 0 0013.86 0M18.93 9.07a8 8 0 00-13.86 0" />
                </svg>
              </button>
            </div>
            {orgsError && (
              <p className="mt-1 text-sm text-red-600">
                Impossible de charger les organisations depuis la FFTT.
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="import-season" className="block text-sm font-medium text-slate-700">
                Saison
              </label>
              <select
                id="import-season"
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className={inputClass}
              >
                {selectableSeasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="import-phase" className="block text-sm font-medium text-slate-700">
                Phase
              </label>
              <select
                id="import-phase"
                value={phase}
                onChange={(e) => setPhase(Number(e.target.value))}
                className={inputClass}
              >
                {FFTT_PHASES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={!organizationId || !seasonId || previewState === 'loading'}
            className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
          >
            {previewState === 'loading' ? 'Recherche…' : 'Rechercher les divisions'}
          </button>

          {previewState === 'error' && (
            <p className="text-sm text-red-600">
              Impossible de contacter l’API FFTT. Réessayez plus tard.
            </p>
          )}
          {previewState === 'no_contest' && (
            <p className="text-sm text-slate-600">
              Aucun championnat trouvé pour cette organisation et cette saison.
            </p>
          )}
          {importedCount !== null && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-800">
                {importedCount === 0
                  ? 'Aucune division à importer : elles sont toutes déjà présentes.'
                  : `${importedCount} division${importedCount > 1 ? 's' : ''} importée${importedCount > 1 ? 's' : ''}.`}
              </p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Championnat : <span className="font-medium text-slate-800">{preview.contest.name}</span>
              </p>
              {!preview.phaseExists && (
                <p className="text-sm text-amber-700">
                  La phase « Phase {phase} » n’existe pas encore pour {seasonName} : elle sera créée (inactive).
                </p>
              )}
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.divisions.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className={d.exists ? 'text-slate-400' : 'text-slate-800'}>
                      {d.rank}. {d.name}
                      <span className="ml-2 text-xs text-slate-400">{d.playersPerGame} j/match</span>
                    </span>
                    {d.exists && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        Déjà présente
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {importError && (
                <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
              )}
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || toImportCount === 0}
                className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
              >
                {importing
                  ? 'Import…'
                  : toImportCount === 0
                    ? 'Rien à importer'
                    : `Importer ${toImportCount} division${toImportCount > 1 ? 's' : ''}`}
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
