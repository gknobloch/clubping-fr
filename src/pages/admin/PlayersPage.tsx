import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Player as PlayerType } from '@/types'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/PageHeader'
import { ImportIcon, PlusIcon } from '@/components/icons'
import { HeaderAction, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { sortByName } from '@/lib/sortByName'
import { formatLastSeen, hasVisited, lastSeenSentence } from '@/lib/lastSeen'
import { ACTIVE_ONLY_LABEL, canSeeArchivedPlayers, visiblePlayers } from '@/lib/playerVisibility'
import {
  PLAYER_CATEGORIES, categoryDisplay, orderedCategories, type PlayerCategory,
} from '@/lib/playerCategories'
import { ModalShell } from '@/components/ModalShell'
import { Toggle } from '@/components/Toggle'
import { ImportPlayersModal } from '@/components/ImportPlayersModal'

const STATUS_LABELS: Record<PlayerType['status'], string> = {
  active: 'Actif',
  archived: 'Archivé',
}

export function PlayersPage() {
  const { user } = useAuth()
  const { players: allPlayers, clubs, updatePlayer, addPlayer } = useAppData()
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [editing, setEditing] = useState<PlayerType | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    licenseNumber: '',
    category: '',
    email: '',
    phone: '',
    birthDate: '',
    birthPlace: '',
    status: 'active' as PlayerType['status'],
    clubId: '',
  })

  const isClubAdmin = user?.role === 'club_admin'
  const hasClubScope =
    (user?.role === 'club_admin' || user?.role === 'player') && !!user?.clubId
  const userClubId = user?.clubId
  const adminClubIds = useMemo(() => (userClubId ? [userClubId] : []), [userClubId])

  const players = useMemo(() => {
    const list = hasClubScope && adminClubIds.length
      ? allPlayers.filter((p) => p.clubId && adminClubIds.includes(p.clubId))
      : allPlayers
    return sortByName(list)
  }, [allPlayers, hasClubScope, adminClubIds])

  const playersByStatus = useMemo(
    () => visiblePlayers(players, { role: user?.role, activeOnly }),
    [players, user?.role, activeOnly],
  )

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return playersByStatus
    return playersByStatus.filter(
      (p) =>
        p.lastName.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q),
    )
  }, [playersByStatus, query])

  const clubsForSelect =
    hasClubScope && adminClubIds.length
      ? clubs.filter((c) => adminClubIds.includes(c.id))
      : clubs

  const canEditPlayers = user?.role === 'general_admin' || isClubAdmin

  const scopedClub =
    hasClubScope && adminClubIds.length === 1
      ? clubs.find((c) => c.id === adminClubIds[0])
      : undefined

  // The import writes into one club, so it needs the page to be scoped to one
  // — a general admin sees every club here and has no target to import into.
  const canImport = canEditPlayers && !!scopedClub

  // Adoption (#406). `lastSeenAt` only reaches people who administer these
  // members, so the column and the count are theirs alone — for anyone else the
  // field is uniformly absent and would read as "nobody has ever signed in".
  //
  // Counted over the visible roster but not the search box: the question is how
  // far the app has spread through the club, which a half-typed name should not
  // change. Archived members are out of it by default, which is the point —
  // they are not who the club is waiting on.
  const showLastSeen = canEditPlayers
  const visitedCount = useMemo(
    () => playersByStatus.filter((p) => hasVisited(p.lastSeenAt)).length,
    [playersByStatus],
  )

  const getClubName = (clubId: string) =>
    clubs.find((c) => c.id === clubId)?.displayName ?? clubId

  const openEdit = (player: PlayerType) => {
    setEditing(player)
    setCreating(false)
    setForm({
      firstName: player.firstName,
      lastName: player.lastName,
      licenseNumber: player.licenseNumber,
      category: player.category ?? '',
      email: player.email ?? '',
      phone: player.phone ?? '',
      birthDate: player.birthDate ?? '',
      birthPlace: player.birthPlace ?? '',
      status: player.status,
      clubId: player.clubId,
    })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setForm({
      firstName: '',
      lastName: '',
      licenseNumber: '',
      category: '',
      email: '',
      phone: '',
      birthDate: '',
      birthPlace: '',
      status: 'active',
      clubId: clubsForSelect[0]?.id ?? '',
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
  }

  const handleSave = () => {
    // Sent even when empty, unlike the other optional fields: the key has to
    // reach PATCH for the API to clear a stored address (#315).
    const email = form.email.trim()
    if (editing) {
      updatePlayer(editing.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        licenseNumber: form.licenseNumber,
        category: form.category,
        email,
        phone: form.phone || undefined,
        birthDate: form.birthDate || undefined,
        birthPlace: form.birthPlace || undefined,
        status: form.status,
      })
      closeModal()
      return
    }
    if (creating && form.clubId && form.firstName && form.lastName) {
      addPlayer({
        firstName: form.firstName,
        lastName: form.lastName,
        licenseNumber: form.licenseNumber,
        category: form.category,
        email,
        phone: form.phone,
        birthDate: form.birthDate || undefined,
        birthPlace: form.birthPlace || undefined,
        status: form.status,
        clubId: form.clubId,
      })
      closeModal()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Joueurs"
        club={scopedClub}
        actions={
          canEditPlayers && (
            <>
              {/* Same order as /equipes (#229): manual add is the fallback, the
                  FFTT import is the default path — so it is the primary button
                  and comes last. Below md: the import is not offered (dense
                  comparison screen, #381/#384), which leaves the manual add
                  alone: `adaptive` gives it the filled look back at that width
                  rather than leaving the page with no filled action. */}
              <HeaderAction
                variant={canImport ? 'adaptive' : 'primary'}
                icon={<PlusIcon />}
                label="Ajouter un joueur"
                onClick={openCreate}
              />
              {canImport && (
                <HeaderAction
                  desktopOnly
                  icon={<ImportIcon />}
                  label="Importer depuis la FFTT"
                  onClick={() => setImporting(true)}
                />
              )}
            </>
          )
        }
      />
      {/* Wraps: «Joueurs actifs uniquement» plus a 256px search box does not
          fit a phone on one line, and squeezing the box is worse than a second
          row. */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom…"
          className="w-64 min-h-[44px] md:min-h-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
        />
        {/* Offered to the people who administer the club and to nobody else
            (#438): for a member the roster IS the active players, so a control
            that only ever says the same thing is a control that shouldn't be
            there. */}
        {canSeeArchivedPlayers(user?.role) && (
          <Toggle checked={activeOnly} onChange={setActiveOnly} label={ACTIVE_ONLY_LABEL} />
        )}
        {query && (
          <span className="text-sm text-slate-500">
            {filteredPlayers.length} résultat{filteredPlayers.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {/* Singular at zero as well as at one, which is the French rule and not an
          edge case here: the day the app is shared with the club, nobody has
          opened it yet and this line is the first thing it says. */}
      {showLastSeen && playersByStatus.length > 0 && (
        <p className="text-sm text-slate-500">
          {visitedCount} joueur{visitedCount > 1 ? 's' : ''} sur {playersByStatus.length}{' '}
          {visitedCount > 1 ? 'ont' : 'a'} déjà ouvert l'application.
        </p>
      )}
      {/* The table is 724px wide — «Email» alone is 280px — so below md: it is
          swapped for a card list rather than forced into a sideways scroll
          (#305). Contact details become tap-to-call / tap-to-mail links there,
          which is what they are actually for on a phone. */}
      <ul className="space-y-3 md:hidden">
        {filteredPlayers.map((player) => (
          <li
            key={player.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Link
                to={`/joueurs/${player.id}`}
                className={`flex min-w-0 flex-1 items-center gap-3 text-slate-900 ${TEXT_TARGET_CLASS}`}
              >
                <Avatar
                  playerId={player.id}
                  avatarUpdatedAt={player.avatarUpdatedAt}
                  firstName={player.firstName}
                  lastName={player.lastName}
                  size={40}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {player.firstName} {player.lastName}
                  </p>
                  {/* The visit rides on the detail line rather than a badge of
                      its own (#406). A badge sat between the name and the
                      actions and truncated the name to «Chloé Be…» on a phone,
                      which costs the list the one thing it is for; and it could
                      only say «Jamais connecté», leaving the members who HAVE
                      opened the app with no date anywhere on mobile. */}
                  {/* Wraps rather than truncates: `truncate` clips whatever
                      comes last, and the visit is last. A club admin sees one
                      line (licence · visite); a general admin, who also gets the
                      club name, gets a second line instead of losing the end of
                      the first. Caught by the "rien de rogné" check in
                      e2e/mobile-touch-targets-detail.spec.ts. */}
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{player.licenseNumber}</span>
                    {categoryDisplay(player.category) && ` · ${categoryDisplay(player.category)}`}
                    {!hasClubScope && ` · ${getClubName(player.clubId)}`}
                    {showLastSeen && (
                      <span className={hasVisited(player.lastSeenAt) ? undefined : 'text-amber-700'}>
                        {' · '}
                        {lastSeenSentence(player.lastSeenAt)}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
              {player.status !== 'active' && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {STATUS_LABELS[player.status]}
                </span>
              )}
              {/* E-mail and phone used to sit on a second row here (#379). The
                  list is for finding someone, and they were the loudest thing
                  on the card — two accent-coloured links pulling the eye off
                  the name. They stay on the player's own page, where calling
                  and writing belong. The desktop table still has both columns. */}
              {canEditPlayers && (
                <button
                  type="button"
                  onClick={() => openEdit(player)}
                  className={`shrink-0 text-sm font-medium text-accent-600 ${TEXT_TARGET_CLASS}`}
                >
                  Modifier
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden rounded-xl border border-slate-200 bg-white overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Nom
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                N° licence
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Catégorie
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Email
              </th>
              <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                Téléphone
              </th>
              {!hasClubScope && (
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                  Club
                </th>
              )}
              {showLastSeen && (
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-slate-700">
                  Dernière visite
                </th>
              )}
              <th scope="col" className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredPlayers.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 text-sm font-medium">
                  <Link
                    to={`/joueurs/${player.id}`}
                    className="flex items-center gap-3 text-slate-900 hover:text-accent-600"
                  >
                    <Avatar
                      playerId={player.id}
                      avatarUpdatedAt={player.avatarUpdatedAt}
                      firstName={player.firstName}
                      lastName={player.lastName}
                      size={32}
                    />
                    <span className="hover:underline">
                      {player.firstName} {player.lastName}
                    </span>
                    {player.status !== 'active' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {STATUS_LABELS[player.status]}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                  {player.licenseNumber}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {categoryDisplay(player.category) || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{player.email}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{player.phone || '—'}</td>
                {!hasClubScope && (
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getClubName(player.clubId)}
                  </td>
                )}
                {showLastSeen && (
                  <td
                    className={`px-4 py-3 text-sm ${
                      hasVisited(player.lastSeenAt) ? 'text-slate-600' : 'text-amber-700'
                    }`}
                  >
                    {formatLastSeen(player.lastSeenAt)}
                  </td>
                )}
                <td className="px-4 py-3 text-right">
                  {canEditPlayers && (
                    <button
                      type="button"
                      onClick={() => openEdit(player)}
                      className="text-sm font-medium text-accent-600 hover:text-accent-800"
                    >
                      Modifier
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importing && scopedClub && (
        <ImportPlayersModal clubId={scopedClub.id} onClose={() => setImporting(false)} />
      )}

      {(editing || creating) && (
        <ModalShell
          onClose={closeModal}
          labelledBy="player-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg my-8">
            <h2 id="player-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter un joueur' : 'Modifier le joueur'}
            </h2>
            <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="player-firstName" className="block text-sm font-medium text-slate-700">Prénom</label>
                  <input
                    id="player-firstName"
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="player-lastName" className="block text-sm font-medium text-slate-700">Nom</label>
                  <input
                    id="player-lastName"
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="player-licenseNumber" className="block text-sm font-medium text-slate-700">N° licence</label>
                <input
                  id="player-licenseNumber"
                  type="text"
                  value={form.licenseNumber}
                  onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label htmlFor="player-category" className="block text-sm font-medium text-slate-700">
                  Catégorie
                </label>
                <select
                  id="player-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                >
                  {/* The import fills this in from the licence; the picker is
                      for a licensee created by hand, and for the rare code FFTT
                      sends that we do not recognise (#482). */}
                  <option value="">Inconnue</option>
                  {orderedCategories().map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                  {form.category && !PLAYER_CATEGORIES.includes(form.category as PlayerCategory) && (
                    <option value={form.category}>{form.category} (code FFTT)</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="player-email" className="block text-sm font-medium text-slate-700">Email (optionnel)</label>
                <input
                  id="player-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label htmlFor="player-phone" className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input
                  id="player-phone"
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="player-birthDate" className="block text-sm font-medium text-slate-700">
                    Date de naissance (optionnel)
                  </label>
                  <input
                    id="player-birthDate"
                    type="text"
                    value={form.birthDate}
                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                    placeholder="JJ/MM/AAAA"
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="player-birthPlace" className="block text-sm font-medium text-slate-700">
                    Lieu de naissance (optionnel)
                  </label>
                  <input
                    id="player-birthPlace"
                    type="text"
                    value={form.birthPlace}
                    onChange={(e) => setForm((f) => ({ ...f, birthPlace: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
              </div>
              {(creating || editing) && (
                <div>
                  <label htmlFor="player-status" className="block text-sm font-medium text-slate-700">Statut</label>
                  <select
                    id="player-status"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as PlayerType['status'] }))
                    }
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    {(Object.entries(STATUS_LABELS) as [PlayerType['status'], string][]).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}
              {creating && clubsForSelect.length > 0 && (
                <div>
                  <label htmlFor="player-clubId" className="block text-sm font-medium text-slate-700">Club</label>
                  <select
                    id="player-clubId"
                    value={form.clubId}
                    onChange={(e) => setForm((f) => ({ ...f, clubId: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    {clubsForSelect.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className={NEUTRAL_BUTTON_CLASS}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  !form.firstName ||
                  !form.lastName ||
                  (creating && !form.clubId)
                }
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
