import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Club } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { PageHeader } from '@/components/PageHeader'
import { ImportIcon, PlusIcon } from '@/components/icons'
import { HeaderAction, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { RowActions, ACTIONS_HEADER, ACTIONS_CELL } from '@/components/RowActions'
import { ImportClubModal } from '@/components/ImportClubModal'
import { useConfirm } from '@/components/useConfirm'
import { clubsMissingVenue, type VenueFillResult } from '@/lib/clubVenues'
import { FFTT_FEDERATION_ID, clubAffiliations, clubIsIn, federationOptionLabel } from '@/lib/federations'

const emptyForm = { federationId: FFTT_FEDERATION_ID, affiliationNumber: '', displayName: '' }

export function ClubsPage() {
  const navigate = useNavigate()
  const { clubs, federations, addClub, archiveClub, updateClub, deleteClub, teams, players } = useAppData()
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [confirm, confirmDialog] = useConfirm()

  const activeClubs = clubs.filter((c) => !c.isArchived)
  const archivedClubs = clubs.filter((c) => c.isArchived)
  // One federation at a time (#643), in the URL so the back button from a
  // club's page returns to the same list. Unknown or absent: every club.
  const [searchParams, setSearchParams] = useSearchParams()
  const federationFilter = federations.some((f) => f.id === searchParams.get('federation'))
    ? searchParams.get('federation')
    : null
  const setFederationFilter = (id: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('federation', id)
      else next.delete('federation')
      return next
    }, { replace: true })
  const visibleClubs = (showArchived ? clubs : activeClubs)
    .filter((c) => !federationFilter || clubIsIn(c, federationFilter))
  const shortName = (id: string) => federations.find((f) => f.id === id)?.shortName ?? id.toUpperCase()

  const openEdit = (club: Club) => {
    navigate(`/clubs/${encodeURIComponent(club.id)}`)
  }

  const openCreate = () => {
    setCreating(true)
    setForm(emptyForm)
  }

  const handleSave = () => {
    if (creating) {
      // A club created for another federation has no FFTT number at all —
      // Landser ASL plays the AGR alone (#643).
      const { federationId, affiliationNumber, displayName } = form
      const inFftt = federationId === FFTT_FEDERATION_ID
      addClub({
        displayName, isArchived: false, addresses: [], channels: [],
        affiliationNumber: inFftt ? affiliationNumber.trim() : '',
        affiliations: inFftt ? [] : [{ federationId, affiliationNumber: affiliationNumber.trim() }],
      })
      setCreating(false)
    }
  }

  const handleArchive = async (club: Club) => {
    if (await confirm({ title: `Archiver le club "${club.displayName}" ?`, message: `Il ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archiveClub(club.id)
    }
  }

  const handleActivate = (club: Club) => {
    updateClub(club.id, { isArchived: false })
  }

  const clubHasDependents = (club: Club) =>
    teams.some((t) => t.clubId === club.id) || players.some((p) => p.clubId === club.id)

  const handleDelete = async (club: Club) => {
    if (clubHasDependents(club)) return
    if (await confirm({ title: `Supprimer définitivement le club "${club.displayName}" ?`, message: `Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deleteClub(club.id)
    }
  }

  const closeCreateModal = () => {
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Clubs"
        actions={
          <>
            <HeaderAction variant="secondary" icon={<PlusIcon />} label="Ajouter un club" onClick={openCreate} />
            <HeaderAction icon={<ImportIcon />} label="Importer depuis la FFTT" onClick={() => setImportOpen(true)} />
          </>
        }
      />
      <VenueBackfill />
      {federations.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="clubs-federation" className="text-sm text-slate-600">Fédération</label>
          <select
            id="clubs-federation"
            value={federationFilter ?? ''}
            onChange={(e) => setFederationFilter(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 md:min-h-0 md:py-1.5 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          >
            <option value="">Toutes</option>
            {federations.map((f) => <option key={f.id} value={f.id}>{f.shortName}</option>)}
          </select>
        </div>
      )}
      {archivedClubs.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les clubs archivés ({archivedClubs.length})
          </span>
        </label>
      )}
      {/* overflow-x-auto, not overflow-hidden: the corners still round off, but
          anything wider than the phone stays reachable by scrolling the table
          rather than being clipped out of existence (#305). */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Affiliations
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Nom
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Lieux de jeu
              </th>
              <th scope="col" className={`px-4 py-3 text-right text-sm font-medium text-slate-700 ${ACTIONS_HEADER}`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {visibleClubs.map((club) => (
              <tr key={club.id} className={`hover:bg-slate-50/50 ${club.isArchived ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm text-slate-900">
                  {/* One line per federation, each tagged (#643). */}
                  {clubAffiliations(club).map((a) => (
                    <span key={a.federationId} className="block whitespace-nowrap">
                      {federations.length > 1 && (
                        <span className="mr-1.5 inline-block w-11 rounded bg-slate-100 py-0.5 text-center text-xs font-medium text-slate-600">
                          {shortName(a.federationId)}
                        </span>
                      )}
                      <span className="font-mono">{a.affiliationNumber || '—'}</span>
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {club.displayName}
                  {club.isArchived && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      Archivé
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {(club.addresses ?? []).map((a) => a.label).join(', ') || '—'}
                </td>
                <td className={`px-4 py-3 text-right ${ACTIONS_CELL}`}>
                  <RowActions
                    label={`Actions — ${club.displayName}`}
                    actions={[
                      { label: 'Modifier', onClick: () => openEdit(club) },
                      !club.isArchived && {
                        label: 'Archiver',
                        tone: 'danger',
                        onClick: () => handleArchive(club),
                      },
                      club.isArchived && {
                        label: 'Activer',
                        tone: 'success',
                        onClick: () => handleActivate(club),
                      },
                      club.isArchived && {
                        label: 'Supprimer',
                        tone: 'danger',
                        onClick: () => handleDelete(club),
                        disabled: clubHasDependents(club),
                        title: clubHasDependents(club) ? 'Ce club a des équipes ou des joueurs rattachés : archivez-le plutôt que de le supprimer.' : undefined,
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {visibleClubs.length === 0 && federationFilter && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                  Aucun club affilié à la {shortName(federationFilter)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <ModalShell
          onClose={closeCreateModal}
          labelledBy="create-club-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h2 id="create-club-title" className="font-display text-lg font-semibold text-slate-800">
              Ajouter un club
            </h2>
            <div className="mt-4 space-y-4">
              {federations.length > 1 && (
                <div>
                  <label htmlFor="create-federation" className="block text-sm font-medium text-slate-700">
                    Fédération
                  </label>
                  <select
                    id="create-federation"
                    value={form.federationId}
                    onChange={(e) => setForm((f) => ({ ...f, federationId: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    {federations.map((f) => (
                      <option key={f.id} value={f.id}>{federationOptionLabel(f)}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Les autres fédérations du club s'ajoutent ensuite, sur sa fiche.
                  </p>
                </div>
              )}
              <div>
                <label
                  htmlFor="create-affiliationNumber"
                  className="block text-sm font-medium text-slate-700"
                >
                  N° affiliation
                  {federations.length > 1 && ` ${federations.find((f) => f.id === form.federationId)?.shortName ?? ''}`}
                </label>
                <input
                  id="create-affiliationNumber"
                  type="text"
                  value={form.affiliationNumber}
                  onChange={(e) => setForm((f) => ({ ...f, affiliationNumber: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label
                  htmlFor="create-displayName"
                  className="block text-sm font-medium text-slate-700"
                >
                  Nom
                </label>
                <input
                  id="create-displayName"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className={NEUTRAL_BUTTON_CLASS}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={PRIMARY_BUTTON_CLASS}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {importOpen && <ImportClubModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * Fills the clubs the imports created bare with the hall FFTT publishes for
 * each (#613). The imports do it themselves for what they create from now
 * on; this is for the clubs created before, and for any FFTT did not answer
 * the first time. It only ever fills a blank, so running it twice is harmless.
 *
 * A strip that says how many are missing rather than a third header action:
 * it is only there while there is something to do.
 */
function VenueBackfill() {
  const { clubs, fillMissingClubVenues } = useAppData()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<VenueFillResult | null>(null)
  const missing = clubsMissingVenue(clubs)

  const run = async () => {
    setResult(null)
    setProgress({ done: 0, total: missing.length })
    const r = await fillMissingClubVenues(missing, (done, total) => setProgress({ done, total }))
    setProgress(null)
    setResult(r)
  }

  if (!progress && !result && missing.length === 0) return null

  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {progress
          ? `Lecture de la FFTT… ${progress.done} / ${progress.total}`
          : result
            ? [
                plural(result.filled, 'adresse ajoutée', 'adresses ajoutées'),
                result.noInfo ? plural(result.noInfo, 'club sans salle à la FFTT', 'clubs sans salle à la FFTT') : '',
                result.failed ? plural(result.failed, 'échec', 'échecs') : '',
              ].filter(Boolean).join(' · ')
            : `${plural(missing.length, 'club n\'a', 'clubs n\'ont')} aucune adresse — la FFTT publie la salle de chacun.`}
      </p>
      {!progress && missing.length > 0 && (
        <button type="button" onClick={run} className={`${NEUTRAL_BUTTON_CLASS} shrink-0`}>
          Compléter depuis la FFTT
        </button>
      )}
    </div>
  )
}
