import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { RowActions } from '@/components/RowActions'
import { ChecklistDialog, type ChecklistOption } from '@/components/ChecklistDialog'
import { useConfirm } from '@/components/useConfirm'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { clubMemberGroups, mayManageMemberGroups, type MemberGroupResult } from '@/lib/memberGroups'
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
  } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [naming, setNaming] = useState<{ group?: MemberGroup } | null>(null)
  const [filing, setFiling] = useState<MemberGroup | null>(null)

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
      message: 'Ses membres restent au club : seul le groupe disparaît.',
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
            onClick={() => setNaming({})}
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
                    { label: 'Membres', onClick: () => setFiling(g) },
                    { label: 'Renommer', onClick: () => setNaming({ group: g }) },
                    { label: 'Supprimer', tone: 'danger', onClick: () => handleDelete(g) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {naming && (
        <GroupNameDialog
          idPrefix={`${idPrefix}-group-name`}
          group={naming.group}
          onClose={() => setNaming(null)}
          onSubmit={(name) => (naming.group
            ? renameMemberGroup(clubId, naming.group.id, name)
            : addMemberGroup(clubId, name))}
        />
      )}

      {filing && (
        <ChecklistDialog
          idPrefix={`${idPrefix}-group-members`}
          title={`Membres — ${filing.displayName}`}
          options={memberOptions(clubMembers, filing.memberIds)}
          selected={filing.memberIds}
          emptyLabel="Ce club n'a encore aucun membre."
          onSave={(ids) => setMemberGroupMembers(clubId, filing.id, ids)}
          onClose={() => setFiling(null)}
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

/** Create or rename — one field, and the API's refusal shown under it. */
function GroupNameDialog({
  idPrefix,
  group,
  onSubmit,
  onClose,
}: {
  idPrefix: string
  group?: MemberGroup
  onSubmit: (name: string) => Promise<MemberGroupResult>
  onClose: () => void
}) {
  const [name, setName] = useState(group?.displayName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const result = await onSubmit(name)
    setBusy(false)
    if (result.ok) onClose()
    else setError(result.message)
  }

  return (
    <ModalShell onClose={onClose} labelledBy={`${idPrefix}-title`}>
      <form
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2 id={`${idPrefix}-title`} className="font-display text-lg font-semibold text-slate-800">
          {group ? 'Renommer le groupe' : 'Nouveau groupe'}
        </h2>
        <label htmlFor={`${idPrefix}-input`} className="mt-4 block text-sm font-medium text-slate-700">
          Nom
        </label>
        <input
          id={`${idPrefix}-input`}
          type="text"
          value={name}
          maxLength={60}
          placeholder="Bureau, Jeunes, Loisirs…"
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {group ? 'Renommer' : 'Créer'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
