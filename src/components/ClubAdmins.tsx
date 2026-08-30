import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { PlayerPicker } from '@/components/PlayerPicker'
import { useConfirm } from '@/components/useConfirm'
import {
  NEUTRAL_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  TEXT_TARGET_CLASS,
} from '@/components/Button'
import {
  MAX_CLUB_ADMINS,
  canManageClubAdmins,
  clubAdminsOf,
  remainingClubAdminSlots,
} from '@/lib/clubAdmins'
import { lastSeenSentence, hasVisited } from '@/lib/lastSeen'
import { sortByName } from '@/lib/sortByName'
import type { Player, User } from '@/types'

/**
 * Who administers this club (#474).
 *
 * The same section on both club screens — a club admin sees it for their own
 * club on /club, a general admin for any club on /clubs/:id — because the
 * question and the rules are identical and only the reach differs.
 *
 * The two ways to appoint someone are deliberately not one control. Picking a
 * member of the club is the common case and needs no typing; inviting a
 * secretary or a president who holds no licence is rarer, creates a person,
 * and asks for an address that becomes their way in. Folding both into one
 * autocomplete would make the second look like a search that found nothing.
 *
 * Every refusal shown here comes from the API. The cap is checked locally too,
 * but only to disable the button before the trip — the sentence a member reads
 * is always the server's, so a stale page cannot invent a reason of its own.
 */
export function ClubAdmins({
  clubId,
  idPrefix = 'club',
  variant = 'panel',
}: {
  clubId: string
  idPrefix?: string
  /**
   * Which page's furniture to wear. The two club screens do not share a card
   * style: /clubs/:id builds panels with a display heading, /club builds
   * softer sections under a small uppercase label. One component, so the
   * wrapper follows the page rather than importing a third look into both.
   */
  variant?: 'panel' | 'section'
}) {
  const { user } = useAuth()
  const { users, players, addClubAdmin, removeClubAdmin } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage = canManageClubAdmins(user, clubId)

  const admins = useMemo(() => {
    const rows = clubAdminsOf(users, clubId)
    return sortByName(
      rows.map((u) => ({ ...u, lastName: u.lastName ?? '', firstName: u.firstName ?? '' })),
    )
  }, [users, clubId])

  const slotsLeft = remainingClubAdminSlots(users, clubId)
  const isFull = slotsLeft === 0

  // Members of the club who could be promoted: everyone but the current
  // admins. Archived players are excluded here as well as in the rules — the
  // picker should not offer what the API will refuse.
  const promotable: Player[] = useMemo(() => {
    const already = new Set(admins.map((a) => a.id))
    return sortByName(
      players.filter((p) => p.clubId === clubId && p.status === 'active' && !already.has(p.id)),
    )
  }, [players, clubId, admins])

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) setError(result.message)
    return result.ok
  }

  const handlePromote = async (playerId: string) => {
    await run(() => addClubAdmin(clubId, { userId: playerId }))
  }

  const handleRemove = async (admin: User) => {
    const name = displayName(admin)
    // The last-admin rule is the API's, but saying it before the click spares a
    // member a refusal they can do nothing about from this dialog.
    if (admins.length <= 1) {
      setError(
        "C'est le dernier administrateur du club. Désignez-en un autre avant de le retirer.",
      )
      return
    }
    const ok = await confirm({
      title: `Retirer ${name} des administrateurs ?`,
      message: admin.isPlayer
        ? 'Cette personne reste joueuse du club, avec son équipe et ses disponibilités.'
        : "Cette personne reste membre du club mais n'aura plus accès à rien tant qu'elle n'est pas à nouveau désignée.",
      confirmLabel: 'Retirer',
    })
    if (ok) await run(() => removeClubAdmin(clubId, admin.id))
  }

  const isSection = variant === 'section'

  return (
    <section
      // Names the landmark after its own heading: a bare <section> carries no
      // role at all, so without this the block is invisible to a screen reader
      // moving between regions.
      aria-labelledby={`${idPrefix}-admins-title`}
      className={
        isSection
          ? 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isSection ? (
          <h3
            id={`${idPrefix}-admins-title`}
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Administrateurs
          </h3>
        ) : (
          <h2 id={`${idPrefix}-admins-title`} className="font-display text-lg font-semibold text-slate-800">
            Administrateurs
          </h2>
        )}
        <span className="text-sm tabular-nums text-slate-500">
          {admins.length} / {MAX_CLUB_ADMINS}
        </span>
      </div>
      {/* The explanation earns its place next to the controls; on the member's
          own club page, where most readers can only look, it is noise. */}
      {(!isSection || canManage) && (
        <p className="mt-2 text-sm text-slate-600">
          Les administrateurs gèrent le club, ses équipes et ses joueurs. {MAX_CLUB_ADMINS} au
          maximum, et au moins un.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        {admins.length === 0 && (
          <li className="text-sm text-slate-500">
            Aucun administrateur. Ce club ne peut être géré par personne.
          </li>
        )}
        {admins.map((admin) => (
          <li
            key={admin.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {displayName(admin)}
                {!admin.isPlayer && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                    Non licencié
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-slate-500">
                {admin.email ?? 'Aucune adresse'}
                {' · '}
                <span className={hasVisited(admin.lastSeenAt) ? undefined : 'text-amber-700'}>
                  {lastSeenSentence(admin.lastSeenAt)}
                </span>
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => handleRemove(admin)}
                disabled={busy}
                className={`text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 ${TEXT_TARGET_CLASS}`}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isFull ? (
            <p className="text-sm text-slate-500">
              Ce club a atteint le maximum de {MAX_CLUB_ADMINS} administrateurs.
            </p>
          ) : (
            <>
              <PlayerPicker
                players={promotable}
                onPick={handlePromote}
                label="+ Désigner un membre"
                title="Désigner un administrateur"
                emptyLabel="Tous les membres actifs du club sont déjà administrateurs."
              />
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setInviting(true)
                }}
                className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
              >
                Inviter une personne non licenciée
              </button>
            </>
          )}
        </div>
      )}

      {inviting && (
        <InviteAdminDialog
          idPrefix={idPrefix}
          busy={busy}
          onClose={() => setInviting(false)}
          onSubmit={async (form) => {
            const ok = await run(() => addClubAdmin(clubId, form))
            if (ok) setInviting(false)
          }}
        />
      )}
    </section>
  )
}

/** "Prénom Nom", falling back to the address for a member who has neither. */
function displayName(u: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return name || u.email || 'Sans nom'
}

/**
 * Inviting someone who is not in the app at all. The address is required and
 * not merely a contact detail: it is the sign-in identifier, so a typo here is
 * an admin who can never get in.
 */
function InviteAdminDialog({
  idPrefix,
  busy,
  onClose,
  onSubmit,
}: {
  idPrefix: string
  busy: boolean
  onClose: () => void
  onSubmit: (form: { firstName: string; lastName: string; email: string; phone?: string }) => void
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const complete =
    form.firstName.trim() !== '' && form.lastName.trim() !== '' && form.email.trim().includes('@')

  const inputClass =
    'mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

  const field = (key: keyof typeof form, label: string, type = 'text', required = true) => (
    <div>
      <label htmlFor={`${idPrefix}-invite-${key}`} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={`${idPrefix}-invite-${key}`}
        type={type}
        required={required}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className={inputClass}
      />
    </div>
  )

  return (
    <ModalShell onClose={onClose} labelledBy={`${idPrefix}-invite-title`}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 id={`${idPrefix}-invite-title`} className="font-display text-lg font-semibold text-slate-800">
          Inviter une personne non licenciée
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Pour un secrétaire ou un président sans licence. La personne est créée comme membre du
          club sans être joueuse, et se connecte avec cette adresse.
        </p>
        <div className="mt-4 space-y-3">
          {field('firstName', 'Prénom')}
          {field('lastName', 'Nom')}
          {field('email', 'Adresse e-mail', 'email')}
          {field('phone', 'Téléphone (facultatif)', 'tel', false)}
        </div>
        {/* No e-mail leaves the app (#474): the person has to be told by hand. */}
        <p className="mt-3 text-xs text-slate-500">
          Aucun message ne lui est envoyé : prévenez-la vous-même qu’elle peut se connecter.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!complete || busy}
            onClick={() =>
              onSubmit({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                email: form.email.trim(),
                ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
              })
            }
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            Inviter
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
