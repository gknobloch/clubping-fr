import { useEffect, useMemo, useState } from 'react'
import type { Organization } from '@/types'
import { useAppData, type FfttCompetitionPreview, type FfttDivisionsPreview } from '@/contexts/DataContext'
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
  const {
    seasons, fetchOrganizations, fetchCompetitionsPreview,
    fetchDivisionsPreview, importFfttDivisions,
  } = useAppData()

  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [orgsError, setOrgsError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const selectableSeasons = seasons.filter((s) => s.status !== 'archived')
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId)
  const [seasonId, setSeasonId] = useState(
    seasons.find((s) => s.status === 'active')?.id ?? selectableSeasons[0]?.id ?? '',
  )
  const [phase, setPhase] = useState(1)

  // Which championship's divisions to import (#482). Before this the import
  // could only ever read one — the men's team championship — so a youth
  // championship's divisions were unreachable however many competitions were
  // configured. The list is FFTT's own, for the organisation and season chosen.
  const [contests, setContests] = useState<FfttCompetitionPreview[] | null>(null)
  /** FFTT's contest id — exact, where an identifier names more than one. */
  const [contestId, setContestId] = useState('')
  /** Which divisions of the preview to actually import (#482). */
  const [picked, setPicked] = useState<Set<string>>(new Set())

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
  const heldContests = useMemo(() => (contests ?? []).filter((c) => c.exists), [contests])
  const newContests = useMemo(() => (contests ?? []).filter((c) => !c.exists), [contests])

  // Reload the championship list whenever the scope changes, and drop any
  // preview built for the previous one.
  useEffect(() => {
    setContests(null)
    setContestId('')
    setPreview(null)
    setPreviewState('idle')
    if (!organizationId || !seasonId) return
    let cancelled = false
    fetchCompetitionsPreview(organizationId, seasonId).then((list) => {
      if (cancelled || !list) return
      setContests(list)
      // One championship needs no choosing; several do.
      if (list.length === 1) setContestId(list[0].id)
    })
    return () => { cancelled = true }
  }, [organizationId, seasonId, fetchCompetitionsPreview])

  const handleSearch = async () => {
    setPreviewState('loading')
    setPreview(null)
    setImportedCount(null)
    setImportError(false)
    const result = await fetchDivisionsPreview(organizationId, seasonId, phase, contestId)
    if (result === 'no_contest') {
      setPreviewState('no_contest')
    } else if (result === null) {
      setPreviewState('error')
    } else {
      setPreview(result)
      // Everything the import would act on starts ticked. Unlike the
      // competitions list — twenty entries, mostly tournaments — this is
      // exactly the divisions of the championship just chosen, so taking them
      // all is the normal move and unticking one is the exception.
      setPicked(new Set(result.divisions.filter((d) => !d.exists || d.attachable).map((d) => d.id)))
      setPreviewState('done')
    }
  }

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toImportCount = preview?.divisions.filter((d) => !d.exists && picked.has(d.id)).length ?? 0
  // Divisions already present that the import would file under the competition
  // (#482). Without counting these, a phase whose divisions all pre-date the
  // feature offered a disabled "Rien à importer" and the filing was unreachable.
  const toAttachCount = preview?.divisions.filter((d) => d.attachable && picked.has(d.id)).length ?? 0
  const seasonName = seasons.find((s) => s.id === seasonId)?.displayName ?? seasonId

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttDivisions(
      organizationId, seasonId, phase, contestId, [...picked],
    )
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
          <div>
            <label htmlFor="import-contest" className="block text-sm font-medium text-slate-700">
              Compétition
            </label>
            <select
              id="import-contest"
              value={contestId}
              onChange={(e) => setContestId(e.target.value)}
              className={inputClass}
              disabled={!contests}
            >
              <option value="">
                {contests ? 'Choisir une compétition…' : 'Choisissez une organisation et une saison'}
              </option>
              {/* Split rather than flagged inline: which championships are
                  already known is the thing being asked, and a suffix on twenty
                  options is a list nobody reads. Picking one not yet imported
                  still works — it is created on import. */}
              {heldContests.length > 0 && (
                <optgroup label="Déjà importées">
                  {heldContests.map((c) => (
                    <option key={c.id} value={c.id}>{c.localName ?? c.name}</option>
                  ))}
                </optgroup>
              )}
              {newContests.length > 0 && (
                <optgroup label="Pas encore importées">
                  {newContests.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Les divisions importées y seront rattachées. Elle sera créée si elle n’existe pas encore.
            </p>
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
            disabled={!organizationId || !seasonId || !contestId || previewState === 'loading'}
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
                  ? 'Aucune division créée : elles étaient toutes déjà présentes. Celles qui n’étaient rattachées à aucune compétition le sont désormais.'
                  : `${importedCount} division${importedCount > 1 ? 's' : ''} importée${importedCount > 1 ? 's' : ''}.`}
              </p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Championnat : <span className="font-medium text-slate-800">{preview.contest.name}</span>
              </p>
              {/* The import reads one FFTT contest and one only, so it knows
                  which competition these divisions belong to and files them
                  itself (#482). Saying so here is what makes the competition
                  appearing on /competitions afterwards unsurprising. */}
              <p className="text-sm text-slate-600">
                Compétition :{' '}
                <span className="font-medium text-slate-800">{preview.competition.displayName}</span>
                {!preview.competition.exists && (
                  <span className="text-slate-500"> — elle sera créée, ouverte à toutes les catégories</span>
                )}
              </p>
              {!preview.phaseExists && (
                <p className="text-sm text-amber-700">
                  La phase « Phase {phase} » n’existe pas encore pour {seasonName} : elle sera créée (inactive).
                </p>
              )}
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.divisions.map((d) => {
                  // A division already present AND already filed is the one row
                  // there is nothing to do to: no box, since ticking it would
                  // promise an action that would not happen.
                  const actionable = !d.exists || !!d.attachable
                  return (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      id={`import-division-${d.id}`}
                      checked={picked.has(d.id)}
                      disabled={!actionable}
                      onChange={() => togglePicked(d.id)}
                      aria-label={d.name}
                      className="h-5 w-5 shrink-0 rounded border-slate-300 disabled:opacity-40 md:h-4 md:w-4"
                    />
                    <label
                      htmlFor={`import-division-${d.id}`}
                      className={`min-w-0 flex-1 ${actionable ? 'text-slate-800' : 'text-slate-400'}`}
                    >
                      {d.rank}. {d.name}
                      <span className="ml-2 text-xs text-slate-400">{d.playersPerGame} j/match</span>
                    </label>
                    {d.exists && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        {d.attachable ? 'Présente, à rattacher' : 'Déjà présente'}
                      </span>
                    )}
                  </li>
                  )
                })
                }
              </ul>
              {importError && (
                <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
              )}
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || (toImportCount === 0 && toAttachCount === 0)}
                className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
              >
                {importing
                  ? 'Import…'
                  : toImportCount === 0
                    ? toAttachCount === 0
                      ? 'Rien à importer'
                      : `Rattacher ${toAttachCount} division${toAttachCount > 1 ? 's' : ''}`
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
