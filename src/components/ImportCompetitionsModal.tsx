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
  /** Per-identifier name, prefilled from FFTT and editable before importing. */
  const [names, setNames] = useState<Record<string, string>>({})
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
    // Nothing ticked. FFTT lists everything an organisation runs — some twenty
    // entries for a league, most of them individual tournaments this app has no
    // use for — so importing is opt-in, one championship at a time.
    setPicked(new Set())
    setNames(Object.fromEntries(result.map((c) => [c.identifier, c.localName ?? c.name])))
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
    const result = await importFfttCompetitions(
      organizationId, seasonId,
      [...picked].map((identifier) => ({ identifier, name: names[identifier] })),
    )
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
      {/* Wider than the other import dialogs on purpose: FFTT names run long
          ("FED_Championnat de France par Equipes Masculin"), each row carries an
          editable field, and this is a desktop job — nobody sets a season's
          competitions up from a phone. It still becomes a bottom sheet below
          sm:, like every ModalShell. */}
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Cochez les compétitions à importer. Elles admettront toutes les
                  catégories : restreignez-les ensuite depuis la liste.
                </p>
                <span className="text-sm text-slate-500">
                  {picked.size} sélectionnée{picked.size > 1 ? 's' : ''} sur {preview.filter((c) => !c.exists).length}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.map((c) => (
                  <li key={c.identifier} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      id={`import-comp-${c.identifier}`}
                      checked={picked.has(c.identifier)}
                      disabled={c.exists}
                      onChange={() => toggle(c.identifier)}
                      aria-label={c.name}
                      className="h-5 w-5 shrink-0 rounded border-slate-300 disabled:opacity-40 md:h-4 md:w-4"
                    />
                    {c.exists ? (
                      <label
                        htmlFor={`import-comp-${c.identifier}`}
                        className="min-w-0 flex-1 truncate text-slate-400"
                      >
                        {c.localName ?? c.name}
                      </label>
                    ) : (
                      // FFTT's own names are export labels, not titles — "FED_"
                      // prefixes and all — so the name is editable here rather
                      // than only after the fact on /competitions.
                      <input
                        type="text"
                        value={names[c.identifier] ?? c.name}
                        onChange={(e) => setNames((prev) => ({ ...prev, [c.identifier]: e.target.value }))}
                        aria-label={`Nom de « ${c.name} »`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                      />
                    )}
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
              disabled={importing || picked.size === 0 || [...picked].some((i) => !(names[i] ?? '').trim())}
              className={`disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
            >
              {importing
                ? 'Import…'
                : picked.size === 0
                  ? 'Aucune sélection'
                  : `Importer ${picked.size} compétition${picked.size > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
