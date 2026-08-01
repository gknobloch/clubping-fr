import { useCallback, useState } from 'react'
import {
  useAppData, type ScheduleDocImportInput, type ScheduleDocImportResult,
} from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { extractPdfScheduleLines } from '@/lib/pdfScheduleText'
import { extractOcrScheduleLines } from '@/lib/ocrScheduleText'
import { divisionLabelScore, parseScheduleDocumentLines, type ParsedScheduleDocument } from '@/lib/ffttScheduleDocument'

type FileStatus = 'reading' | 'ready' | 'error'

interface FileEntry {
  id: string
  name: string
  status: FileStatus
  errorMessage?: string
  /** Raw extracted text lines, kept even on parse failure so the admin can see what was actually read (OCR is the likeliest failure point — see ocrScheduleText.ts). */
  extractedLines?: string[]
  parsed?: ParsedScheduleDocument
  /** Existing division id, or '' to create one from parsed.divisionLabel. */
  divisionChoice: string
  /** Existing group id, or '' to create one numbered parsed.poolNumber. */
  groupChoice: string
  seasonMissing: boolean
  mismatchWarning: string | null
}

const DIVISION_MATCH_THRESHOLD = 0.3

let nextEntryId = 0

/**
 * Import a calendar from an uploaded PDF/image instead of the live FFTT API
 * (#260). Multi-file: each file is parsed independently into its own
 * division/poule and shown as its own confirmation row — `lockedGroupId`
 * (from the per-group "Importer les matchs" flow) only pre-fills that row's
 * default division/group, it never silently overrides what the document
 * itself says; a mismatch is surfaced as a warning, not a block.
 */
export function ImportScheduleDocumentModal({
  onClose, lockedGroupId,
}: { onClose: () => void; lockedGroupId?: string }) {
  const { seasons, phases, divisions, groups, clubs, teams, importScheduleDocuments } = useAppData()

  const [entries, setEntries] = useState<FileEntry[]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(false)
  const [updateSlots, setUpdateSlots] = useState(true)
  const [imported, setImported] = useState<ScheduleDocImportResult | null>(null)

  const updateEntry = (id: string, patch: Partial<FileEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const resolveEntry = useCallback((id: string, parsed: ParsedScheduleDocument, extractedLines: string[]) => {
    const seasonMissing = !parsed.seasonId || !seasons.some((s) => s.id === parsed.seasonId)
    const phase = parsed.seasonId && parsed.phaseNumber !== null
      ? phases.find((p) => p.seasonId === parsed.seasonId && p.name === `Phase ${parsed.phaseNumber}`)
      : undefined

    const lockedGroup = lockedGroupId ? groups.find((g) => g.id === lockedGroupId) : undefined
    const lockedDivision = lockedGroup ? divisions.find((d) => d.id === lockedGroup.divisionId) : undefined

    let divisionChoice = ''
    let groupChoice = ''
    let mismatchWarning: string | null = null

    if (lockedGroup && lockedDivision) {
      divisionChoice = lockedDivision.id
      groupChoice = lockedGroup.id
      const sameNumber = lockedGroup.number === parsed.poolNumber
      const sameDivision = divisionLabelScore(parsed.divisionLabel, lockedDivision.displayName) >= DIVISION_MATCH_THRESHOLD
      if (!sameNumber || !sameDivision) {
        mismatchWarning = `Ce document correspond à « ${parsed.divisionLabel} · Poule ${parsed.poolNumber} », ` +
          `différent du groupe sélectionné (« ${lockedDivision.displayName} · Poule ${lockedGroup.number} »). ` +
          `Vérifiez avant d’importer.`
      }
    } else if (phase) {
      const candidates = divisions.filter((d) => d.phaseId === phase.id && !d.isArchived)
      let best: { id: string; score: number } | null = null
      for (const d of candidates) {
        const score = divisionLabelScore(parsed.divisionLabel, d.displayName)
        if (score >= DIVISION_MATCH_THRESHOLD && (!best || score > best.score)) best = { id: d.id, score }
      }
      if (best) {
        divisionChoice = best.id
        const group = groups.find((g) => g.divisionId === best!.id && g.number === parsed.poolNumber && !g.isArchived)
        if (group) groupChoice = group.id
      }
    }

    updateEntry(id, {
      status: 'ready', parsed, extractedLines, seasonMissing, divisionChoice, groupChoice, mismatchWarning,
    })
  }, [seasons, phases, divisions, groups, lockedGroupId])

  const handleFiles = async (files: FileList) => {
    const newEntries: FileEntry[] = [...files].map((f) => ({
      id: `sched-${nextEntryId++}`, name: f.name, status: 'reading', divisionChoice: '', groupChoice: '',
      seasonMissing: false, mismatchWarning: null,
    }))
    setEntries((prev) => [...prev, ...newEntries])
    setImported(null)
    setImportError(false)

    await Promise.all([...files].map(async (file, i) => {
      const id = newEntries[i].id
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        let lines = isPdf ? await extractPdfScheduleLines(file) : []
        if (lines.length === 0) lines = await extractOcrScheduleLines(file)
        const parsed = parseScheduleDocumentLines(lines)
        if ('error' in parsed) {
          updateEntry(id, {
            status: 'error',
            errorMessage: 'En-tête du calendrier introuvable dans ce document.',
            extractedLines: lines,
          })
          return
        }
        resolveEntry(id, parsed, lines)
      } catch {
        updateEntry(id, { status: 'error', errorMessage: 'Impossible de lire ce fichier.' })
      }
    }))
  }

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id))

  const changeDivision = (entry: FileEntry, divisionId: string) => {
    if (!entry.parsed) return
    const group = divisionId
      ? groups.find((g) => g.divisionId === divisionId && g.number === entry.parsed!.poolNumber && !g.isArchived)
      : undefined
    updateEntry(entry.id, { divisionChoice: divisionId, groupChoice: group?.id ?? '' })
  }

  const readyEntries = entries.filter((e): e is FileEntry & { parsed: ParsedScheduleDocument } =>
    e.status === 'ready' && !!e.parsed && !e.seasonMissing && e.parsed.seasonId !== null
    && e.parsed.phaseNumber !== null
    // A document the parser proved wrong is never importable (#299).
    && e.parsed.errors.length === 0)

  const buildPayload = (entry: FileEntry & { parsed: ParsedScheduleDocument }): ScheduleDocImportInput => {
    const p = entry.parsed
    return {
      seasonId: p.seasonId!,
      phaseNumber: p.phaseNumber!,
      divisionId: entry.divisionChoice || null,
      newDivisionLabel: p.divisionLabel,
      groupId: entry.groupChoice || null,
      newGroupNumber: p.poolNumber,
      teams: p.teams
        .filter((t) => t.affiliationValid)
        // The roster states each team's playing day and time (#294) — the one
        // source that actually knows them for an opponent club.
        .map((t) => ({
          name: t.name, number: t.number, affiliationNumber: t.affiliationNumber,
          day: t.day, time: t.time,
        })),
      journees: p.journees
        .filter((j) => !!j.date)
        .map((j) => ({
          number: j.number,
          date: j.date!,
          matches: j.matches.map((m) => ({
            homeName: m.homeName, homeNumber: m.homeNumber, awayName: m.awayName, awayNumber: m.awayNumber,
            // The document states each match's own day AND time (#289) — a
            // calendar is the one source that actually knows them.
            date: m.date, time: m.time,
          })),
        })),
    }
  }

  const totalMatches = readyEntries.reduce(
    (n, e) => n + e.parsed.journees.reduce((jn, j) => jn + j.matches.length, 0), 0,
  )

  const handleImport = async () => {
    setImporting(true)
    setImportError(false)
    const result = await importScheduleDocuments(readyEntries.map(buildPayload), updateSlots)
    setImporting(false)
    if (result) {
      setImported(result)
      setEntries([])
    } else {
      setImportError(true)
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

  const teamPreview = (t: ParsedScheduleDocument['teams'][number], phaseId: string | undefined) => {
    if (!t.affiliationValid) return { label: 'Numéro d’affiliation illisible — ignorée', className: 'bg-red-100 text-red-700' }
    const club = clubs.find((c) => c.affiliationNumber === t.affiliationNumber)
    if (!club) return { label: 'Nouveau club', className: 'bg-sky-100 text-sky-700' }
    const team = phaseId ? teams.find((tm) => tm.clubId === club.id && tm.number === t.number && tm.phaseId === phaseId) : undefined
    return team
      ? { label: 'Déjà présente', className: 'bg-slate-100 text-slate-500' }
      : { label: 'Nouvelle équipe', className: 'bg-sky-100 text-sky-700' }
  }

  const selectClass =
    'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="import-schedule-doc-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-schedule-doc-title" className="font-display text-lg font-semibold text-slate-800">
          Importer depuis un fichier
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          PDF ou photo d’un calendrier de poule FFTT. Chaque fichier est analysé indépendamment ; vérifiez la
          correspondance proposée avant de confirmer.
        </p>

        <div className="mt-4 space-y-4">
          {!imported && readyEntries.length > 0 && (
            <label className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="checkbox"
                checked={updateSlots}
                onChange={(e) => setUpdateSlots(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
              />
              <span className="text-sm text-slate-700">
                Mettre à jour la date et l’heure des matchs déjà présents
                <span className="mt-0.5 block text-xs text-slate-500">
                  Le document indique le vrai créneau de chaque rencontre, là où la FFTT publie une
                  date de week-end théorique. Un créneau modifié à la main n’est jamais écrasé.
                </span>
              </span>
            </label>
          )}
          {imported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
              <p className="text-sm text-green-800">
                {imported.createdGames.length === 0
                  ? 'Aucun match à importer : le calendrier est déjà à jour.'
                  : `${plural(imported.createdGames.length, 'match')} importé${imported.createdGames.length > 1 ? 's' : ''}.`}
              </p>
              {!!imported.updatedGameSlots && (
                <p className="text-sm text-green-800">
                  {plural(imported.updatedGameSlots, 'match')} recalé{imported.updatedGameSlots > 1 ? 's' : ''} sur la date et l’heure du document.
                </p>
              )}
              {!!imported.slotMismatches && (
                <p className="text-sm text-amber-700">
                  {plural(imported.slotMismatches, 'match')} déjà présent{imported.slotMismatches > 1 ? 's' : ''} à une autre date/heure, conservé{imported.slotMismatches > 1 ? 's' : ''}.
                </p>
              )}
              {(imported.createdDivisions.length > 0 || imported.createdGroups.length > 0) && (
                <p className="text-sm text-green-800">
                  {imported.createdDivisions.length > 0 && `${plural(imported.createdDivisions.length, 'division')} créée${imported.createdDivisions.length > 1 ? 's' : ''}`}
                  {imported.createdDivisions.length > 0 && imported.createdGroups.length > 0 && ', '}
                  {imported.createdGroups.length > 0 && `${plural(imported.createdGroups.length, 'groupe')} créé${imported.createdGroups.length > 1 ? 's' : ''}`}
                </p>
              )}
              {(imported.createdTeams.length > 0 || imported.createdClubs.length > 0) && (
                <p className="text-sm text-green-800">
                  {plural(imported.createdTeams.length, 'équipe')} créée{imported.createdTeams.length > 1 ? 's' : ''}
                  {imported.createdClubs.length > 0 ? ` dont ${plural(imported.createdClubs.length, 'nouveau club')}` : ''}.
                </p>
              )}
              {imported.skippedSchedules.length > 0 && (
                <p className="text-sm text-amber-700">
                  {plural(imported.skippedSchedules.length, 'fichier')} ignoré{imported.skippedSchedules.length > 1 ? 's' : ''} (saison ou division introuvable).
                </p>
              )}
              {imported.skippedMatches > 0 && (
                <div className="text-sm text-amber-700">
                  <p>
                    {plural(imported.skippedMatches, 'match')} non importé{imported.skippedMatches > 1 ? 's' : ''} : équipe non reconnue.
                  </p>
                  {imported.skippedMatchDetails.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer">Voir le détail</summary>
                      <ul className="mt-1 list-disc pl-4">
                        {imported.skippedMatchDetails.map((d, i) => (
                          <li key={i}>{d.side === 'home' ? 'Domicile' : 'Extérieur'} : « {d.name} » n° {d.number}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {!imported && (
            <>
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-accent-400 hover:text-accent-600 cursor-pointer">
                <span>Choisir un ou plusieurs fichiers (PDF, photo)…</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>

              {entries.map((entry) => {
                const p = entry.parsed
                const phase = p?.seasonId && p.phaseNumber !== null
                  ? phases.find((ph) => ph.seasonId === p.seasonId && ph.name === `Phase ${p.phaseNumber}`)
                  : undefined
                const divisionOptions = phase ? divisions.filter((d) => d.phaseId === phase.id && !d.isArchived) : []
                const groupOptions = entry.divisionChoice
                  ? groups.filter((g) => g.divisionId === entry.divisionChoice && !g.isArchived)
                  : []
                const blocked = entry.status === 'ready' && (entry.seasonMissing || !p?.seasonId || p.phaseNumber === null)

                return (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-800">{entry.name}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {entry.status === 'reading' && <span className="text-xs text-slate-500">Analyse…</span>}
                        <button type="button" onClick={() => removeEntry(entry.id)} className="text-xs text-slate-400 hover:text-red-600">
                          Retirer
                        </button>
                      </div>
                    </div>

                    {entry.status === 'error' && (
                      <div className="space-y-1">
                        <p className="text-sm text-red-600">{entry.errorMessage}</p>
                        {entry.extractedLines && entry.extractedLines.length > 0 && (
                          <details className="text-xs text-slate-400">
                            <summary className="cursor-pointer">Voir le texte extrait du document</summary>
                            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-600">
                              {entry.extractedLines.join('\n')}
                            </pre>
                          </details>
                        )}
                        {entry.extractedLines?.length === 0 && (
                          <p className="text-xs text-slate-400">
                            Aucun texte n’a pu être extrait de ce fichier (image illisible ou vide).
                          </p>
                        )}
                      </div>
                    )}

                    {entry.status === 'ready' && p && (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-600">
                          <span className="font-medium text-slate-800">{p.divisionLabel}</span> · Poule {p.poolNumber}
                          {p.phaseLabel && <span className="text-slate-400"> — {p.phaseLabel}</span>}
                        </p>

                        {entry.seasonMissing && (
                          <p className="text-sm text-amber-700">
                            La saison {p.seasonLabel} n’existe pas encore : créez-la depuis la page Saisons avant d’importer.
                          </p>
                        )}
                        {!p.seasonId || p.phaseNumber === null ? (
                          <p className="text-sm text-amber-700">
                            Phase ou saison illisible dans l’en-tête du document — import impossible.
                          </p>
                        ) : null}
                        {entry.mismatchWarning && (
                          <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{entry.mismatchWarning}</p>
                        )}

                        {!blocked && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-500">Division</label>
                              <select
                                value={entry.divisionChoice}
                                onChange={(e) => changeDivision(entry, e.target.value)}
                                className={selectClass}
                              >
                                <option value="">Nouvelle division : {p.divisionLabel}</option>
                                {divisionOptions.map((d) => (
                                  <option key={d.id} value={d.id}>{d.displayName}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500">Groupe</label>
                              <select
                                value={entry.groupChoice}
                                onChange={(e) => updateEntry(entry.id, { groupChoice: e.target.value })}
                                className={selectClass}
                              >
                                <option value="">Nouveau groupe : Poule {p.poolNumber}</option>
                                {groupOptions.map((g) => (
                                  <option key={g.id} value={g.id}>Poule {g.number}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {p.teams.map((t) => {
                            const b = teamPreview(t, phase?.id)
                            return (
                              <span key={`${t.affiliationNumber}-${t.number}`} className={`rounded px-1.5 py-0.5 text-xs ${b.className}`} title={t.name}>
                                {t.name} n° {t.number} · {b.label}
                              </span>
                            )
                          })}
                        </div>

                        <p className="text-xs text-slate-500">
                          {plural(p.journees.length, 'journée')} · {plural(p.journees.reduce((n, j) => n + j.matches.length, 0), 'match')}
                          {p.journees.some((j) => j.dateType === 'range') && ' · dates approximatives à confirmer'}
                        </p>

                        {p.errors.length > 0 && (
                          <ul className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {p.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                        {p.warnings.length > 0 && (
                          <details className="text-xs text-slate-400">
                            <summary className="cursor-pointer">{plural(p.warnings.length, 'avertissement')} de lecture</summary>
                            <ul className="mt-1 list-disc pl-4">
                              {p.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                          </details>
                        )}
                        {entry.extractedLines && entry.extractedLines.length > 0 && (
                          <details className="text-xs text-slate-400">
                            <summary className="cursor-pointer">Voir le texte extrait du document</summary>
                            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-600">
                              {entry.extractedLines.join('\n')}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {importError && (
            <p className="text-sm text-red-600">Échec de l’import, réessayez.</p>
          )}

          {!imported && entries.length > 0 && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || readyEntries.length === 0}
              className="w-full rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {importing
                ? 'Import…'
                : readyEntries.length === 0
                  ? 'Rien à importer'
                  : `Importer ${plural(totalMatches, 'match')} (${plural(readyEntries.length, 'fichier')})`}
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
