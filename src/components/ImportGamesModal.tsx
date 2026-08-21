import { useEffect, useState } from 'react'
import { useAppData, type FfttGamesPreview, type FfttGamesImportResult } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'

type PreviewState = 'loading' | 'done' | 'error'

const GROUP_ERROR_LABELS: Record<string, string> = {
  calendar_not_published: 'Calendrier pas encore publié par la FFTT',
  pool_not_found: 'Poule inconnue côté FFTT',
  fftt_unavailable: 'FFTT injoignable',
  group_not_found: 'Groupe introuvable',
}

/**
 * FFTT calendar import dialog (#231), shared by /equipes (one team's group)
 * and /journees (every group of the selected phase). Previews what the import
 * would create per group, then imports on confirmation: journées upserted by
 * round (dates refreshed on re-import), games deduplicated by FFTT match id,
 * missing opponent clubs/teams auto-created.
 */
export function ImportGamesModal({
  onClose, groupIds, context, teamId, clubId,
}: {
  onClose: () => void
  groupIds: string[]
  context: string
  /** Import only this team's fixtures rather than its whole pool (#287). */
  teamId?: string
  /** Names the preview rows with this club's teams; omit for a global admin. */
  clubId?: string
}) {
  const { fetchGamesPreview, importFfttGames, teams, clubs } = useAppData()

  const [preview, setPreview] = useState<FfttGamesPreview | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('loading')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [imported, setImported] = useState<FfttGamesImportResult | null>(null)
  const [updateDates, setUpdateDates] = useState(false)
  const [removeObsolete, setRemoveObsolete] = useState(false)

  /** "Rixheim PPA 5" for the group's team(s) — a pool alone doesn't say which
   *  of your teams it concerns (#287). Scoped to the club when there is one. */
  const teamNameOf = (groupId: string) => {
    const inGroup = teams.filter((t) => t.groupId === groupId && !t.isArchived && (!clubId || t.clubId === clubId))
    return inGroup
      .map((t) => `${clubs.find((c) => c.id === t.clubId)?.displayName ?? ''} ${t.number}`.trim())
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .join(', ')
  }

  // Ordered by team name so the list reads like the teams page, not like the
  // order the groups happened to come back in.
  const rows = [...(preview?.groups ?? [])].sort((a, b) =>
    teamNameOf(a.groupId).localeCompare(teamNameOf(b.groupId), 'fr', { numeric: true }))
  const mismatchTotal = rows.reduce((n, g) => n + (g.dateMismatches ?? 0), 0)
  // Linking an existing game to its FFTT match id is work in its own right
  // (#294): a calendar imported from a document has no FFTT id, so every later
  // import had to fall back to matching by pairing. It needs no opt-in — it
  // fills a blank and never touches the slot — but the preview has to count it,
  // or with nothing new to create the confirm button stays disabled and the
  // link can never happen. That is exactly what "Rien à importer" was hiding.
  const linkTotal = rows.reduce((n, g) => n + (g.ffttIdsToLink ?? 0), 0)
  const willUpdateDates = updateDates && mismatchTotal > 0
  // A poule rebuilt mid-season (#422): fixtures that are no longer played and
  // teams that left it. Never offered when the import is scoped to one team —
  // the API reports nothing there, since it only sees part of the calendar.
  const obsoleteTotal = rows.reduce((n, g) => n + (g.obsoleteGames ?? 0), 0)
  const obsoleteManualTotal = rows.reduce((n, g) => n + (g.obsoleteManualGames ?? 0), 0)
  const departingTotal = rows.reduce((n, g) => n + (g.departingTeams ?? 0), 0)
  const hasPoolChange = obsoleteTotal > 0 || departingTotal > 0
  const willRemoveObsolete = removeObsolete && hasPoolChange

  useEffect(() => {
    let cancelled = false
    fetchGamesPreview(groupIds, teamId).then((result) => {
      if (cancelled) return
      if (result) {
        setPreview(result)
        setPreviewState('done')
      } else {
        setPreviewState('error')
      }
    })
    return () => { cancelled = true }
    // groupIds is stable for the lifetime of the dialog (computed by the opener).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGamesPreview, groupIds, teamId])

  const importableGroups = (preview?.groups ?? []).filter((g) => !g.error)
  const totalNewGames = importableGroups.reduce((n, g) => n + (g.newGames ?? 0), 0)
  const hasWork = totalNewGames > 0 || linkTotal > 0 || willUpdateDates || willRemoveObsolete

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importFfttGames(groupIds, teamId, { updateDates, removeObsolete })
    setImporting(false)
    if (result) {
      setImported(result)
      setPreview(null)
    } else {
      setImportError(true)
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-games-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-games-title" className="font-display text-lg font-semibold text-slate-800">
          Importer les matchs FFTT
        </h2>
        <p className="mt-1 text-sm text-slate-500">{context}</p>

        <div className="mt-4 space-y-4">
          {previewState === 'loading' && (
            <p className="text-sm text-slate-600">Recherche du calendrier FFTT…</p>
          )}
          {previewState === 'error' && (
            <p className="text-sm text-red-600">
              Impossible de contacter l’API FFTT. Réessayez plus tard.
            </p>
          )}

          {imported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
              <p className="text-sm text-green-800">
                {imported.createdGames.length === 0
                  ? 'Aucun match à importer : le calendrier est déjà à jour.'
                  : `${plural(imported.createdGames.length, 'match')} importé${imported.createdGames.length > 1 ? 's' : ''}, ${plural(imported.createdMatchDays.length, 'journée')} créée${imported.createdMatchDays.length > 1 ? 's' : ''}.`}
              </p>
              {imported.updatedMatchDays.length > 0 && (
                <p className="text-sm text-green-800">
                  {plural(imported.updatedMatchDays.length, 'journée')} redatée{imported.updatedMatchDays.length > 1 ? 's' : ''} d’après la FFTT.
                </p>
              )}
              {(imported.createdTeams.length > 0 || imported.createdClubs.length > 0) && (
                <p className="text-sm text-green-800">
                  Adversaires créés : {plural(imported.createdTeams.length, 'équipe')}
                  {imported.createdClubs.length > 0 ? ` et ${plural(imported.createdClubs.length, 'club')}` : ''}.
                </p>
              )}
              {!!imported.deletedGames?.length && (
                <p className="text-sm text-green-800">
                  {plural(imported.deletedGames.length, 'match')} supprimé{imported.deletedGames.length > 1 ? 's' : ''} : plus au calendrier de la poule
                  {imported.deletedMatchDays?.length
                    ? `, dont ${plural(imported.deletedMatchDays.length, 'journée')} devenue${imported.deletedMatchDays.length > 1 ? 's' : ''} vide${imported.deletedMatchDays.length > 1 ? 's' : ''}`
                    : ''}.
                </p>
              )}
              {!!imported.departedTeams && (
                <p className="text-sm text-green-800">
                  {plural(imported.departedTeams, 'équipe')} retirée{imported.departedTeams > 1 ? 's' : ''} de la poule.
                </p>
              )}
              {imported.skippedGroups.length > 0 && (
                <p className="text-sm text-amber-700">
                  {plural(imported.skippedGroups.length, 'groupe')} ignoré{imported.skippedGroups.length > 1 ? 's' : ''} (poule FFTT introuvable ou API injoignable).
                </p>
              )}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {rows.map((g) => (
                  <li key={g.groupId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    {g.error ? (
                      <>
                        <span className="min-w-0 text-slate-400">
                          {g.divisionName ? (
                            <>
                              <span className="font-medium">{g.divisionName}</span>
                              {g.groupNumber !== undefined && <span className="ml-1">· Poule {g.groupNumber}</span>}
                              {teamNameOf(g.groupId) && <span className="ml-1">— {teamNameOf(g.groupId)}</span>}
                            </>
                          ) : (
                            <>Groupe {g.groupId}</>
                          )}
                        </span>
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          {GROUP_ERROR_LABELS[g.error] ?? g.error}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 text-slate-800">
                          <span className="font-medium">{g.divisionName}</span>
                          <span className="ml-1 text-slate-500">· Poule {g.groupNumber}</span>
                          {teamNameOf(g.groupId) && (
                            <span className="ml-1 text-slate-500">— {teamNameOf(g.groupId)}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {plural(g.rounds ?? 0, 'journée')} · {g.newGames ?? 0} {(g.newGames ?? 0) > 1 ? 'nouveaux matchs' : 'nouveau match'}
                          {g.existingGames ? ` · ${g.existingGames} déjà présent${g.existingGames > 1 ? 's' : ''}` : ''}
                          {g.dateMismatches ? (
                            <span className="text-amber-700">
                              {` · ${g.dateMismatches} à une autre date`}
                            </span>
                          ) : null}
                          {g.obsoleteGames ? (
                            <span className="text-red-700">
                              {` · ${g.obsoleteGames} plus au calendrier`}
                            </span>
                          ) : null}
                          {g.departingTeams ? (
                            <span className="text-red-700">
                              {` · ${plural(g.departingTeams, 'équipe')} sortie${g.departingTeams > 1 ? 's' : ''}`}
                            </span>
                          ) : null}
                          {g.ffttIdsToLink ? ` · ${g.ffttIdsToLink} à relier à la FFTT` : ''}
                          {g.newTeams ? ` · ${plural(g.newTeams, 'adversaire')} à créer` : ''}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {mismatchTotal > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={updateDates}
                    onChange={(e) => setUpdateDates(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  />
                  <span className="text-sm text-amber-900">
                    Reprendre les dates de la FFTT pour {plural(mismatchTotal, 'match')} déjà
                    {mismatchTotal > 1 ? ' présents' : ' présent'}.
                    <span className="mt-0.5 block text-xs text-amber-800">
                      Décoché, les dates enregistrées sont conservées — un calendrier importé
                      depuis un fichier indique le vrai créneau, là où la FFTT publie une date
                      de week-end théorique.
                    </span>
                  </span>
                </label>
              )}
              {hasPoolChange && (
                <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={removeObsolete}
                    onChange={(e) => setRemoveObsolete(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  />
                  <span className="text-sm text-red-900">
                    Supprimer ce que la poule ne contient plus
                    {obsoleteTotal > 0 ? ` : ${plural(obsoleteTotal, 'match')}` : ''}
                    {departingTotal > 0
                      ? `${obsoleteTotal > 0 ? ' et' : ' :'} ${plural(departingTotal, 'équipe')}`
                      : ''}.
                    <span className="mt-0.5 block text-xs text-red-800">
                      À cocher quand la poule a été modifiée en cours de saison — un forfait,
                      un repêchage, un calendrier réédité. Les disponibilités et compositions
                      des matchs supprimés le sont aussi.
                      {obsoleteManualTotal > 0
                        ? ` Dont ${plural(obsoleteManualTotal, 'match')} dont le créneau avait été fixé à la main.`
                        : ''}
                      {' '}Les équipes sorties de la poule ne sont pas supprimées : elles en
                      sont seulement retirées.
                    </span>
                  </span>
                </label>
              )}
              {preview.totals.newTeams > 0 && (
                <p className="text-sm text-slate-600">
                  Les équipes adverses manquantes ({preview.totals.newTeams}
                  {preview.totals.newClubs > 0
                    ? `, dont ${preview.totals.newClubs} ${preview.totals.newClubs > 1 ? 'nouveaux clubs' : 'nouveau club'}`
                    : ''})
                  seront créées automatiquement, sans effectif ni lieu de jeu.
                </p>
              )}
              {importError && (
                <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
              )}
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !hasWork}
                className={`w-full disabled:opacity-50 ${PRIMARY_BUTTON_CLASS}`}
              >
                {importing
                  ? 'Import…'
                  : totalNewGames > 0
                    ? `Importer ${plural(totalNewGames, 'match')}`
                    : willUpdateDates
                      ? `Mettre à jour ${plural(mismatchTotal, 'date')}`
                      : linkTotal > 0
                        ? `Relier ${plural(linkTotal, 'match')} à la FFTT`
                        : willRemoveObsolete
                          ? 'Mettre la poule à jour'
                          : 'Rien à importer'}
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
