import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { useConfirm } from '@/components/useConfirm'
import { SecondaryButton } from '@/components/Button'
import { GENERAL_ADMINISTRATION } from '@/lib/profiles'
import { mergeTarget, sharedAddresses, type SharedAddress, type SharedAddressPerson } from '@/lib/sharedAddresses'

const nameOf = (p: SharedAddressPerson) => [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Sans nom'

/**
 * Addresses several people share (#655, step 3) — the general admin's to
 * settle, one person keeping the address and becoming the delegate of the
 * others. Before #655 a shared address was how a parent opened a child's
 * profile; a delegation is the same access without the coincidence of strings.
 * When there are two and they are one human — a general admin's profile
 * written without a name, say —, « C'est la même personne » merges them.
 *
 * `personId` narrows it to the address of one person, on their fiche. Renders
 * nothing when there is nothing to settle.
 */
export function SharedAddresses({ personId, onSettled }: { personId?: string; onSettled?: () => void }) {
  const { users, clubs, addressToDelegate, mergePeople } = useAppData()
  const groups = useMemo(() => {
    const all = sharedAddresses(users)
    return personId ? all.filter((g) => g.people.some((p) => p.personId === personId)) : all
  }, [users, personId])
  if (groups.length === 0) return null

  const clubName = (clubId?: string) => clubs.find((c) => c.id === clubId)?.displayName

  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.email.toLowerCase()}>
          <SharedAddressCard
            group={g} clubName={clubName} settle={addressToDelegate} merge={mergePeople} onSettled={onSettled}
          />
        </li>
      ))}
    </ul>
  )
}

type Outcome = Promise<{ ok: true } | { ok: false; message: string }>

function SharedAddressCard({
  group, clubName, settle, merge, onSettled,
}: {
  group: SharedAddress
  clubName: (clubId?: string) => string | undefined
  settle: (personId: string, delegateId: string) => Outcome
  merge: (personId: string, targetId: string) => Outcome
  onSettled?: () => void
}) {
  const [confirm, confirmDialog] = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keep = async (keeper: SharedAddressPerson) => {
    const others = group.people.filter((p) => p.personId !== keeper.personId)
    const names = others.map(nameOf).join(', ')
    const ok = await confirm({
      title: `${nameOf(keeper)} garde ${group.email} ?`,
      message:
        `${names} ${others.length > 1 ? 'n’auront plus d’adresse' : 'n’aura plus d’adresse'}, et ${nameOf(keeper)} ` +
        `en devient le délégué : ${nameOf(keeper)} ouvre toujours ${others.length > 1 ? 'leurs' : 'ses'} profils. ` +
        `Une adresse personnelle pourra être ajoutée plus tard.`,
      confirmLabel: 'Confirmer',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    // One at a time: a refusal stops the rest rather than settling half a family silently.
    for (const other of others) {
      const result = await settle(other.personId, keeper.personId)
      if (!result.ok) {
        setError(result.message)
        break
      }
    }
    setBusy(false)
    onSettled?.()
  }

  const profileLabel = (pr: SharedAddressPerson['profiles'][number]) =>
    pr.generalAdmin ? GENERAL_ADMINISTRATION : clubName(pr.clubId) ?? 'Sans club'

  // Two people who are one: offered for a pair only — with three, which two
  // would be ambiguous, and the hand-over above still settles everyone.
  const target = group.people.length === 2 ? mergeTarget(group) : undefined
  const joinAsOne = async () => {
    if (!target) return
    const other = group.people.find((p) => p.personId !== target.personId)!
    const all = [...target.profiles, ...other.profiles].map(profileLabel)
    const ok = await confirm({
      title: 'Une seule personne ?',
      message:
        `${nameOf(other)} et ${nameOf(target)} deviennent une seule personne, ${nameOf(target)}, avec ` +
        `ses ${all.length} profils : ${all.join(', ')}. Ils seront proposés ensemble au changement de profil.`,
      confirmLabel: 'Confirmer',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    const result = await merge(other.personId, target.personId)
    if (!result.ok) setError(result.message)
    setBusy(false)
    onSettled?.()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {confirmDialog}
      <p className="break-all text-sm font-medium text-slate-800">{group.email}</p>
      <p className="text-xs text-slate-500">Partagée par {group.people.length} personnes. Qui la garde ?</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {group.people.map((p) => (
          <li key={p.personId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link to={`/joueurs/${p.profiles[0].userId}`} className="text-sm font-medium text-slate-800 hover:text-accent-700">
                {nameOf(p)}
              </Link>
              <p className="text-xs text-slate-500">
                {p.profiles.map(profileLabel).join(' · ')}
              </p>
            </div>
            <SecondaryButton disabled={busy} onClick={() => void keep(p)}>
              Garde l’adresse
            </SecondaryButton>
          </li>
        ))}
      </ul>
      {target && (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <SecondaryButton disabled={busy} onClick={() => void joinAsOne()}>
            C’est la même personne
          </SecondaryButton>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
    </div>
  )
}
