import { useMemo, useState } from 'react'
import { useAppData, type FfttTeamsPreview, type FfttTeamsImportResult, type TeamImportOverride } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

const DAYS_OF_WEEK = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 9..21
const MINUTES = ['00', '15', '30', '45']

type PreviewState = 'idle' | 'loading' | 'done' | 'error'

/** Parse "16h30" → { hour: '16', minute: '30' }. */
function parseTime(t: string): { hour: string; minute: string } {
  const m = t.match(/^(\d{1,2})h(\d{2})$/)
  return m ? { hour: m[1], minute: m[2] } : { hour: '', minute: '00' }
}


interface RowState {
  selected: boolean
  gameLocationId: string
  defaultDay: string
  defaultTime: string
}

/** Compact hour/minute pair, reused for the bulk defaults and every row. */
function TimeSelect({
  value, onChange, hourLabel, minuteLabel,
}: { value: string; onChange: (v: string) => void; hourLabel: string; minuteLabel: string }) {
  const { hour, minute } = parseTime(value)
  const selectClass =
    'rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-100'
  return (
    <div className="flex items-center gap-1">
      <select
        value={hour}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}h${minute}` : '')}
        aria-label={hourLabel}
        className={selectClass}
      >
        <option value="">—</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-500">h</span>
      <select
        value={minute}
        onChange={(e) => onChange(hour ? `${hour}h${e.target.value}` : '')}
        disabled={!hour}
        aria-label={minuteLabel}
        className={selectClass}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * FFTT teams import dialog for the Teams admin page (#229). The Global Admin
 * picks a club; a Club Admin is locked to their own (`lockedClubId`). Each
 * team gets its own venue / day / time, editable per-row or filled in bulk
 * via "Appliquer à tous". Teams already present locally can't be re-selected
 * — the server re-checks anyway right before inserting.
 *
 * One exception (#422): a team FFTT now engages in another poule is offered as
 * a move. It keeps its venue, day, roster and captain — only where it plays
 * changes — so its three setting cells stay empty and disabled.
 */
export function ImportTeamsModal({ onClose, lockedClubId }: { onClose: () => void; lockedClubId?: string }) {
  const { clubs, fetchTeamsPreview, importFfttTeams } = useAppData()

  const selectableClubs = clubs.filter((c) => !c.isArchived)
  const [clubId, setClubId] = useState(lockedClubId ?? '')

  const [preview, setPreview] = useState<FfttTeamsPreview | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('idle')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [imported, setImported] = useState<FfttTeamsImportResult | null>(null)

  const [rows, setRows] = useState<Record<string, RowState>>({})

  // Bulk defaults — only applied to rows on demand, via "Appliquer à tous".
  const [bulkLocation, setBulkLocation] = useState('')
  const [bulkDay, setBulkDay] = useState('')
  const [bulkTime, setBulkTime] = useState('')

  const club = clubs.find((c) => c.id === clubId)
  const addresses = club?.addresses ?? []

  const resetSearch = () => {
    setPreview(null)
    setPreviewState('idle')
    setImported(null)
    setRows({})
  }

  const handleSearch = async () => {
    setPreviewState('loading')
    setImported(null)
    setImportError(false)
    setRows({})
    const result = await fetchTeamsPreview(clubId)
    if (result === 'club_not_found' || result === null) {
      setPreviewState('error')
      return
    }
    setPreview(result)
    setPreviewState('done')
    const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0]
    setBulkLocation(defaultAddr?.id ?? '')
    setBulkDay('')
    setBulkTime('')
    const initialRows: Record<string, RowState> = {}
    for (const t of result.teams) {
      initialRows[t.id] = {
        selected: t.importable,
        gameLocationId: t.importable && !t.moved ? (defaultAddr?.id ?? '') : '',
        defaultDay: '',
        defaultTime: '',
      }
    }
    setRows(initialRows)
  }

  const importable = useMemo(() => (preview?.teams ?? []).filter((t) => t.importable), [preview])
  const seasonMissing = !!preview && !preview.season.exists

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const applyToAll = () => {
    setRows((prev) => {
      const next = { ...prev }
      for (const t of importable) {
        if (t.moved) continue
        next[t.id] = { ...next[t.id], gameLocationId: bulkLocation, defaultDay: bulkDay, defaultTime: bulkTime }
      }
      return next
    })
  }

  const toggleAll = (selected: boolean) => {
    setRows((prev) => {
      const next = { ...prev }
      for (const t of importable) next[t.id] = { ...next[t.id], selected }
      return next
    })
  }

  const selectedOverrides: TeamImportOverride[] = importable
    .filter((t) => rows[t.id]?.selected)
    .map((t) => ({
      id: t.id,
      gameLocationId: rows[t.id].gameLocationId,
      defaultDay: rows[t.id].defaultDay,
      defaultTime: rows[t.id].defaultTime,
    }))
  const movedIds = new Set(importable.filter((t) => t.moved).map((t) => t.id))
  // A move needs no venue: the team already has one (#422).
  const allSelectedHaveLocation = selectedOverrides
    .every((o) => movedIds.has(o.id) || !!o.gameLocationId)
  const allImportableSelected = importable.length > 0 && importable.every((t) => rows[t.id]?.selected)

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttTeams(clubId, selectedOverrides)
    setImporting(false)
    if (result) {
      setImported(result)
      setPreview(null)
      setPreviewState('idle')
      setRows({})
    } else {
      setImportError(true)
    }
  }

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'
  const cellSelectClass =
    'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-100 disabled:text-slate-400'

  const badge = (t: FfttTeamsPreview['teams'][number]) => {
    if (t.moved) return { label: 'Change de poule', className: 'bg-amber-100 text-amber-700' }
    if (t.exists) return { label: 'Déjà présente', className: 'bg-slate-100 text-slate-500' }
    if (seasonMissing) return { label: 'Saison manquante', className: 'bg-amber-100 text-amber-700' }
    if (!t.divisionExists && t.importable) return { label: 'Division à importer', className: 'bg-sky-100 text-sky-700' }
    if (!t.importable) return { label: 'Division inconnue', className: 'bg-amber-100 text-amber-700' }
    return null
  }

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-teams-title"
    >
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-teams-title" className="font-display text-lg font-semibold text-slate-800">
          Importer les équipes FFTT
        </h2>
        <div className="mt-4 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="import-teams-club" className="block text-sm font-medium text-slate-700">
                Club
              </label>
              <select
                id="import-teams-club"
                value={clubId}
                onChange={(e) => {
                  setClubId(e.target.value)
                  resetSearch()
                }}
                disabled={!!lockedClubId}
                className={`${inputClass} disabled:bg-slate-100`}
              >
                {!lockedClubId && <option value="">Choisir un club…</option>}
                {selectableClubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName} ({c.affiliationNumber})</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={!clubId || previewState === 'loading'}
              className={`shrink-0 disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
            >
              {previewState === 'loading' ? 'Recherche…' : 'Rechercher les équipes'}
            </button>
          </div>

          {previewState === 'error' && (
            <p className="text-sm text-red-600">
              Impossible de contacter l’API FFTT. Réessayez plus tard.
            </p>
          )}

          {imported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
              <p className="text-sm text-green-800">
                {imported.createdTeams.length === 0
                  ? 'Aucune équipe à importer : elles sont toutes déjà présentes.'
                  : `${imported.createdTeams.length} équipe${imported.createdTeams.length > 1 ? 's' : ''} importée${imported.createdTeams.length > 1 ? 's' : ''}.`}
              </p>
              {!!imported.movedTeams?.length && (
                <p className="text-sm text-green-800">
                  {imported.movedTeams.length} équipe{imported.movedTeams.length > 1 ? 's' : ''} déplacée{imported.movedTeams.length > 1 ? 's' : ''} vers sa nouvelle poule
                  {imported.deletedGames?.length
                    ? `, ${imported.deletedGames.length} match${imported.deletedGames.length > 1 ? 's' : ''} de l’ancienne supprimé${imported.deletedGames.length > 1 ? 's' : ''}`
                    : ''}. Importez son calendrier depuis « Journées ».
                </p>
              )}
              {imported.createdDivisions.length > 0 && (
                <p className="text-sm text-green-800">
                  {imported.createdDivisions.length} division{imported.createdDivisions.length > 1 ? 's' : ''} importée{imported.createdDivisions.length > 1 ? 's' : ''} automatiquement.
                </p>
              )}
              {imported.createdTeams.length > 0 && (
                <p className="text-sm text-green-800">
                  Complétez maintenant chaque équipe (joueurs, capitaine) via « Modifier ».
                </p>
              )}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Saison FFTT : <span className="font-medium text-slate-800">{preview.season.displayName}</span>
              </p>
              {seasonMissing && (
                <p className="text-sm text-amber-700">
                  La saison {preview.season.displayName} n’existe pas encore : créez-la depuis la page Saisons avant d’importer.
                </p>
              )}

              {preview.teams.length === 0 ? (
                <p className="text-sm text-slate-600">Aucune équipe engagée trouvée pour ce club.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="w-8 px-3 py-2">
                          {importable.length > 0 && (
                            <input
                              type="checkbox"
                              checked={allImportableSelected}
                              onChange={(e) => toggleAll(e.target.checked)}
                              aria-label="Sélectionner toutes les équipes importables"
                              className="rounded border-slate-300"
                            />
                          )}
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Équipe</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Lieu de jeu</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Jour</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Heure</th>
                      </tr>
                      {/* Bulk defaults, laid out as a table row so its columns line up
                          exactly with the per-team rows below (#229 follow-up). */}
                      {importable.length > 0 && (
                        <tr className="border-t border-slate-200 bg-slate-100/70">
                          <td className="px-3 py-2 align-top"></td>
                          <td className="px-3 py-2 align-top">
                            <p className="text-xs font-medium text-slate-500">Valeurs par défaut</p>
                            <button
                              type="button"
                              onClick={applyToAll}
                              className="mt-1 rounded-lg border border-accent-600 px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50"
                            >
                              Appliquer à tous
                            </button>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={bulkLocation}
                              onChange={(e) => setBulkLocation(e.target.value)}
                              aria-label="Lieu de jeu par défaut"
                              className={cellSelectClass}
                            >
                              <option value="">Choisir un lieu…</option>
                              {addresses.map((a) => (
                                <option key={a.id} value={a.id}>{a.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={bulkDay}
                              onChange={(e) => setBulkDay(e.target.value)}
                              aria-label="Jour par défaut"
                              className={cellSelectClass}
                            >
                              <option value="">—</option>
                              {DAYS_OF_WEEK.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <TimeSelect
                              value={bulkTime}
                              onChange={setBulkTime}
                              hourLabel="Heure par défaut"
                              minuteLabel="Minutes par défaut"
                            />
                          </td>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.teams.map((t) => {
                        const b = badge(t)
                        const row = rows[t.id]
                        return (
                          <tr key={t.id} className={t.importable ? '' : 'opacity-60'}>
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                checked={!!row?.selected}
                                disabled={!t.importable}
                                onChange={(e) => updateRow(t.id, { selected: e.target.checked })}
                                aria-label={`Importer ${t.name}`}
                                className="rounded border-slate-300"
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <p className="font-medium text-slate-800">{t.name}</p>
                              <p className="text-xs text-slate-400">
                                {t.phase ? `Phase ${t.phase}` : 'Phase inconnue'} · {t.divisionName}
                                {t.poolNumber !== null ? ` · Poule ${t.poolNumber}` : ''}
                              </p>
                              {t.moved && (
                                <p className="text-xs text-amber-700">
                                  Aujourd’hui : {t.fromDivisionName ?? 'poule inconnue'}
                                  {t.fromPoolNumber != null ? ` · Poule ${t.fromPoolNumber}` : ''}
                                </p>
                              )}
                              {b && (
                                <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${b.className}`}>{b.label}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <select
                                value={row?.gameLocationId ?? ''}
                                disabled={!t.importable || t.moved}
                                onChange={(e) => updateRow(t.id, { gameLocationId: e.target.value })}
                                aria-label={`Lieu de jeu — ${t.name}`}
                                className={cellSelectClass}
                              >
                                <option value="">Choisir un lieu…</option>
                                {addresses.map((a) => (
                                  <option key={a.id} value={a.id}>{a.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <select
                                value={row?.defaultDay ?? ''}
                                disabled={!t.importable || t.moved}
                                onChange={(e) => updateRow(t.id, { defaultDay: e.target.value })}
                                aria-label={`Jour — ${t.name}`}
                                className={cellSelectClass}
                              >
                                <option value="">—</option>
                                {DAYS_OF_WEEK.map((d) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <TimeSelect
                                value={t.moved ? '' : row?.defaultTime ?? ''}
                                onChange={(v) => updateRow(t.id, { defaultTime: v })}
                                hourLabel={`Heure — ${t.name}`}
                                minuteLabel={`Minutes — ${t.name}`}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {importError && (
                <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
              )}
              {preview.teams.length > 0 && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || selectedOverrides.length === 0 || !allSelectedHaveLocation}
                  className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
                >
                  {importing
                    ? 'Import…'
                    : selectedOverrides.length === 0
                      ? 'Rien à importer'
                      : `Importer ${selectedOverrides.length} équipe${selectedOverrides.length > 1 ? 's' : ''}`}
                </button>
              )}
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
