import { useEffect, useMemo, useState } from 'react'
import type { Organization } from '@/types'
import { useAppData, type FfttCompetitionPreview } from '@/contexts/DataContext'
import { groupOrganizationsByType } from '@/lib/ffttOrganizations'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

type PreviewState = 'idle' | 'loading' | 'done' | 'error'

/**
 * FFTT competitions import (#482), the primary way a competition comes to exist.
 *
 * A competition is federation data like a club or a division: the same
 * `contests` query the divisions import already runs, with the identifier
 * filter taken off, lists every championship an organisation runs. Typing one
 * in by hand to mirror a row FFTT publishes is what /competitions' manual add
 * is a fallback for, not the normal path.
 *
 * Imported with no categories, which admits everyone: an import must never
 * start restricting who can be fielded. Narrowing each one — and locking a
 * youth championship to its categories — is the next step, on /competitions.
 */
export function ImportCompetitionsModal({
  onClose,
  defaultOrganizationId = '',
}: {
  onClose: () => void
  defaultOrganizationId?: string
}) {
  const { seasons, fetchOrganizations, fetchCompetitionsPreview, importFfttCompetitions } = useAppData()

  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [orgsError, setOrgsError] = useState(false)

  const selectableSeasons = seasons.filter((s) => s.status !== 'archived')
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId)
  const [seasonId, setSeasonId] = useState(
    seasons.find((s) => s.status === 'active')?.id ?? selectableSeasons[0]?.id ?? '',
  )

  const [preview, setPreview] = useState<FfttCompetitionPreview[] | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('idle')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)

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

  const orgGroups = useMemo(() => groupOrganizationsByType(orgs), [orgs])

  const handleSearch = async () => {
    setPreviewState('loading')
    setPreview(null)
    setImportedCount(null)
    setImportError(false)
    const result = await fetchCompetitionsPreview(organizationId, seasonId)
    if (!result) {
      setPreviewState('error')
      return
    }
    setPreview(result)
    // Everything we do not already hold starts ticked: the common move is
    // "take them all", and unticking one is easier than hunting for the rest.
    setPicked(new Set(result.filter((c) => !c.exists).map((c) => c.identifier)))
    setPreviewState('done')
  }

  const toggle = (identifier: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(identifier)) next.delete(identifier)
      else next.add(identifier)
      return next
    })

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttCompetitions(organizationId, seasonId, [...picked])
    setImporting(false)
    if (result) {
      setImportedCount(result.created.length)
      setPreview(null)
      setPreviewState('idle')
    } else {
      setImportError(true)
    }
  }

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  return (
    <ModalShell onClose={onClose} labelledBy="import-competitions-title">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-competitions-title" className="font-display text-lg font-semibold text-slate-800">
          Importer les compétitions FFTT
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-comp-organization" className="block text-sm font-medium text-slate-700">
              Organisation
            </label>
            <select
              id="import-comp-organization"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={inputClass}
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
            {orgsError && (
              <p className="mt-1 text-sm text-red-600">
                Impossible de charger les organisations depuis la FFTT.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="import-comp-season" className="block text-sm font-medium text-slate-700">
              Saison
            </label>
            <select
              id="import-comp-season"
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className={inputClass}
            >
              {selectableSeasons.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={!organizationId || !seasonId || previewState === 'loading'}
            className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
          >
            {previewState === 'loading' ? 'Recherche…' : 'Rechercher les compétitions'}
          </button>

          {previewState === 'error' && (
            <p className="text-sm text-red-600">
              Impossible de contacter l’API FFTT. Réessayez plus tard.
            </p>
          )}
          {previewState === 'done' && preview?.length === 0 && (
            <p className="text-sm text-slate-600">
              Aucune compétition trouvée pour cette organisation et cette saison.
            </p>
          )}
          {importedCount !== null && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-800">
                {importedCount === 0
                  ? 'Aucune compétition à importer : elles sont toutes déjà présentes.'
                  : `${importedCount} compétition${importedCount > 1 ? 's' : ''} importée${importedCount > 1 ? 's' : ''}, ouverte${importedCount > 1 ? 's' : ''} à toutes les catégories.`}
              </p>
            </div>
          )}

          {preview && preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Les compétitions importées admettent toutes les catégories. Restreignez-les
                ensuite depuis la liste.
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.map((c) => (
                  <li key={c.identifier} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      id={`import-comp-${c.identifier}`}
                      checked={picked.has(c.identifier)}
                      disabled={c.exists}
                      onChange={() => toggle(c.identifier)}
                      className="h-5 w-5 shrink-0 rounded border-slate-300 disabled:opacity-40 md:h-4 md:w-4"
                    />
                    <label
                      htmlFor={`import-comp-${c.identifier}`}
                      className={`min-w-0 flex-1 ${c.exists ? 'text-slate-400' : 'text-slate-800'}`}
                    >
                      {c.localName ?? c.name}
                    </label>
                    {c.exists && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        Déjà présente
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {importError && (
                <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Fermer
          </button>
          {preview && preview.length > 0 && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || picked.size === 0}
              className={`disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
            >
              {importing
                ? 'Import…'
                : `Importer ${picked.size} compétition${picked.size > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
