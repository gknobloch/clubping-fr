import { useEffect, useState } from 'react'
import { useAppData, type FfttGroupsPreview, type FfttGroupsImportResult } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

type PreviewState = 'loading' | 'done' | 'error'

/**
 * FFTT groups (pools) import dialog for the Groups admin page (#237). Takes
 * the division already selected on the page, previews every FFTT pool of
 * that division (existing ones included), then creates the missing ones —
 * unlike the teams import, which only creates a pool once a team of the
 * importing club is engaged in it.
 */
export function ImportGroupsModal({
  onClose, divisionId, divisionName,
}: { onClose: () => void; divisionId: string; divisionName: string }) {
  const { fetchGroupsPreview, importFfttGroups } = useAppData()

  const [preview, setPreview] = useState<FfttGroupsPreview | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('loading')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [imported, setImported] = useState<FfttGroupsImportResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchGroupsPreview(divisionId).then((result) => {
      if (cancelled) return
      if (result) {
        setPreview(result)
        setPreviewState('done')
      } else {
        setPreviewState('error')
      }
    })
    return () => { cancelled = true }
    // divisionId is stable for the lifetime of the dialog (passed by the opener).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGroupsPreview])

  const toImportCount = preview?.groups.filter((g) => !g.exists).length ?? 0

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttGroups(divisionId)
    setImporting(false)
    if (result) {
      setImported(result)
      setPreview(null)
    } else {
      setImportError(true)
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-groups-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-groups-title" className="font-display text-lg font-semibold text-slate-800">
          Importer les groupes FFTT
        </h2>
        <p className="mt-1 text-sm text-slate-500">{divisionName}</p>

        <div className="mt-4 space-y-4">
          {previewState === 'loading' && (
            <p className="text-sm text-slate-600">Recherche des poules FFTT…</p>
          )}
          {previewState === 'error' && (
            <p className="text-sm text-red-600">
              Impossible de contacter l’API FFTT. Réessayez plus tard.
            </p>
          )}

          {imported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-800">
                {imported.created.length === 0
                  ? 'Aucun groupe à importer : ils sont tous déjà présents.'
                  : `${imported.created.length} groupe${imported.created.length > 1 ? 's' : ''} importé${imported.created.length > 1 ? 's' : ''}.`}
              </p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className={g.exists ? 'text-slate-400' : 'text-slate-800'}>
                      Poule {g.number ?? '?'}
                    </span>
                    {g.exists && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        Déjà présente
                      </span>
                    )}
                  </li>
                ))}
                {preview.groups.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    Aucune poule trouvée pour cette division côté FFTT.
                  </li>
                )}
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
                    : `Importer ${toImportCount} groupe${toImportCount > 1 ? 's' : ''}`}
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
