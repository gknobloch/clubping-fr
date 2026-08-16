import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Team } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { sortByName } from '@/lib/sortByName'
import { pointsFor } from '@/lib/phasePoints'
import { CaptainIcon, ClockIcon, ImportIcon, PhaseSwitchButton, PlusIcon, WhatsAppIcon } from '@/components/icons'
import { PageHeader } from '@/components/PageHeader'
import { HeaderAction, ICON_TARGET_CLASS, NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { RowActions } from '@/components/RowActions'
import { ModalShell } from '@/components/ModalShell'
import { ImportTeamsModal } from '@/components/ImportTeamsModal'
import { ImportGamesModal } from '@/components/ImportGamesModal'
import { ImportPreviousPhaseRosterModal } from '@/components/ImportPreviousPhaseRosterModal'
import { useConfirm } from '@/components/useConfirm'

export function TeamsPage() {
  const { user } = useAuth()
  const {
    teams: allTeams,
    clubs,
    phases,
    divisions,
    groups,
    players,
    playerPhasePoints,
    updateTeam,
    addTeam,
    updateGroup,
    archiveTeam,
    deleteTeam,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()

  const isClubAdmin = user?.role === 'club_admin'
  const isAdmin = user?.role === 'general_admin' || isClubAdmin
  const hasClubScope = (user?.role === 'club_admin' || user?.role === 'player') && !!user?.clubId
  const scopedClub = hasClubScope ? clubs.find((c) => c.id === user?.clubId) : undefined

  const [showArchived, setShowArchived] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importRosterOpen, setImportRosterOpen] = useState(false)
  const [importGamesFor, setImportGamesFor] = useState<Team | null>(null)

  const allVisibleTeams = useMemo(() => {
    let t = allTeams
    if (hasClubScope && user?.clubId) {
      t = t.filter((team) => team.clubId === user.clubId)
    }
    return t
  }, [allTeams, hasClubScope, user?.clubId])

  const activeTeams = useMemo(() => allVisibleTeams.filter((t) => !t.isArchived), [allVisibleTeams])
  const archivedTeams = useMemo(() => allVisibleTeams.filter((t) => t.isArchived), [allVisibleTeams])
  const teamsInScope = showArchived ? allVisibleTeams : activeTeams

  // Phase switcher — defaults to the active phase, chronological order.
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases],
  )
  const activePhase = phases.find((p) => p.status === 'active')
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const phase = phases.find((p) => p.id === phaseId) ?? activePhase ?? orderedPhases[orderedPhases.length - 1]
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  const teams = useMemo(
    () => teamsInScope.filter((t) => t.phaseId === phase?.id).sort((a, b) => a.number - b.number),
    [teamsInScope, phase],
  )

  const clubsForSelect =
    hasClubScope && user?.clubId
      ? clubs.filter((c) => c.id === user.clubId)
      : clubs
  const [editing, setEditing] = useState<Team | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    clubId: '',
    phaseId: '',
    number: 1,
    divisionId: '',
    groupId: '',
    gameLocationId: '',
    defaultDay: '',
    defaultTime: '',
    captainId: '',
    playerIds: [] as string[],
    whatsappLink: '',
    /** Card/header color; falls back to the default red when unset. */
    color: '',
  })

  const DEFAULT_TEAM_COLOR = '#e23b3b'

  const DAYS_OF_WEEK = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 9..21
  const MINUTES = ['00', '15', '30', '45']

  /** Parse "16h30" → { hour: 16, minute: '30' } */
  const parseTime = (t: string) => {
    const m = t.match(/^(\d{1,2})h(\d{2})$/)
    return m ? { hour: Number(m[1]), minute: m[2] } : null
  }
  const parsedTime = parseTime(form.defaultTime)
  const timeHour = parsedTime?.hour ?? ''
  const timeMinute = parsedTime?.minute ?? '00'

  const setTimeFromParts = (hour: string, minute: string) => {
    if (!hour) {
      setForm((f) => ({ ...f, defaultTime: '' }))
    } else {
      setForm((f) => ({ ...f, defaultTime: `${hour}h${minute}` }))
    }
  }

  const getClubName = (clubId: string) => clubs.find((c) => c.id === clubId)?.displayName ?? clubId
  const getCaptainName = (captainId: string) => {
    const p = players.find((x) => x.id === captainId)
    return p ? `${p.firstName} ${p.lastName}` : captainId
  }

  const divisionsInPhase = form.phaseId
    ? divisions.filter((d) => d.phaseId === form.phaseId)
    : []
  const groupsInDivision = form.divisionId
    ? groups.filter((g) => g.divisionId === form.divisionId)
    : []
  const selectedClub = form.clubId ? clubs.find((c) => c.id === form.clubId) : undefined
  const addressesForClub = selectedClub?.addresses ?? []
  const playersInClub = form.clubId
    ? players.filter(
        (p) => p.clubId === form.clubId && p.status === 'active' && p.clubId !== ''
      )
    : []

  /** Player IDs already assigned to another team in the same phase (excluding current team). */
  const playerIdsInOtherTeams = useMemo(() => {
    if (!form.phaseId) return new Set<string>()
    const editingId = editing?.id
    return new Set(
      allTeams
        .filter((t) => t.phaseId === form.phaseId && !t.isArchived && t.id !== editingId)
        .flatMap((t) => t.playerIds ?? [])
    )
  }, [allTeams, form.phaseId, editing?.id])

  /** Players available to add: in club, not already in this team, not in another team in the same phase. */
  const availablePlayersToAdd = sortByName(
    playersInClub.filter((p) => !form.playerIds.includes(p.id) && !playerIdsInOtherTeams.has(p.id)),
  )

  // "Importer depuis la phase précédente" (#229 follow-up): only offered when
  // editing an existing team and the chronologically-previous phase has at
  // least one non-archived team for the same club.
  const editingPhaseIndex = editing ? orderedPhases.findIndex((p) => p.id === editing.phaseId) : -1
  const previousPhase = editingPhaseIndex > 0 ? orderedPhases[editingPhaseIndex - 1] : undefined
  const editingClub = editing ? clubs.find((c) => c.id === editing.clubId) : undefined
  const previousPhaseTeams = useMemo(() => {
    if (!previousPhase || !editing) return []
    return allTeams.filter(
      (t) => t.phaseId === previousPhase.id && t.clubId === editing.clubId && !t.isArchived,
    )
  }, [allTeams, previousPhase, editing])

  const handleImportFromPreviousPhase = (patch: { captainId?: string; addPlayerIds: string[]; whatsappLink?: string; color?: string }) => {
    setForm((f) => {
      const newPlayerIds = [...f.playerIds]
      for (const pid of patch.addPlayerIds) {
        if (!newPlayerIds.includes(pid)) newPlayerIds.push(pid)
      }
      return {
        ...f,
        playerIds: newPlayerIds,
        captainId: patch.captainId ?? f.captainId,
        whatsappLink: patch.whatsappLink ?? f.whatsappLink,
        color: patch.color ?? f.color,
      }
    })
    setImportRosterOpen(false)
  }

  const openEdit = (team: Team) => {
    setEditing(team)
    setCreating(false)
    const rosterIds = team.playerIds ?? []
    setForm({
      clubId: team.clubId,
      phaseId: team.phaseId,
      number: team.number,
      divisionId: team.divisionId,
      groupId: team.groupId,
      gameLocationId: team.gameLocationId,
      defaultDay: team.defaultDay,
      defaultTime: team.defaultTime,
      captainId: team.captainId,
      playerIds: rosterIds,
      whatsappLink: team.whatsappLink ?? '',
      color: team.color ?? '',
    })
  }

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    const firstClub = clubsForSelect[0]
    const firstPhase = phases[0]
    const firstDiv = divisions.find((d) => d.phaseId === firstPhase?.id)
    const firstGroup = firstDiv ? groups.find((g) => g.divisionId === firstDiv.id) : undefined
    const defaultAddr = firstClub?.addresses?.find((a) => a.isDefault) ?? firstClub?.addresses?.[0]
    setForm({
      clubId: firstClub?.id ?? '',
      phaseId: firstPhase?.id ?? '',
      number: 1,
      divisionId: firstDiv?.id ?? '',
      groupId: firstGroup?.id ?? '',
      gameLocationId: defaultAddr?.id ?? '',
      defaultDay: 'Jeudi',
      defaultTime: '20h00',
      captainId: '',
      playerIds: [],
      whatsappLink: '',
      color: '',
    })
  }

  const closeModal = () => {
    setEditing(null)
    setCreating(false)
    setImportRosterOpen(false)
  }

  const rosterPlayers = sortByName(
    form.playerIds
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as typeof playersInClub,
  )
  const captainForSave =
    form.playerIds.length === 0
      ? ''
      : form.playerIds.includes(form.captainId)
        ? form.captainId
        : form.playerIds[0] ?? ''

  const handleSave = () => {
    if (editing) {
      updateTeam(editing.id, {
        number: form.number,
        gameLocationId: form.gameLocationId,
        defaultDay: form.defaultDay,
        defaultTime: form.defaultTime,
        playerIds: form.playerIds,
        captainId: captainForSave,
        whatsappLink: form.whatsappLink || undefined,
        color: form.color || undefined,
      })
      closeModal()
      return
    }
    if (
      !creating ||
      !form.clubId ||
      !form.phaseId ||
      !form.divisionId ||
      !form.groupId ||
      !form.gameLocationId ||
      form.playerIds.length === 0 ||
      !form.playerIds.includes(form.captainId)
    )
      return
    const newTeam = addTeam({
      clubId: form.clubId,
      phaseId: form.phaseId,
      number: form.number,
      divisionId: form.divisionId,
      groupId: form.groupId,
      gameLocationId: form.gameLocationId,
      defaultDay: form.defaultDay,
      defaultTime: form.defaultTime,
      captainId: form.captainId,
      playerIds: form.playerIds,
      whatsappLink: form.whatsappLink || undefined,
      color: form.color || undefined,
      isArchived: false,
    })
    const group = groups.find((g) => g.id === form.groupId)
    if (group) {
      updateGroup(group.id, { teamIds: [...group.teamIds, newTeam.id] })
    }
    closeModal()
  }

  const handleArchive = async (team: Team) => {
    if (await confirm({ title: `Archiver l'équipe "${getClubName(team.clubId)} ${team.number}" ?`, message: `Elle ne sera plus visible dans la liste active.`, confirmLabel: 'Archiver' })) {
      archiveTeam(team.id)
    }
  }

  const handleDelete = async (team: Team) => {
    if (await confirm({ title: `Supprimer définitivement l'équipe "${getClubName(team.clubId)} ${team.number}" ?`, message: `Les matchs, disponibilités et compositions associés seront également supprimés. Cette action est irréversible.`, confirmLabel: 'Supprimer' })) {
      deleteTeam(team.id)
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Équipes"
        club={scopedClub}
        actions={
          isAdmin && (
            <>
              {/* Manual add is the fallback; FFTT import is the default path (#229). */}
              <HeaderAction variant="secondary" icon={<PlusIcon />} label="Ajouter une équipe" onClick={openCreate} />
              <HeaderAction icon={<ImportIcon />} label="Importer depuis la FFTT" onClick={() => setImportOpen(true)} />
            </>
          )
        }
        controls={
          phase ? (
            <div className="flex h-11 items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 md:h-9">
              <PhaseSwitchButton
                dir="prev"
                disabled={phaseIndex <= 0}
                onClick={() => phaseIndex > 0 && setPhaseId(orderedPhases[phaseIndex - 1].id)}
              />
              <span className="whitespace-nowrap font-display text-sm font-semibold text-slate-800">
                Saison {phase.displayName}
              </span>
              <PhaseSwitchButton
                dir="next"
                disabled={phaseIndex >= orderedPhases.length - 1}
                onClick={() => phaseIndex < orderedPhases.length - 1 && setPhaseId(orderedPhases[phaseIndex + 1].id)}
              />
            </div>
          ) : undefined
        }
      />
      {importOpen && (
        <ImportTeamsModal
          onClose={() => setImportOpen(false)}
          lockedClubId={isClubAdmin ? user?.clubId : undefined}
        />
      )}
      {archivedTeams.length > 0 && (
        <label className="flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 md:h-4 md:w-4"
          />
          <span className="text-sm text-slate-600">
            Afficher les équipes archivées ({archivedTeams.length})
          </span>
        </label>
      )}

      {/* Team cards — up to 4 per row, responsive down to 1 on narrow viewports */}
      {teams.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Aucune équipe pour cette phase.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.map((team) => {
            const division = divisions.find((d) => d.id === team.divisionId)
            return (
              <div
                key={team.id}
                className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${team.isArchived ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Link to={`/equipes/${team.id}`} className={`flex min-w-0 flex-1 items-center gap-3 hover:opacity-80 ${TEXT_TARGET_CLASS}`}>
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                      style={{ backgroundColor: team.color ?? DEFAULT_TEAM_COLOR }}
                    >
                      {team.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-semibold text-slate-800">
                        {getClubName(team.clubId)} {team.number}
                      </p>
                      {division && <p className="truncate text-xs font-medium text-slate-500">{division.displayName}</p>}
                      {team.isArchived && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Archivé</span>
                      )}
                    </div>
                  </Link>
                  {team.whatsappLink && (
                    <a
                      href={team.whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Groupe WhatsApp"
                      aria-label="Groupe WhatsApp"
                      className={`shrink-0 text-slate-400 hover:text-slate-600 ${ICON_TARGET_CLASS}`}
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                    </a>
                  )}
                </div>

                {/* The "…" trigger at every width, beside the day/captain
                    block and centred on it. Three inline text links under the
                    body read as a section of the card rather than as a menu,
                    and they needed ~230px in a 264px column, which left the
                    info nothing at all (#389 review). */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{team.defaultDay} {team.defaultTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CaptainIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{getCaptainName(team.captainId)}</span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="shrink-0">
                    <RowActions
                      menuOnly
                      label={`Actions — ${getClubName(team.clubId)} ${team.number}`}
                      actions={[
                        !team.isArchived && { label: 'Modifier', onClick: () => openEdit(team) },
                        !team.isArchived && team.groupId && {
                          label: 'Importer les matchs',
                          onClick: () => setImportGamesFor(team),
                          desktopOnly: true,
                        },
                        !team.isArchived && {
                          label: 'Archiver',
                          tone: 'danger',
                          onClick: () => handleArchive(team),
                        },
                        team.isArchived && {
                          label: 'Supprimer',
                          tone: 'danger',
                          onClick: () => handleDelete(team),
                        },
                      ]}
                    />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(editing || creating) && (
        <ModalShell
          onClose={closeModal}
          labelledBy="team-modal-title"
        >
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-lg my-8">
            <h2 id="team-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {creating ? 'Ajouter une équipe' : 'Modifier l\'équipe'}
            </h2>
            <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Row 1: Club + N° + Couleur */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label htmlFor="team-clubId" className="block text-sm font-medium text-slate-700">Club</label>
                  <select
                    id="team-clubId"
                    value={form.clubId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, clubId: e.target.value, gameLocationId: '', captainId: '', playerIds: [] }))
                    }
                    disabled={!!editing}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-100"
                  >
                    {clubsForSelect.map((c) => (
                      <option key={c.id} value={c.id}>{c.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="team-number" className="block text-sm font-medium text-slate-700">N° équipe</label>
                  <input
                    id="team-number"
                    type="number"
                    min={1}
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: Number(e.target.value) || 1 }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="team-color" className="block text-sm font-medium text-slate-700">Couleur</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="team-color"
                      type="color"
                      value={form.color || DEFAULT_TEAM_COLOR}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-11 w-14 shrink-0 cursor-pointer rounded border border-slate-300 p-1 md:h-9 md:w-12"
                    />
                    {form.color && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color: '' }))}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Create-only: Phase, Division, Group */}
              {creating && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="team-phaseId" className="block text-sm font-medium text-slate-700">Phase</label>
                    <select
                      id="team-phaseId"
                      value={form.phaseId}
                      onChange={(e) => setForm((f) => ({ ...f, phaseId: e.target.value, divisionId: '', groupId: '' }))}
                      className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      {phases.map((p) => (
                        <option key={p.id} value={p.id}>{p.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="team-divisionId" className="block text-sm font-medium text-slate-700">Division</label>
                    <select
                      id="team-divisionId"
                      value={form.divisionId}
                      onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value, groupId: '' }))}
                      className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      {divisionsInPhase.map((d) => (
                        <option key={d.id} value={d.id}>{d.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="team-groupId" className="block text-sm font-medium text-slate-700">Groupe</label>
                    <select
                      id="team-groupId"
                      value={form.groupId}
                      onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
                      className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      {groupsInDivision.map((g) => (
                        <option key={g.id} value={g.id}>Groupe {g.number}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Row 2: Lieu, Jour, Heure. Four columns is ~66px each at 375px,
                  which the Heure cell cannot hold once its two selects are 44px
                  wide — so below md: Lieu takes a row and Jour/Heure share the
                  next one (#372). */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="col-span-2">
                  <label htmlFor="team-gameLocationId" className="block text-sm font-medium text-slate-700">Lieu de jeu</label>
                  <select
                    id="team-gameLocationId"
                    value={form.gameLocationId}
                    onChange={(e) => setForm((f) => ({ ...f, gameLocationId: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    {addressesForClub.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="team-defaultDay" className="block text-sm font-medium text-slate-700">Jour</label>
                  <select
                    id="team-defaultDay"
                    value={form.defaultDay}
                    onChange={(e) => setForm((f) => ({ ...f, defaultDay: e.target.value }))}
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    <option value="">—</option>
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Heure</label>
                  <div className="mt-1 flex items-center gap-1">
                    <select
                      value={timeHour}
                      onChange={(e) => setTimeFromParts(e.target.value, timeMinute)}
                      className="w-full min-h-[44px] min-w-11 md:min-h-0 md:min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:px-3"
                    >
                      <option value="">—</option>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="text-slate-500 font-medium">h</span>
                    <select
                      value={timeMinute}
                      onChange={(e) => setTimeFromParts(String(timeHour), e.target.value)}
                      disabled={!timeHour}
                      className="w-full min-h-[44px] min-w-11 md:min-h-0 md:min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-100 md:px-3"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Player table */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    Joueurs de l&apos;équipe
                  </label>
                  {editing && previousPhase && previousPhaseTeams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setImportRosterOpen(true)}
                      className="text-sm font-medium text-accent-600 hover:text-accent-800"
                    >
                      Importer depuis la phase précédente
                    </button>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Joueur</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Licence</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700">Points (phase)</th>
                        <th className="px-3 py-2 text-center font-medium text-slate-700">Capitaine</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-700"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rosterPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                            Aucun joueur dans l&apos;équipe.
                          </td>
                        </tr>
                      ) : (
                        rosterPlayers.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {p.firstName} {p.lastName}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-xs">
                              {p.licenseNumber}
                            </td>
                            {/* Read-only since #384: points come from the FFTT
                                import and belong to the phase, so they are shown
                                here to help compose, not edited here. */}
                            <td className="px-3 py-2 text-slate-600">
                              {pointsFor(playerPhasePoints, form.phaseId, p.id) ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="radio"
                                name="captain"
                                checked={form.captainId === p.id}
                                onChange={() => setForm((f) => ({ ...f, captainId: p.id }))}
                                className="h-4 w-4 text-accent-600 border-slate-300 focus:ring-accent-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((f) => ({
                                    ...f,
                                    playerIds: f.playerIds.filter((id) => id !== p.id),
                                    captainId: f.captainId === p.id ? '' : f.captainId,
                                  }))
                                }}
                                className="text-slate-400 hover:text-red-600 transition-colors"
                                title="Retirer de l'équipe"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {availablePlayersToAdd.length > 0 && (
                  <div className="mt-2">
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value
                        if (id && !form.playerIds.includes(id)) {
                          setForm((f) => ({ ...f, playerIds: [...f.playerIds, id] }))
                        }
                        e.target.value = ''
                      }}
                      className="min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    >
                      <option value="">+ Ajouter un joueur</option>
                      {availablePlayersToAdd.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* WhatsApp link */}
              <div>
                <label htmlFor="team-whatsapp" className="block text-sm font-medium text-slate-700">
                  Groupe WhatsApp
                </label>
                <input
                  id="team-whatsapp"
                  type="url"
                  value={form.whatsappLink}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappLink: e.target.value }))}
                  placeholder="https://chat.whatsapp.com/..."
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
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
                  creating &&
                  (!form.clubId ||
                    !form.phaseId ||
                    !form.divisionId ||
                    !form.groupId ||
                    !form.gameLocationId ||
                    form.playerIds.length === 0 ||
                    !form.playerIds.includes(form.captainId))
                }
                className={PRIMARY_BUTTON_CLASS}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {importGamesFor && (
        <ImportGamesModal
          onClose={() => setImportGamesFor(null)}
          groupIds={[importGamesFor.groupId]}
          teamId={importGamesFor.id}
          clubId={importGamesFor.clubId}
          context={`${getClubName(importGamesFor.clubId)} ${importGamesFor.number} — calendrier de sa poule`}
        />
      )}

      {importRosterOpen && editing && previousPhase && editingClub && (
        <ImportPreviousPhaseRosterModal
          onClose={() => setImportRosterOpen(false)}
          club={editingClub}
          previousPhase={previousPhase}
          sourceTeams={previousPhaseTeams}
          players={players}
          defaultTeamNumber={editing.number}
          currentPlayerIds={form.playerIds}
          playerIdsInOtherTeams={playerIdsInOtherTeams}
          onConfirm={handleImportFromPreviousPhase}
        />
      )}
    </div>
  )
}
