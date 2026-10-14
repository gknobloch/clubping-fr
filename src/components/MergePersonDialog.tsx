import { useMemo, useState } from 'react'
import type { Player } from '@/types'
import { useAppData } from '@/contexts/DataContext'
import { ModalShell } from '@/components/ModalShell'
import { NEUTRAL_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/Button'
import { GENERAL_ADMINISTRATION } from '@/lib/profiles'
import {
  peopleOf, personMergeRefusal, personMergeTarget, personNameKey, similarPeople, type MergeablePerson,
} from '@/lib/namesakes'

const nameOf = (p: Pick<MergeablePerson, 'firstName' | 'lastName'>) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Sans nom'

/**
 * Join this licensee's person to another one (#733), whatever each
 * federation calls them: the FFTT's Vincent Rambeau is the AGR's Vincent
 * Rambeaux, and no list of identical names will ever pair them. Close
 * spellings are offered first; a search finds anyone. Which person stays,
 * and what refuses, is the rule of #731 — the one the API applies.
 */
export function MergePersonDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const { users, clubs, mergePeople } = useAppData()
  const [query, setQuery] = useState('')
  const [chosenId, setChosenId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const people = useMemo(() => peopleOf(users), [users])
  const self = people.find((p) => p.personId === player.personId)
  const candidates = useMemo(() => {
    if (!self) return []
    const q = personNameKey(query, '')
    if (!q) return similarPeople(self, people).slice(0, 8)
    return people
      .filter((p) => p.personId !== self.personId && personNameKey(p.firstName, p.lastName).includes(q))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr'))
      .slice(0, 8)
  }, [people, self, query])

  const chosen = people.find((p) => p.personId === chosenId)
  const pair = self && chosen ? personMergeTarget(self, chosen) : null
  const refusal = pair && personMergeRefusal(pair.keep, pair.remove)
  const clubsOf = (p: MergeablePerson) => p.profiles
    .map((pr) => (pr.clubId ? clubs.find((c) => c.id === pr.clubId)?.displayName ?? pr.clubId : GENERAL_ADMINISTRATION))
    .join(' · ')

  const submit = async () => {
    if (!pair || refusal) return
    setBusy(true)
    setError(null)
    const r = await mergePeople(pair.remove.personId, pair.keep.personId)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }

  return (
    <ModalShell onClose={onClose} labelledBy="merge-person-title">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 id="merge-person-title" className="font-display text-lg font-semibold text-slate-800">
          Réunir {nameOf(player)} avec une autre personne
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Deux fiches pour le même licencié, orthographié différemment d’une fédération à l’autre : ses
          profils de club passent sur la personne gardée, qui les ouvre avec sa propre adresse.
        </p>
        {!self ? (
          <p role="alert" className="mt-3 text-sm text-red-600">Ce profil n’est rattaché à aucune personne.</p>
        ) : (
          <>
            <label htmlFor="merge-person-search" className="mt-4 block text-sm font-medium text-slate-700">
              Rechercher une personne
            </label>
            <input
              id="merge-person-search"
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setChosenId('') }}
              placeholder="Nom ou prénom"
              className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
            />
            {!query && candidates.length > 0 && (
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Noms proches</p>
            )}
            <ul className="mt-1 divide-y divide-slate-100" role="radiogroup" aria-label="Personnes">
              {candidates.map((p) => (
                <li key={p.personId}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                    <input
                      type="radio"
                      name="merge-person"
                      checked={chosenId === p.personId}
                      onChange={() => { setChosenId(p.personId); setError(null) }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{nameOf(p)}</span>
                      <span className="block text-xs text-slate-500">
                        {clubsOf(p)}{p.email ? ` · ${p.email}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {candidates.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">
                {query ? 'Personne de ce nom.' : 'Aucun nom proche : cherchez la personne par son nom.'}
              </p>
            )}
          </>
        )}

        {pair && (
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="merge-person-summary">
            Gardée : <span className="font-medium">{nameOf(pair.keep)}</span>
            {pair.keep.email ? ` (${pair.keep.email})` : ''} — avec les profils {clubsOf(pair.keep)} · {clubsOf(pair.remove)}.
            Son nom se corrige ensuite sur la fiche.
          </div>
        )}
        {(refusal || error) && (
          <p role="alert" className="mt-3 text-sm text-red-600">{refusal?.message ?? error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={NEUTRAL_BUTTON_CLASS}>Annuler</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!pair || !!refusal || busy}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? 'Réunion…' : 'Réunir'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
