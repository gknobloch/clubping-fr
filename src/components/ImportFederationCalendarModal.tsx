import { useMemo, useState } from 'react'
import { useAppData, type FederationScheduleImportSummary } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { extractPdfScheduleLines } from '@/lib/pdfScheduleText'
import { isAgrScheduleDocument, parseAgrScheduleLines, type AgrScheduleDocument } from '@/lib/agrScheduleDocument'
import { matchFederationClub } from '@/lib/federationClubMatch'
import { matchDivisionName } from '@/lib/divisionNames'
import { federationOfDivision } from '@/lib/federations'
import { phasesOfFederation } from '@/lib/federations'
import { phaseIdFor, ffttPhaseIdForName } from '@/lib/ffttPhases'
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
  const { clubs, phases, seasons, competitions, divisions, federations = [], organizations = [], importFederationSchedule } = useAppData()
  const federation = federations.find((f) => f.id === federationId)
  const [doc, setDoc] = useState<AgrScheduleDocument | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phaseId, setPhaseId] = useState('')
  /** The division the poule goes in: one of the phase's, or '' to create it under the calendar's name. */
  const [divisionId, setDivisionId] = useState('')
  /** The organisation the poule is played in (#692): the Haut-Rhin or the Bas-Rhin. */
  const [organizationId, setOrganizationId] = useState('')
  const [competitionId, setCompetitionId] = useState('')
  const [playersPerGame, setPlayersPerGame] = useState(4)
  const [secondPhase, setSecondPhase] = useState<'' | 'return_leg' | 'new_groups'>('')
  const [clubIds, setClubIds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<FederationScheduleImportSummary | null>(null)

  const fedPhases = useMemo(() => orderPhases(phasesOfFederation(phases, federationId)), [phases, seasons, federationId])
  const fedCompetitions = useMemo(
    () => competitions.filter((c) => c.federationId === federationId && !c.isArchived),
    [competitions, federationId],
  )
  // The phase's divisions of this federation — what the poule may go in.
  const divisionsOf = (pid: string) => divisions
    .filter((d) => d.phaseId === pid && !d.isArchived && federationOfDivision(d, competitions) === federationId)
    .sort((a, b) => a.rank - b.rank)
  // « Prom. HONNEUR » is our « Promotion Honneur » (#647): proposed, never forced.
  const matchedDivisionId = (pid: string, name: string) => matchDivisionName(name, divisionsOf(pid))?.id ?? ''
  const changePhase = (pid: string) => {
    setPhaseId(pid)
    if (doc) setDivisionId(matchedDivisionId(pid, doc.division))
  }

  // The federation's organisations (#692), and the one this calendar is
  // presumably from: the viewer's club's, else the only one there is.
  const fedOrganizations = useMemo(
    () => organizations.filter((o) => o.federationId === federationId),
    [organizations, federationId],
  )
  const viewerOrganizationId = clubs.find((c) => c.id === viewerClubId)?.affiliations
    ?.find((a) => a.federationId === federationId)?.organizationId
  // The championship of that organisation — « Championnat du Haut-Rhin ».
  const competitionFor = (orgId: string, championship: string) => {
    const orgName = key(fedOrganizations.find((o) => o.id === orgId)?.name ?? '')
    return (orgName ? fedCompetitions.find((c) => key(c.displayName).includes(orgName)) : undefined)
      ?? fedCompetitions.find((c) => championship && key(c.displayName).includes(championship))
      ?? fedCompetitions[0]
  }
  const matchClubs = (names: readonly string[], orgId: string) =>
    Object.fromEntries(names.map((name) => [name, matchFederationClub(name, clubs, federationId, orgId || undefined)?.id ?? '']))
  const changeOrganization = (orgId: string) => {
    setOrganizationId(orgId)
    if (doc) {
      setClubIds(matchClubs(doc.clubs, orgId))
      setCompetitionId(competitionFor(orgId, key(doc.championship.replace(/^championnat\s*/i, '')))?.id ?? '')
    }
  }

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
      // The phase its header names — that season, that number — and no other:
      // a phase-2 calendar filed under phase 1 would number its journées on
      // top of phase 1's. Not there yet, nothing is chosen, and the dialog says so.
      const seasonId = String(parsed.seasonEndYear - 2000)
      const named = fedPhases.find((p) => p.id === phaseIdFor(federationId, seasonId, parsed.phaseNumber))
        ?? fedPhases.find((p) => p.seasonId === seasonId && ffttPhaseIdForName(p.name) === String(parsed.phaseNumber))
      setPhaseId(named?.id ?? '')
      setDivisionId(named ? matchedDivisionId(named.id, parsed.division) : '')
      const championship = key(parsed.championship.replace(/^championnat\s*/i, ''))
      const orgId = viewerOrganizationId ?? (fedOrganizations.length === 1 ? fedOrganizations[0].id : '')
      setOrganizationId(orgId)
      setCompetitionId(competitionFor(orgId, championship)?.id ?? '')
      setPlayersPerGame(/division\s*2\b/i.test(parsed.division) ? 3 : 4)
      // What phase 2 is (#649): what the division already says, else what the
      // calendar's notes say — the AGR writes « phase retour » when it is one.
      const known = named ? matchDivisionName(parsed.division, divisionsOf(named.id))?.secondPhase : undefined
      setSecondPhase(known ?? (parsed.notes.some((n) => /\bretour\b/i.test(n)) ? 'return_leg' : ''))
      setClubIds(matchClubs(parsed.clubs, orgId))
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
      ...(divisionId ? { divisionId } : {}),
      ...(organizationId ? { organizationId } : {}),
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

            {fedOrganizations.length > 0 && (
              <div>
                <label htmlFor="fed-cal-organization" className="block text-sm font-medium text-slate-700">Organisation</label>
                <select
                  id="fed-cal-organization"
                  value={organizationId}
                  onChange={(e) => changeOrganization(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Non précisée</option>
                  {fedOrganizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="fed-cal-phase" className="block text-sm font-medium text-slate-700">Phase</label>
                <select id="fed-cal-phase" value={phaseId} onChange={(e) => changePhase(e.target.value)} className={SELECT_CLASS}>
                  {!phaseId && <option value="">{fedPhases.length === 0 ? 'Aucune phase' : 'Choisir une phase…'}</option>}
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
            {(() => {
              // The phase the calendar is: missing, or another one chosen by hand.
              const chosen = fedPhases.find((p) => p.id === phaseId)
              const season = `${doc.seasonEndYear - 1}/${doc.seasonEndYear}`
              if (!phaseId) {
                return (
                  <p role="alert" className="text-sm text-amber-800">
                    La phase {doc.phaseNumber} {season} de l’{federation?.shortName ?? 'AGR'} n’existe pas encore :
                    l’administrateur général la crée d’abord (Phases), ou choisissez-en une autre.
                  </p>
                )
              }
              return chosen && ffttPhaseIdForName(chosen.name) !== String(doc.phaseNumber) ? (
                <p role="alert" className="text-sm text-amber-800">
                  Ce calendrier est celui de la phase {doc.phaseNumber}, pas de {chosen.displayName}.
                </p>
              ) : null
            })()}
            {phaseId && (
              <div>
                <label htmlFor="fed-cal-division" className="block text-sm font-medium text-slate-700">Division</label>
                <select
                  id="fed-cal-division"
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Créer « {doc.division} »</option>
                  {divisionsOf(phaseId).map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                </select>
                {divisionId && (
                  <p className="mt-1 text-xs text-slate-500">
                    La poule {doc.poolLetter} y sera ajoutée, ou retrouvée si elle y est déjà.
                  </p>
                )}
              </div>
            )}
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
