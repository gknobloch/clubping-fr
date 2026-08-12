import { useMemo, useState } from 'react'
import type { Season, SeasonStatus } from '@/types'
import { useAppData, type FfttCurrentSeason } from '@/contexts/DataContext'
import { seasonIdFromName } from '@/lib/season'
import { phaseOrderKey } from '@/lib/ffttPhases'
import { STATUS_BADGES, STATUS_LABELS } from '@/lib/status'
import { StatusRadioGroup } from '@/components/StatusRadioGroup'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, PrimaryButton, SecondaryButton } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'

export function SeasonsPage() {
  const {
    seasons: allSeasons, phases, updateSeason, addSeason, archiveSeason, deleteSeason,
    checkFfttSeason, importFfttSeason,
  } = useAppData()
  const [editing, setEditing] = useState<Season | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ displayName: string; status: SeasonStatus }>({
    displayName: '',
    status: 'upcoming',
  })
  const [showArchived, setShowArchived] = useState(false)
  // FFTT check is on demand (#217): idle until the admin clicks « Vérifier ».
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<FfttCurrentSeason | 'error' | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [ffttSuccess, setFfttSuccess] = useState<string | null>(null)

  const activeSeasons = useMemo(() => allSeasons.filter((s) => s.status !== 'archived'), [allSeasons])
  const archivedSeasons = useMemo(() => allSeasons.filter((s) => s.status === 'archived'), [allSeasons])
  const seasons = showArchived ? allSeasons : activeSeasons

  const handleCheck = async () => {
    setChecking(true)
    setCheckResult(null)
    setFfttSuccess(null)
    setImportError(false)
    const result = await checkFfttSeason()
    setChecking(false)
    setCheckResult(result ?? 'error')
  }

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const imported = await importFfttSeason()
    setImporting(false)
    if (imported) {
      setCheckResult(null)
      setFfttSuccess(`Saison ${imported.displayName} importée et activée. La saison précédente a été archivée.`)
    } else {
      setImportError(true)
    }
  }

  // The FFTT current season exists locally but is not active (e.g. archived by
  // mistake): activate it — the single-active invariant archives the other one.
  const handleActivate = (result: FfttCurrentSeason) => {
    updateSeason(result.id, { status: 'active' })
    setCheckResult(null)
    setFfttSuccess(`Saison ${result.displayName} activée. La saison précédemment active a été archivée.`)
  }

  // Manual creation follows the FFTT convention: the id derives from the name.
  const derivedId = seasonIdFromName(form.displayName)
  const nameInvalid = form.displayName.trim() !== '' && !derivedId
  const duplicate = !!derivedId && allSeasons.some((s) => s.id === derivedId && s.id !== editing?.id)
  const canSave = !!derivedId && !duplicate

  const openEdit = (season: Season) => {
    setEditing(season)
    setCreating(false)
    setForm({ displayName: season.displayName, status: season.status })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setForm({ displayName: '', status: 'upcoming' })
  }

  const handleSave = () => {
    if (!canSave) return
    if (editing) {
      updateSeason(editing.id, form)
      setEditing(null)
    } else if (creating) {
      addSeason(form)
      setCreating(false)
    }
  }

  const handleArchive = (season: Season) => {
    if (window.confirm(`Archiver la saison "${season.displayName}" ? Elle ne sera plus visible dans la liste active.`)) {
      archiveSeason(season.id)
    }
  }

  const handleDelete = (season: Season) => {
    if (window.confirm(`Supprimer définitivement la saison "${season.displayName}" ? Toutes les phases, divisions, groupes, équipes, journées, matchs, disponibilités et compositions associés seront également supprimés. Cette action est irréversible.`)) {
      deleteSeason(season.id)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saisons"
        actions={
          <>
            {/* Manual add is the fallback; the FFTT check/import is the default
                path — same layout as the Divisions page. */}
            <SecondaryButton onClick={openCreate}>Ajouter une saison</SecondaryButton>
            <PrimaryButton onClick={handleCheck} disabled={checking}>
              {checking ? 'Vérification…' : 'Vérifier la saison FFTT'}
            </PrimaryButton>
          </>
        }
      />
      {checkResult === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">
            Impossible de contacter l’API FFTT. Réessayez plus tard.
          </p>
        </div>
      )}
      {checkResult !== null && checkResult !== 'error' && checkResult.exists && checkResult.status === 'active' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">
            La saison FFTT actuelle ({checkResult.displayName}) est déjà active — rien à faire.
          </p>
        </div>
      )}
      {checkResult !== null && checkResult !== 'error' && checkResult.exists && checkResult.status !== 'active' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-slate-700">
            La saison FFTT actuelle{' '}
            <span className="font-semibold">{checkResult.displayName}</span>
            {' '}existe mais n’est pas active — l’activer archivera la saison active.
          </p>
          <button
            type="button"
            onClick={() => handleActivate(checkResult)}
            className={PRIMARY_BUTTON_CLASS}
          >
            Activer
          </button>
        </div>
      )}
      {ffttSuccess && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">{ffttSuccess}</p>
        </div>
      )}
      {checkResult !== null && checkResult !== 'error' && !checkResult.exists && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3">
          <p className="text-sm text-slate-700">
            Nouvelle saison FFTT disponible :{' '}
            <span className="font-semibold">{checkResult.displayName}</span>
            {' '}— l’importer l’activera et archivera la saison active.
          </p>
          <div className="flex items-center gap-3">
            {importError && (
              <span className="text-sm text-red-600">Échec de l’import, réessayez.</span>
            )}
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className={PRIMARY_BUTTON_CLASS}
            >
              {importing ? 'Import…' : 'Importer'}
            </button>
          </div>
        </div>
      )}
      {archivedSeasons.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les saisons archivées ({archivedSeasons.length})
          </span>
        </label>
      )}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Saison
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Statut
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {seasons.map((season) => (
              <tr key={season.id} className={`hover:bg-slate-50/50 ${season.status === 'archived' ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {season.displayName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[season.status]}`}
                  >
                    {STATUS_LABELS[season.status]}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${season.displayName}`}
                    actions={[
                      // Modifier stays available on archived seasons so a mistaken
                      // archive can be reverted via the status radios (#223).
                      { label: 'Modifier', onClick: () => openEdit(season) },
                      season.status !== 'archived' && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => handleArchive(season),
                      },
                      season.status === 'archived' && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(season),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <ModalShell
          onClose={() => { setEditing(null); setCreating(false) }}
          labelledBy="edit-season-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="edit-season-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter une saison' : 'Modifier la saison'}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="edit-displayName" className="block text-sm font-medium text-slate-700">
                  Nom (ex. 2026/2027)
                </label>
                <input
                  id="edit-displayName"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
                {nameInvalid && (
                  <p className="mt-1 text-sm text-red-600">
                    Format attendu : deux années consécutives, ex. 2026/2027.
                  </p>
                )}
                {duplicate && (
                  <p className="mt-1 text-sm text-red-600">Cette saison existe déjà.</p>
                )}
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700">Statut</span>
                <StatusRadioGroup
                  name="season-status"
                  value={form.status}
                  onChange={(status) => setForm((f) => ({ ...f, status }))}
                />
                {form.status === 'active' && editing?.status !== 'active' && (() => {
                  // Resulting active (season · phase) combination (#227): the
                  // active phase follows the season — kept when it belongs to
                  // it, otherwise switched to the season's most recent phase.
                  const targetId = editing?.id ?? derivedId
                  const activePhase = phases.find((p) => p.status === 'active')
                  const coherent = !!activePhase && activePhase.seasonId === targetId
                  const resulting = coherent
                    ? activePhase
                    : phases
                        .filter((p) => p.seasonId === targetId && p.status !== 'archived')
                        .sort((a, b) => b.name.localeCompare(a.name))[0]
                  const currentActive = allSeasons.find(
                    (s) => s.status === 'active' && s.id !== editing?.id,
                  )
                  const seasonDemotion = currentActive && targetId && Number(currentActive.id) < Number(targetId)
                    ? 'sera archivée'
                    : 'repassera à « À venir »'
                  const phaseDemotion = activePhase && targetId
                    && phaseOrderKey(activePhase.seasonId, activePhase.name) < phaseOrderKey(targetId, resulting?.name ?? '')
                    ? 'sera archivée'
                    : 'repassera à « À venir »'
                  return (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700">
                      <p>
                        Après enregistrement, la combinaison active sera :{' '}
                        <span className="font-semibold">
                          {form.displayName || '…'} · {resulting ? resulting.name : 'aucune phase active'}
                        </span>.
                        {currentActive && ` La saison ${currentActive.displayName} ${seasonDemotion}.`}
                      </p>
                      {!coherent && activePhase && (
                        <p className="mt-1">
                          La phase {activePhase.displayName} {phaseDemotion}
                          {resulting ? ` et ${resulting.displayName} sera activée` : ''}.
                        </p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditing(null); setCreating(false) }}
                className={NEUTRAL_BUTTON_CLASS}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className={PRIMARY_BUTTON_CLASS}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
