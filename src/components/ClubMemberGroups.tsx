import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { RowActions } from '@/components/RowActions'
import { ChecklistDialog, type ChecklistOption } from '@/components/ChecklistDialog'
import { useConfirm } from '@/components/useConfirm'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { clubMemberGroups, groupDeletionMessage, mayManageMemberGroups, type MemberGroupResult } from '@/lib/memberGroups'
import { sortByName } from '@/lib/sortByName'
import type { MemberGroup, User } from '@/types'

/**
 * A club's own groups of members (#602) — « Bureau », « Jeunes ».
 *
 * On both club screens, like `ClubAdmins`: a club admin sees it on /club, a
 * general admin on /clubs/:id, and every member of the club reads it on /club.
 * Each group links to the Joueurs list already filtered on it, which is what a
 * member opening this section is after.
 *
 * Members are every member of the club, not only its players: the president of
 * a Bureau may hold no licence. The Joueurs list, being a list of players, will
 * simply not show them.
 */
export function ClubMemberGroups({
  clubId,
  idPrefix = 'club',
  variant = 'panel',
}: {
  clubId: string
  idPrefix?: string
  /** Same two furnitures as `ClubAdmins` — see there. */
  variant?: 'panel' | 'section'
}) {
  const { user } = useAuth()
  const {
    users, memberGroups, addMemberGroup, renameMemberGroup, deleteMemberGroup, setMemberGroupMembers,
    competitions, competitionGroups,
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  // `{}` is a new group, `{ group }` an existing one, null nothing open.
  const [editing, setEditing] = useState<{ group?: MemberGroup } | null>(null)

  const canManage = mayManageMemberGroups(user, clubId)
  const groups = clubMemberGroups(memberGroups, clubId)

  const clubMembers = useMemo(
    () => sortByName(
      users
        .filter((u) => u.clubId === clubId)
        .map((u) => ({ ...u, firstName: u.firstName ?? '', lastName: u.lastName ?? '' })),
    ),
    [users, clubId],
  )

  const handleDelete = async (group: MemberGroup) => {
    const ok = await confirm({
      title: `Supprimer le groupe « ${group.displayName} » ?`,
      message: groupDeletionMessage(group, competitionGroups, competitions),
      confirmLabel: 'Supprimer',
    })
    if (ok) deleteMemberGroup(clubId, group.id)
  }

  const isSection = variant === 'section'
  // Nothing to read and nothing to do: a member of a club with no group is
  // spared an empty section about a feature they cannot use.
  if (!canManage && groups.length === 0) return null

  return (
    <section
      aria-labelledby={`${idPrefix}-groups-title`}
      className={
        isSection
          ? 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isSection ? (
          <h3 id={`${idPrefix}-groups-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Groupes
          </h3>
        ) : (
          <h2 id={`${idPrefix}-groups-title`} className="font-display text-lg font-semibold text-slate-800">
            Groupes
          </h2>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing({})}
            className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
          >
            + Nouveau groupe
          </button>
        )}
      </div>
      {canManage && (
        <p className="mt-2 text-sm text-slate-600">
          Regroupez les membres du club — bureau, jeunes, loisirs… Un membre peut être dans plusieurs
          groupes, et chacun peut filtrer la liste des joueurs par groupe.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Aucun groupe.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {groups.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1 text-sm"
            >
              <Link
                to={`/joueurs?groupes=${encodeURIComponent(g.id)}`}
                className={`min-w-0 flex-1 gap-2 hover:underline ${TEXT_TARGET_CLASS}`}
              >
                <span className="truncate font-medium text-slate-800">{g.displayName}</span>
                <span className="shrink-0 text-slate-500">
                  {g.memberIds.length} membre{g.memberIds.length > 1 ? 's' : ''}
                </span>
              </Link>
              {canManage && (
                <RowActions
                  label={`Actions — ${g.displayName}`}
                  actions={[
                    { label: 'Modifier', onClick: () => setEditing({ group: g }) },
                    { label: 'Supprimer', tone: 'danger', onClick: () => handleDelete(g) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MemberGroupEditor
          idPrefix={`${idPrefix}-group-editor`}
          group={editing.group}
          options={memberOptions(clubMembers, editing.group?.memberIds ?? [])}
          onCreate={(name) => addMemberGroup(clubId, name)}
          onRename={(groupId, name) => renameMemberGroup(clubId, groupId, name)}
          onSetMembers={(groupId, ids) => setMemberGroupMembers(clubId, groupId, ids)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

/**
 * The club's members as checklist rows. An archived member is offered only
 * while still in the group — so they can be taken out, never newly put in.
 */
function memberOptions(members: User[], current: string[]): ChecklistOption[] {
  return members
    .filter((u) => u.status !== 'archived' || current.includes(u.id))
    .map((u) => ({
      id: u.id,
      label: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || 'Sans nom',
      hint: u.status === 'archived' ? 'Archivé' : !u.isPlayer ? 'Non licencié' : undefined,
    }))
}

/**
 * Create a group or change one — its name and its members in one place, as in
 * the app: a group is made *with* its people, and a name alone followed by a
 * second dialog to fill it would be two steps where one does.
 *
 * The name is written first, since it is the one thing the API may refuse (a
 * name the club already uses); a refusal keeps the dialog open having written
 * nothing else.
 */
function MemberGroupEditor({
  idPrefix,
  group,
  options,
  onCreate,
  onRename,
  onSetMembers,
  onClose,
}: {
  idPrefix: string
  group?: MemberGroup
  options: ChecklistOption[]
  onCreate: (name: string) => Promise<MemberGroupResult>
  onRename: (groupId: string, name: string) => Promise<MemberGroupResult>
  onSetMembers: (groupId: string, memberIds: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(group?.displayName ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = async (ids: string[]) => {
    setError(null)
    let groupId = group?.id
    if (!group) {
      const result = await onCreate(name)
      if (!result.ok) { setError(result.message); return false }
      groupId = result.group.id
    } else if (name.trim() !== group.displayName) {
      const result = await onRename(group.id, name)
      if (!result.ok) { setError(result.message); return false }
    }
    const before = group?.memberIds ?? []
    const changed = ids.length !== before.length || ids.some((id) => !before.includes(id))
    if (groupId && changed) onSetMembers(groupId, ids)
    return true
  }

  return (
    <ChecklistDialog
      idPrefix={idPrefix}
      title={group ? 'Modifier le groupe' : 'Nouveau groupe'}
      header={
        <div className="mt-3">
          <label htmlFor={`${idPrefix}-name`} className="block text-sm font-medium text-slate-700">
            Nom
          </label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            value={name}
            maxLength={60}
            placeholder="Bureau, Jeunes, Loisirs…"
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
          />
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      }
      options={options}
      selected={group?.memberIds ?? []}
      emptyLabel="Ce club n'a encore aucun membre."
      saveDisabled={!name.trim()}
      onSave={save}
      onClose={onClose}
    />
  )
}
