import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { useConfirm } from '@/components/useConfirm'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, TEXT_TARGET_CLASS } from '@/components/Button'
import { matchesSearch } from '@/lib/playerSearch'
import type { DelegationPerson, Delegations } from '@/types'

const INPUT_CLASS =
  'w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20'

const nameOf = (p: DelegationPerson) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Sans nom'

/**
 * A person's delegations (#655): who may open their profiles, and — on their
 * own « Mon compte » — whose profiles they may open.
 *
 * Two hands, the two the API admits: the person, naming a delegate by their
 * address (a parent's), and the general admin, picking a member for someone who
 * cannot sign in at all (Sacha, no address). A delegate gives up a delegation
 * from their side with « Ne plus gérer ».
 */
export function PersonDelegates({
  personId,
  mode,
  idPrefix,
}: {
  personId: string
  /** `self` on « Mon compte »; `admin` on a fiche, for the general admin. */
  mode: 'self' | 'admin'
  idPrefix: string
}) {
  const { refreshProfiles } = useAuth()
  const { users, fetchDelegations, addDelegate, removeDelegate } = useAppData()
  const [confirm, confirmDialog] = useConfirm()
  const [delegations, setDelegations] = useState<Delegations | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [query, setQuery] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await fetchDelegations(personId)
    setFailed(!d)
    setDelegations(d)
  }, [fetchDelegations, personId])

  useEffect(() => { void load() }, [load])

  // The general admin picks among members: one entry per person, never the
  // person themselves nor someone already named.
  const candidates = useMemo(() => {
    if (mode !== 'admin' || !query.trim()) return []
    const taken = new Set([personId, ...(delegations?.delegates ?? []).map((d) => d.id)])
    const seen = new Set<string>()
    return users
      .filter((u) => u.personId && !taken.has(u.personId))
      .filter((u) => matchesSearch(`${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email ?? ''}`, query))
      .filter((u) => (seen.has(u.personId!) ? false : (seen.add(u.personId!), true)))
      .slice(0, 8)
  }, [mode, query, users, personId, delegations])

  const name = async (target: { delegateId: string } | { email: string }) => {
    setSaving(true)
    setRefusal(null)
    const result = await addDelegate(personId, target)
    setSaving(false)
    if (!result.ok) {
      setRefusal(result.message)
      return
    }
    setAdding(false)
    setEmail('')
    setQuery('')
    await load()
  }

  const withdraw = async (delegate: DelegationPerson) => {
    if (!(await confirm({
      title: `Retirer ${nameOf(delegate)} ?`,
      message: mode === 'self'
        ? 'Cette personne ne pourra plus ouvrir vos profils.'
        : 'Cette personne ne pourra plus ouvrir les profils de ce licencié.',
      confirmLabel: 'Retirer',
    }))) return
    if (await removeDelegate(personId, delegate.id)) await load()
  }

  const stepDown = async (person: DelegationPerson) => {
    if (!(await confirm({
      title: `Ne plus gérer ${nameOf(person)} ?`,
      message: 'Ses profils ne vous seront plus proposés. Seuls cette personne ou l’administrateur général pourront vous les rendre.',
      confirmLabel: 'Ne plus gérer',
    }))) return
    if (await removeDelegate(person.id, personId)) {
      await load()
      await refreshProfiles?.()
    }
  }

  if (failed) {
    return <p className="text-sm text-slate-500">Les délégations n’ont pas pu être lues.</p>
  }
  if (!delegations) return null

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-700">
            {mode === 'self' ? 'Peuvent ouvrir vos profils' : 'Délégués'}
          </h3>
          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); setRefusal(null) }}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 ${TEXT_TARGET_CLASS}`}
            >
              Ajouter un délégué
            </button>
          )}
        </div>
        {delegations.delegates.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Personne.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {delegations.delegates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{nameOf(d)}</span>
                  {d.email && <span className="block truncate text-slate-500">{d.email}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => withdraw(d)}
                  className={`text-sm font-medium text-red-600 hover:text-red-800 ${TEXT_TARGET_CLASS}`}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {mode === 'self' ? (
              <>
                <label htmlFor={`${idPrefix}-delegate-email`} className="block text-sm font-medium text-slate-700">
                  Adresse e-mail du délégué
                </label>
                <p className="text-xs text-slate-500">
                  Celle avec laquelle il se connecte. Il pourra ouvrir vos profils sans votre code.
                </p>
                <input
                  id={`${idPrefix}-delegate-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                />
              </>
            ) : (
              <>
                <label htmlFor={`${idPrefix}-delegate-search`} className="block text-sm font-medium text-slate-700">
                  Rechercher un membre
                </label>
                <input
                  id={`${idPrefix}-delegate-search`}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={INPUT_CLASS}
                />
                {candidates.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {candidates.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => name({ delegateId: u.personId! })}
                          className="flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-800 hover:bg-slate-50 md:min-h-0 md:py-2"
                        >
                          {u.firstName} {u.lastName}
                          {u.email && <span className="ml-2 truncate text-slate-500">{u.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {refusal && <p role="alert" className="text-sm text-red-700">{refusal}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setAdding(false); setRefusal(null) }} className={NEUTRAL_BUTTON_CLASS}>
                Annuler
              </button>
              {mode === 'self' && (
                <button
                  type="button"
                  disabled={saving || !email.trim()}
                  onClick={() => name({ email: email.trim() })}
                  className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-40`}
                >
                  Ajouter
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {mode === 'self' && delegations.represents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700">Vous gérez aussi</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {delegations.represents.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{nameOf(p)}</span>
                <button
                  type="button"
                  onClick={() => stepDown(p)}
                  className={`text-sm font-medium text-slate-600 hover:text-slate-800 ${TEXT_TARGET_CLASS}`}
                >
                  Ne plus gérer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
