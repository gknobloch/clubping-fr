import { useMemo, useState } from 'react'
import { nextId, useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { PlayerImportPreview } from '@/components/PlayerImportPreview'
import { extractPdfScheduleLines } from '@/lib/pdfScheduleText'
import { isAgrPlayerList, parseAgrPlayerListLines } from '@/lib/agrPlayerList'
import {
  buildImportRows, defaultImportSelection, fieldKey, importCandidates, personCandidates, playerImportWrites, writableFields,
  type FfttLicence, type ImportFederation,
} from '@/lib/ffttPlayers'
import { activePhaseOf, clubAffiliations } from '@/lib/federations'

/**
 * Import an AGR club's player list from its PDF (#648) — the « Liste des
 * joueurs » the AGR publishes: licence, name, classement.
 *
 * The review is the FFTT's (#384, #566), given the federation: a member is
 * matched on their AGR licence, a namesake is offered and never fused, the
 * classement is filed under the AGR's active phase, and a person who exists
 * keeps their name — the FFTT and the AGR spell them differently (#655).
 * Someone licensed FFTT at Rixheim and AGR at Landser is two club profiles of
 * one person: this list creates or corrects the Landser one.
 */
export function ImportFederationPlayersModal({
  clubId, federationId, onClose,
}: {
  clubId: string
  federationId: string
  onClose: () => void
}) {
  const {
    clubs, phases, federations = [], players, users = [], playerPhasePoints,
    addPlayer, updatePlayer, setPlayerPhasePoints, addProfileInClub,
  } = useAppData()
  const club = clubs.find((c) => c.id === clubId)
  const federation = federations.find((f) => f.id === federationId)
  const importFederation: ImportFederation = { id: federationId, shortName: federation?.shortName ?? federationId }
  const affiliation = club ? clubAffiliations(club).find((a) => a.federationId === federationId) : undefined
  const phase = activePhaseOf(phases, federationId)

  const [licences, setLicences] = useState<FfttLicence[]>([])
  const [unread, setUnread] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState<Map<string, string>>(new Map())
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; updated: number; failed: string[] } | null>(null)
  const [applying, setApplying] = useState(false)

  const candidates = useMemo(() => importCandidates(users, clubId, importFederation), [users, clubId, federationId]) // eslint-disable-line react-hooks/exhaustive-deps
  // People of other clubs (#731): the FFTT licensee at Rixheim this list names.
  const persons = useMemo(() => personCandidates(users, clubs, clubId, importFederation), [users, clubs, clubId, federationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const build = (forLicences: FfttLicence[], links: Map<string, string>) =>
    buildImportRows(forLicences, players, playerPhasePoints, phase?.id ?? '', candidates, [], undefined, links, importFederation, persons)
  const rows = useMemo(
    () => build(licences, confirmed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [licences, confirmed, players, playerPhasePoints, phase?.id, candidates, persons],
  )

  async function read(file: File) {
    setReading(true)
    setError(null)
    setDone(null)
    try {
      const lines = await extractPdfScheduleLines(file)
      if (!isAgrPlayerList(lines)) {
        setError(lines.length
          ? 'Ce fichier n’est pas une liste de joueurs de l’AGR.'
          : 'Ce PDF n’a pas de texte lisible : il faut la liste exportée par l’AGR, pas une photo.')
        return
      }
      const list = parseAgrPlayerListLines(lines)
      if ('error' in list) { setError(list.error); return }
      // A club imports its own list: another club's would move its licensees here.
      if (affiliation?.affiliationNumber && list.affiliationNumber && list.affiliationNumber !== affiliation.affiliationNumber) {
        setError(`Cette liste est celle de ${list.clubName} (n° ${list.affiliationNumber}), pas de ${club?.displayName}.`)
        return
      }
      setLicences(list.licences)
      setUnread(list.unread)
      setConfirmed(new Map())
      setSelected(defaultImportSelection(build(list.licences, new Map())))
    } catch {
      setError('Impossible de lire ce fichier.')
    } finally {
      setReading(false)
    }
  }

  const toggleField = (licence: string, key: string) => setSelected((prev) => {
    const next = new Set(prev)
    const k = `${licence}:${key}`
    if (next.has(k)) next.delete(k)
    else next.add(k)
    return next
  })

  const toggleRow = (licence: string, checked: boolean) => {
    const row = rows.find((r) => r.licence.licence === licence)
    if (!row) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const f of writableFields(row.fields)) {
        if (checked) next.add(fieldKey(licence, f.key))
        else next.delete(fieldKey(licence, f.key))
      }
      return next
    })
  }

  // Accepting a namesake turns a creation into a correction: the licence line
  // only becomes writable then, so the row's ticks are re-taken (#566).
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

  async function apply() {
    if (!phase) return
    const writes = playerImportWrites(rows, selected, {
      clubId, phaseId: phase.id, newId: () => nextId('player'), federationId,
    })
    // A profile on a person of another club is awaited (#731): the API may
    // refuse it — one already there —, and its classement must not land on
    // a profile that was never written.
    setApplying(true)
    const results = await Promise.all(writes.profiles.map(async (p) => ({
      p, r: await addProfileInClub(p.sourceId, { id: p.id, clubId: p.clubId, licenseNumber: p.licenseNumber, licences: p.licences }),
    })))
    setApplying(false)
    const failedIds = new Set(results.filter(({ r }) => !r.ok).map(({ p }) => p.id))
    const failed = results.filter(({ r }) => !r.ok)
      .map(({ p, r }) => `${rows.find((row) => row.join?.sourceId === p.sourceId)?.join?.name ?? p.sourceId} : ${r.ok ? '' : r.message}`)
    for (const c of writes.creates) {
      addPlayer({
        id: c.id, firstName: c.firstName, lastName: c.lastName, licenseNumber: c.licenseNumber,
        licences: c.licences, email: '', phone: '', status: 'active', clubId: c.clubId,
      })
    }
    for (const u of writes.updates) updatePlayer(u.id, u.patch)
    setPlayerPhasePoints(writes.points.filter((pt) => !failedIds.has(pt.playerId)))
    setLicences([])
    setSelected(new Set())
    setConfirmed(new Map())
    setDone({ created: writes.created - failedIds.size, updated: writes.updated, failed })
  }

  return (
    <ModalShell onClose={onClose} labelledBy="import-federation-players-title">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        <h2 id="import-federation-players-title" className="font-display text-lg font-semibold text-slate-800">
          Importer la liste des joueurs {federation?.shortName ?? ''}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {club?.displayName}{affiliation?.affiliationNumber ? ` · n° ${affiliation.affiliationNumber}` : ''}
          {phase ? ` · classement sur ${phase.displayName}` : ''}
        </p>

        <div className="mt-4 space-y-4">
          {!phase && (
            <p role="alert" className="text-sm text-red-600">
              Aucune phase active pour cette fédération : l’administrateur général la crée d’abord.
            </p>
          )}
          <label className="flex min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 hover:border-accent-400 hover:text-accent-600">
            <span>{reading ? 'Lecture…' : 'Choisir le PDF de la liste des joueurs…'}</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={reading || !phase}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void read(file)
                e.target.value = ''
              }}
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {done && (
            <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {done.created} joueur{done.created > 1 ? 's' : ''} créé{done.created > 1 ? 's' : ''} · {done.updated} mis à jour.
            </p>
          )}
          {done && done.failed.length > 0 && (
            <p role="alert" className="text-sm text-red-600">
              Non ajouté{done.failed.length > 1 ? 's' : ''} : {done.failed.join(' ; ')}
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <p>{rows.length} licence{rows.length > 1 ? 's' : ''}</p>
                <p>{selected.size} champ{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}</p>
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
              {unread.length > 0 && (
                <p role="alert" className="text-sm text-amber-800">
                  Lignes non lues : {unread.join(' ; ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => void apply()}
                disabled={selected.size === 0 || applying}
                className={`w-full ${PRIMARY_BUTTON_CLASS}`}
              >
                Importer la sélection
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>Fermer</button>
        </div>
      </div>
    </ModalShell>
  )
}
