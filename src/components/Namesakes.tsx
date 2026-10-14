import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '@/contexts/DataContext'
import { useConfirm } from '@/components/useConfirm'
import { SecondaryButton } from '@/components/Button'
import { GENERAL_ADMINISTRATION } from '@/lib/profiles'
import { namesakes, type MergeablePerson, type Namesake } from '@/lib/namesakes'

/**
 * The same name in two clubs, two people (#731) — the AGR list of Landser
 * beside the FFTT profiles of Rixheim. The general admin's question: if they
 * are one human, « C'est la même personne » joins the profile without an
 * address to the one who signs in. Never answered on its own: a father and a
 * son can share a name.
 *
 * `personId` narrows it to one person, on their fiche. Renders nothing when
 * there is nothing to ask.
 */
export function Namesakes({ personId, onSettled }: { personId?: string; onSettled?: () => void }) {
  const { users, clubs, mergePeople } = useAppData()
  const pairs = useMemo(() => {
    const all = namesakes(users)
    return personId ? all.filter((n) => n.people.some((p) => p.personId === personId)) : all
  }, [users, personId])
  if (pairs.length === 0) return null

  const clubName = (clubId?: string) =>
    clubId ? clubs.find((c) => c.id === clubId)?.displayName ?? clubId : GENERAL_ADMINISTRATION

  return (
    <ul className="space-y-3">
      {pairs.map((n) => (
        <li key={n.people[1].personId}>
          <NamesakeCard pair={n} clubName={clubName} merge={mergePeople} onSettled={onSettled} />
        </li>
      ))}
    </ul>
  )
}

function NamesakeCard({
  pair, clubName, merge, onSettled,
}: {
  pair: Namesake
  clubName: (clubId?: string) => string
  merge: (personId: string, targetId: string) => Promise<{ ok: true } | { ok: false; message: string }>
  onSettled?: () => void
}) {
  const [confirm, confirmDialog] = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keep, remove] = pair.people
  const clubsOf = (p: MergeablePerson) => p.profiles.map((pr) => clubName(pr.clubId))

  const join = async () => {
    const all = [...clubsOf(keep), ...clubsOf(remove)]
    const ok = await confirm({
      title: `Une seule personne : ${pair.name} ?`,
      message:
        `Les deux fiches deviennent une seule personne, avec ses ${all.length} profils : ${all.join(', ')}.` +
        (keep.email ? ` Elle se connecte avec ${keep.email} et passe d’un club à l’autre sans se déconnecter.` : ''),
      confirmLabel: 'Confirmer',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    const result = await merge(remove.personId, keep.personId)
    if (!result.ok) setError(result.message)
    setBusy(false)
    onSettled?.()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {confirmDialog}
      <p className="text-sm font-medium text-slate-800">{pair.name}</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {pair.people.map((p) => (
          <li key={p.personId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
            <Link to={`/joueurs/${p.profiles[0].userId}`} className="text-sm text-slate-800 hover:text-accent-700">
              {clubsOf(p).join(' · ')}
            </Link>
            <span className="break-all text-xs text-slate-500">{p.email ?? 'Sans adresse'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-slate-100 pt-3">
        <SecondaryButton disabled={busy} onClick={() => void join()}>
          C’est la même personne
        </SecondaryButton>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
    </div>
  )
}
