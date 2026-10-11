import { useMemo, useState } from 'react'
import { useAppData, type FederationScheduleImportSummary } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { extractPdfScheduleLines } from '@/lib/pdfScheduleText'
import { isAgrScheduleDocument, parseAgrScheduleLines, type AgrScheduleDocument } from '@/lib/agrScheduleDocument'
import { matchFederationClub } from '@/lib/federationClubMatch'
import { phasesOfFederation } from '@/lib/federations'
import { localPhaseId, ffttPhaseIdForName } from '@/lib/ffttPhases'
import { orderPhases } from '@/lib/phases'

const SELECT_CLASS =
  'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Import a poule calendar of a federation without an API (#647) — the AGR's
 * « Calendrier de 1ère Phase » PDF. Read in the browser, reviewed here, written
 * by `POST /federation-schedules/import`.
 *
 * The review asks what the PDF cannot say: the phase and the competition it
 * belongs to, how many play a match (three in Division 2, four elsewhere), and
 * which club each name is — found by name where the app already knows it, to
 * create bare otherwise. A club admin's own club must be among them: the poule
 * is theirs to build only because they play in it.
 */
export function ImportFederationCalendarModal({
  federationId, viewerClubId, onClose,
}: {
  federationId: string
  /** A club admin's club — absent for the general admin. */
  viewerClubId?: string
  onClose: () => void
}) {
  const { clubs, phases, seasons, competitions, divisions, federations = [], importFederationSchedule } = useAppData()
  const federation = federations.find((f) => f.id === federationId)
  const [doc, setDoc] = useState<AgrScheduleDocument | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phaseId, setPhaseId] = useState('')
  const [competitionId, setCompetitionId] = useState('')
  const [playersPerGame, setPlayersPerGame] = useState(4)
  const [secondPhase, setSecondPhase] = useState<'' | 'return_leg' | 'new_groups'>('')
  const [clubIds, setClubIds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<FederationScheduleImportSummary | null>(null)

  const fedPhases = useMemo(() => orderPhases(phasesOfFederation(phases, seasons, federationId)), [phases, seasons, federationId])
  const fedCompetitions = useMemo(
    () => competitions.filter((c) => c.federationId === federationId && !c.isArchived),
    [competitions, federationId],
  )
  // The clubs a name may be attached to: those of the federation, by name.
  const fedClubs = useMemo(
    () => clubs
      .filter((c) => !c.isArchived && (c.affiliations ?? []).some((a) => a.federationId === federationId))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr')),
    [clubs, federationId],
  )

  async function read(file: File) {
    setReading(true)
    setError(null)
    try {
      const lines = await extractPdfScheduleLines(file)
      if (!isAgrScheduleDocument(lines)) {
        setError(lines.length
          ? 'Ce fichier n’est pas un calendrier de poule de l’AGR.'
          : 'Ce PDF n’a pas de texte lisible : il faut le calendrier exporté par l’AGR, pas une photo.')
        return
      }
      const parsed = parseAgrScheduleLines(lines)
      if ('error' in parsed) { setError(parsed.error); return }
      setDoc(parsed)
      // The phase its header names, when the general admin has created it.
      const named = fedPhases.find((p) => p.id === localPhaseId(`${federationId}-${parsed.seasonEndYear - 2000}`, parsed.phaseNumber))
        ?? fedPhases.find((p) => ffttPhaseIdForName(p.name) === String(parsed.phaseNumber))
      setPhaseId(named?.id ?? fedPhases[fedPhases.length - 1]?.id ?? '')
      const championship = key(parsed.championship.replace(/^championnat\s*/i, ''))
      setCompetitionId((fedCompetitions.find((c) => championship && key(c.displayName).includes(championship)) ?? fedCompetitions[0])?.id ?? '')
      setPlayersPerGame(/division\s*2\b/i.test(parsed.division) ? 3 : 4)
      // What phase 2 is (#649): what the division already says, else what the
      // calendar's notes say — the AGR writes « phase retour » when it is one.
      const known = divisions.find((d) => d.phaseId === named?.id && key(d.displayName) === key(parsed.division))?.secondPhase
      setSecondPhase(known ?? (parsed.notes.some((n) => /\bretour\b/i.test(n)) ? 'return_leg' : ''))
      setClubIds(Object.fromEntries(parsed.clubs.map((name) => [name, matchFederationClub(name, clubs, federationId)?.id ?? ''])))
    } catch {
      setError('Impossible de lire ce fichier.')
    } finally {
      setReading(false)
    }
  }

  const matchCount = doc?.journees.reduce((n, j) => n + j.matches.length, 0) ?? 0
  const ownClubMissing = !!doc && !!viewerClubId && !Object.values(clubIds).includes(viewerClubId)
  const canImport = !!doc && !!phaseId && !!competitionId && !ownClubMissing && !saving

  async function submit() {
    if (!doc || !canImport) return
    setSaving(true)
    setError(null)
    const result = await importFederationSchedule({
      federationId, phaseId, competitionId, division: doc.division, poolNumber: doc.poolNumber,
      playersPerGame, notes: doc.notes,
      ...(doc.phaseNumber === 1 && secondPhase ? { secondPhase } : {}),
      clubs: doc.clubs.map((name) => ({ name, clubId: clubIds[name] || null })),
      journees: doc.journees,
    })
    setSaving(false)
    if (result.ok) setDone(result.summary)
    else setError(result.message)
  }

  return (
    <ModalShell onClose={onClose} labelledBy="import-federation-calendar-title">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-federation-calendar-title" className="font-display text-lg font-semibold text-slate-800">
          Importer un calendrier {federation?.shortName ?? ''}
        </h2>

        {done ? (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p role="status">
              {done.created.group ? 'Poule créée' : 'Poule retrouvée'} : {done.created.teams} équipe(s), {done.created.matchDays} journée(s)
              et {done.created.games} rencontre(s) ajoutées{done.created.clubs ? `, ${done.created.clubs} club(s) créé(s)` : ''}
              {done.updatedGames ? ` ; ${done.updatedGames} rencontre(s) mise(s) à jour` : ''}.
            </p>
            {!done.created.teams && !done.created.games && !done.updatedGames && (
              <p className="text-slate-500">Rien de nouveau : ce calendrier était déjà importé.</p>
            )}
            {done.returnLeg ? (
              <p>
                Phase retour préparée en phase 2 : {done.returnLeg.matchDays} journée(s) et {done.returnLeg.games} rencontre(s)
                ajoutées, dates à confirmer jusqu’au calendrier de la phase 2.
              </p>
            ) : secondPhase === 'return_leg' && doc?.phaseNumber === 1 ? (
              <p className="text-slate-500">La phase retour sera préparée dès que la phase 2 sera créée.</p>
            ) : null}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={PRIMARY_BUTTON_CLASS}>Fermer</button>
            </div>
          </div>
        ) : !doc ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-500">
              Le PDF d’une poule tel que l’AGR l’envoie (« Calendrier de 1ère Phase »). Vous vérifierez la
              phase, la compétition et les clubs avant d’importer.
            </p>
            <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-accent-400 hover:text-accent-600">
              <span>{reading ? 'Lecture…' : 'Choisir le PDF du calendrier…'}</span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={reading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void read(file)
                  e.target.value = ''
                }}
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="font-medium text-slate-800">
                {doc.division} · Poule {doc.poolLetter} · Phase {doc.phaseNumber}
              </p>
              <p className="text-sm text-slate-500">
                {doc.journees.length} journées (J{doc.journees[0].number} à J{doc.journees[doc.journees.length - 1].number}),
                {' '}{matchCount} rencontres, {doc.clubs.length} clubs.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="fed-cal-phase" className="block text-sm font-medium text-slate-700">Phase</label>
                <select id="fed-cal-phase" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={SELECT_CLASS}>
                  {fedPhases.length === 0 && <option value="">Aucune phase</option>}
                  {fedPhases.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fed-cal-competition" className="block text-sm font-medium text-slate-700">Compétition</label>
                <select id="fed-cal-competition" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} className={SELECT_CLASS}>
                  {fedCompetitions.length === 0 && <option value="">Aucune compétition</option>}
                  {fedCompetitions.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fed-cal-players" className="block text-sm font-medium text-slate-700">Joueurs par rencontre</label>
                <select id="fed-cal-players" value={playersPerGame} onChange={(e) => setPlayersPerGame(Number(e.target.value))} className={SELECT_CLASS}>
                  <option value={4}>4</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>
            {doc.phaseNumber === 1 && (
              <div>
                <label htmlFor="fed-cal-second-phase" className="block text-sm font-medium text-slate-700">Phase 2</label>
                <select
                  id="fed-cal-second-phase"
                  value={secondPhase}
                  onChange={(e) => setSecondPhase(e.target.value as typeof secondPhase)}
                  className={SELECT_CLASS}
                >
                  <option value="">Pas encore connue</option>
                  <option value="return_leg">Phase retour : mêmes poules, réception inversée</option>
                  <option value="new_groups">Nouvelles poules</option>
                </select>
                {secondPhase === 'return_leg' && (
                  <p className="mt-1 text-xs text-slate-500">
                    Les matchs retour sont préparés en phase 2, dates à confirmer ; le calendrier de la phase 2 les datera.
                  </p>
                )}
              </div>
            )}
            {(fedPhases.length === 0 || fedCompetitions.length === 0) && (
              <p role="alert" className="text-sm text-red-600">
                {fedPhases.length === 0 ? 'Aucune phase de cette fédération : ' : 'Aucune compétition de cette fédération : '}
                l’administrateur général la crée d’abord.
              </p>
            )}

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Clubs</legend>
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {doc.clubs.map((name, i) => (
                  <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <label htmlFor={`fed-cal-club-${i}`} className="text-sm text-slate-800">{name}</label>
                    <select
                      id={`fed-cal-club-${i}`}
                      value={clubIds[name] ?? ''}
                      onChange={(e) => setClubIds((m) => ({ ...m, [name]: e.target.value }))}
                      className="min-h-[44px] md:min-h-0 w-full sm:w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                    >
                      <option value="">Créer « {name} »</option>
                      {[...fedClubs, ...clubs.filter((c) => c.id === clubIds[name] && !fedClubs.includes(c))].map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              {ownClubMissing && (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  Votre club doit figurer dans ce calendrier : rattachez-le au nom sous lequel l’AGR l’écrit.
                </p>
              )}
            </fieldset>

            {doc.notes.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700">Notes de la poule</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                  {doc.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </div>
            )}
            {doc.unread.length > 0 && (
              <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Lignes non lues, à saisir à la main ensuite :
                <ul className="mt-1 list-disc pl-5">{doc.unread.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>Annuler</button>
              <button type="button" onClick={() => void submit()} disabled={!canImport} className={PRIMARY_BUTTON_CLASS}>
                {saving ? 'Import…' : 'Importer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
