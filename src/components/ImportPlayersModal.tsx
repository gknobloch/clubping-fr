import { useMemo, useState } from 'react'
import { nextId, useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { PlayerImportPreview } from '@/components/PlayerImportPreview'
import {
  buildImportRows,
  defaultImportSelection,
  fieldKey,
  importCandidates,
  fetchClubLicencesFromBrowser,
  fetchFfttPlayerFromBrowser,
  playerImportWrites,
  playersMissingFromFftt,
  sameClubNumber,
  writableFields,
  type FfttLicence,
} from '@/lib/ffttPlayers'
import { sortByName } from '@/lib/sortByName'
import type { Player } from '@/types'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  /** The licence exists but belongs to another club. */
  | { kind: 'foreign_club'; clubName: string; clubNumber: string }
  | { kind: 'ready' }
  | { kind: 'done'; created: number; updated: number }

/**
 * FFTT player import for the Players admin page (#384): one licence at a time,
 * or a club's whole licence list. Both land in the same review — nothing is
 * written before the admin ticks it.
 *
 * Desktop only, like the other dense comparison screens (#381): the trigger is
 * not rendered below md:.
 */
export function ImportPlayersModal({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const {
    clubs, phases, players, users, playerPhasePoints, addPlayer, updatePlayer, setPlayerPhasePoints,
    playerSeasonCategories, setPlayerSeasonCategories, setClubSeasonLicences,
  } = useAppData()

  const club = clubs.find((c) => c.id === clubId)
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases],
  )
  const [phaseId, setPhaseId] = useState(
    () => phases.find((p) => p.status === 'active')?.id ?? orderedPhases[orderedPhases.length - 1]?.id ?? '',
  )
  const seasonId = phases.find((p) => p.id === phaseId)?.seasonId

  const [licenceInput, setLicenceInput] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [licences, setLicences] = useState<FfttLicence[]>([])
  const [missing, setMissing] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /**
   * Name matches the admin has confirmed: licence number → member id (#566).
   *
   * Held here rather than folded into the rows because it is an answer to a
   * question the rows ask, and it has to survive them being rebuilt.
   */
  const [confirmed, setConfirmed] = useState<Map<string, string>>(new Map())

  const clubPlayers = useMemo(
    () => players.filter((p) => p.clubId === clubId && p.status === 'active'),
    [players, clubId],
  )

  /**
   * The club's members, as candidates for a name match (#566). Every member,
   * archived ones included — this argument used to be `[]`, which is why the
   * suggestion never once appeared.
   */
  const candidates = useMemo(() => importCandidates(users, clubId), [users, clubId])

  /** The rows, rebuilt whenever a suggestion is accepted or withdrawn. */
  const build = (forLicences: FfttLicence[], links: Map<string, string>) =>
    // The category belongs to the season the chosen phase sits in (#482).
    buildImportRows(
      forLicences, players, playerPhasePoints, phaseId, candidates,
      playerSeasonCategories, seasonId, links,
    )

  const rows = useMemo(
    () => build(licences, confirmed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [licences, confirmed, players, playerPhasePoints, phaseId, candidates, playerSeasonCategories, seasonId],
  )

  /** Everything a fresh fetch replaces. */
  const showRows = (next: FfttLicence[], missingPlayers: Player[]) => {
    setLicences(next)
    setConfirmed(new Map())
    setMissing(missingPlayers)
    setSelected(defaultImportSelection(build(next, new Map())))
    setStatus({ kind: 'ready' })
  }

  /**
   * Accept or withdraw a suggested match.
   *
   * The row is rebuilt against that member, so its ticks are re-taken from the
   * new diff: accepting turns a creation into a correction, and the licence
   * line — the wrong number giving way to FFTT's — only becomes writable at
   * that moment. Carrying the old ticks over would leave it unticked, which is
   * the one field the admin just asked for.
   */
  const confirmLink = (licence: string, memberId: string | null) => {
    const next = new Map(confirmed)
    if (memberId) next.set(licence, memberId)
    else next.delete(licence)
    setConfirmed(next)
    const rebuilt = build(licences, next).find((r) => r.licence.licence === licence)
    setSelected((prev) => {
      const keep = new Set([...prev].filter((k) => !k.startsWith(`${licence}:`)))
      if (rebuilt) for (const f of writableFields(rebuilt.fields)) keep.add(fieldKey(licence, f.key))
      return keep
    })
  }

  const reset = () => {
    setLicences([])
    setConfirmed(new Map())
    setMissing([])
    setSelected(new Set())
    setStatus({ kind: 'idle' })
  }

  const searchOne = async () => {
    setStatus({ kind: 'loading' })
    setLicences([])
    setMissing([])
    const result = await fetchFfttPlayerFromBrowser(licenceInput)
    if (result === null) return setStatus({ kind: 'error' })
    if (result === 'not_found') return setStatus({ kind: 'not_found' })
    // A club admin administers one club: importing someone else's licensee
    // would quietly move them between clubs.
    if (!sameClubNumber(result.clubNumber, club?.affiliationNumber)) {
      return setStatus({ kind: 'foreign_club', clubName: result.clubName, clubNumber: result.clubNumber })
    }
    showRows([result], [])
  }

  const importClub = async () => {
    if (!club?.affiliationNumber) return
    setStatus({ kind: 'loading' })
    setLicences([])
    setMissing([])
    const fetched = await fetchClubLicencesFromBrowser(club.affiliationNumber)
    if (fetched === null) return setStatus({ kind: 'error' })
    if (fetched.length === 0) return setStatus({ kind: 'not_found' })
    // The endpoint is scoped by club number, but it is FFTT's word for it, not
    // ours — drop anything that came back for another club rather than trust it.
    const ours = fetched.filter((l) => sameClubNumber(l.clubNumber, club.affiliationNumber))
    showRows(ours, playersMissingFromFftt(ours, clubPlayers))
    // Who holds a validated licence this season is a fact about this listing,
    // not about which fields an admin then ticks — so it is recorded here, and
    // for the whole club at once, since only a club-wide fetch can say who is
    // absent from it (#488).
    if (seasonId) {
      const listed = new Set(ours.map((l) => l.licence.trim()))
      setClubSeasonLicences(
        clubId,
        seasonId,
        clubPlayers.filter((p) => listed.has((p.licenseNumber ?? '').trim())).map((p) => p.id),
      )
    }
  }

  const toggleField = (licence: string, key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const k = `${licence}:${key}`
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleRow = (licence: string, checked: boolean) => {
    const row = rows.find((r) => r.licence.licence === licence)
    if (!row) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const f of writableFields(row.fields)) {
        const k = fieldKey(licence, f.key)
        if (checked) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const selectedCount = selected.size

  const applyImport = () => {
    // The same derivation the app's import runs (#555): what the ticks amount
    // to is decided in one place, and only the writing of it differs here.
    const writes = playerImportWrites(rows, selected, {
      clubId, phaseId, seasonId, newId: () => nextId('player'),
    })
    for (const c of writes.creates) {
      // Name and licence come from FFTT; everything else is ours to fill in
      // later, since FFTT states no e-mail and no phone.
      addPlayer({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        licenseNumber: c.licenseNumber,
        email: '',
        phone: '',
        status: 'active',
        clubId: c.clubId,
      })
    }
    for (const u of writes.updates) updatePlayer(u.id, u.patch)
    setPlayerPhasePoints(writes.points)
    setPlayerSeasonCategories(writes.categories)
    setLicences([])
    setConfirmed(new Map())
    setSelected(new Set())
    setStatus({ kind: 'done', created: writes.created, updated: writes.updated })
  }

  const inputClass =
    'w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'
  const phaseName = orderedPhases.find((p) => p.id === phaseId)?.displayName ?? ''

  return (
    <ModalShell onClose={onClose} labelledBy="import-players-title">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-players-title" className="font-display text-lg font-semibold text-slate-800">
          Importer des joueurs depuis la FFTT
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {club?.displayName}
          {club?.affiliationNumber ? ` · n° ${club.affiliationNumber}` : ''}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="import-players-phase" className="block text-sm font-medium text-slate-700">
              Phase des points
            </label>
            <select
              id="import-players-phase"
              value={phaseId}
              onChange={(e) => { setPhaseId(e.target.value); reset() }}
              className={`mt-1 ${inputClass}`}
            >
              {orderedPhases.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Les points importés seront enregistrés sur cette phase.
            </p>
          </div>

          <div>
            <label htmlFor="import-players-licence" className="block text-sm font-medium text-slate-700">
              N° licence
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="import-players-licence"
                type="text"
                value={licenceInput}
                onChange={(e) => { setLicenceInput(e.target.value); reset() }}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={searchOne}
                disabled={!licenceInput || status.kind === 'loading' || !phaseId}
                className={PRIMARY_BUTTON_CLASS}
              >
                {status.kind === 'loading' ? 'Recherche…' : 'Rechercher'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">ou</span>
            <button
              type="button"
              onClick={importClub}
              disabled={!club?.affiliationNumber || status.kind === 'loading' || !phaseId}
              className={NEUTRAL_BUTTON_CLASS}
            >
              Charger tous les licenciés du club
            </button>
          </div>

          {status.kind === 'error' && (
            <p className="text-sm text-red-600">Impossible de contacter la FFTT. Réessayez plus tard.</p>
          )}
          {status.kind === 'not_found' && (
            <p className="text-sm text-slate-600">Aucun licencié trouvé.</p>
          )}
          {status.kind === 'foreign_club' && (
            <p className="text-sm text-amber-700">
              Cette licence appartient à {status.clubName || `au club n° ${status.clubNumber}`} — elle ne peut
              pas être importée dans {club?.displayName}.
            </p>
          )}
          {status.kind === 'done' && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {status.created} joueur{status.created > 1 ? 's' : ''} créé{status.created > 1 ? 's' : ''} ·{' '}
              {status.updated} mis à jour.
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {rows.length} licence{rows.length > 1 ? 's' : ''} · points sur {phaseName}
                </p>
                <p className="text-sm text-slate-500">{selectedCount} champ{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}</p>
              </div>
              <div className="max-h-[45vh] overflow-y-auto">
                <PlayerImportPreview
                  rows={rows}
                  selected={selected}
                  confirmed={confirmed}
                  onToggleField={toggleField}
                  onToggleRow={toggleRow}
                  onConfirmLink={confirmLink}
                />
              </div>
              {missing.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-medium text-slate-700">
                    Absents de la liste FFTT ({missing.length})
                  </p>
                  <p className="text-xs text-slate-500">
                    Licence non renouvelée ou départ. Rien n’est supprimé : à vous d’archiver si besoin.
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {sortByName(missing).map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={applyImport}
                disabled={selectedCount === 0}
                className={`w-full ${PRIMARY_BUTTON_CLASS}`}
              >
                Importer la sélection
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Fermer
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
