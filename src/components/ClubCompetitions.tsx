import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { TEXT_TARGET_CLASS } from '@/components/Button'
import { sortByName } from '@/lib/sortByName'
import { categoriesSummary, categoryDisplay } from '@/lib/playerCategories'
import {
  ELIGIBILITY_REASON_LABELS,
  canClubAdd,
  playerEligibility,
} from '@/lib/competitionEligibility'

/**
 * What a club amends, competition by competition (#482).
 *
 * The global mapping decides by category; this screen is the two exceptions a
 * club is allowed to make to it — take out a licensee it admits, put in one it
 * does not — and it is deliberately shaped as exceptions rather than as a
 * second list to maintain. Every row says which of the two it is, or that it is
 * neither, so a club can see at a glance what it has actually changed.
 *
 * A locked competition offers no way in at all. A youth championship does not
 * admit a veteran because a club asked nicely, and the API refuses it too —
 * this only spares the round trip.
 *
 * Same section on both club screens, like ClubAdmins (#474): a club admin sees
 * their own club on /club, a general admin any club on /clubs/:id.
 */
export function ClubCompetitions({
  clubId,
  idPrefix = 'club',
  variant = 'panel',
}: {
  clubId: string
  idPrefix?: string
  /** Which page's furniture to wear — see ClubAdmins for why this exists. */
  variant?: 'panel' | 'section'
}) {
  const { user } = useAuth()
  const { competitions, players, competitionEligibilities, setCompetitionEligibility } = useAppData()
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage =
    user?.role === 'general_admin' || (user?.role === 'club_admin' && user.clubId === clubId)

  const available = useMemo(
    () => competitions.filter((c) => !c.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    [competitions],
  )
  const competition = available.find((c) => c.id === selectedId) ?? available[0]

  const clubPlayers = useMemo(
    () => sortByName(players.filter((p) => p.clubId === clubId && p.status === 'active')),
    [players, clubId],
  )

  // Overrides of this club only. A general admin sees every club's rows in the
  // payload, and reading them all here would let one club's exception decide
  // another club's list.
  const overrides = useMemo(
    () => competitionEligibilities.filter((e) => e.clubId === clubId),
    [competitionEligibilities, clubId],
  )

  const rows = useMemo(() => {
    if (!competition) return []
    return clubPlayers.map((player) => ({
      player,
      ...playerEligibility(player, competition, overrides),
      overridden: overrides.some(
        (o) => o.competitionId === competition.id && o.playerId === player.id,
      ),
    }))
  }, [clubPlayers, competition, overrides])

  const eligible = rows.filter((r) => r.eligible)
  const rest = rows.filter((r) => !r.eligible)

  const apply = async (playerId: string, effect: 'included' | 'excluded' | 'default') => {
    if (!competition) return
    setBusy(true)
    setError(null)
    const ok = await setCompetitionEligibility(clubId, competition.id, playerId, effect)
    setBusy(false)
    if (!ok) {
      setError(
        effect === 'included'
          ? "Cette compétition est réservée à certaines catégories : ce licencié ne peut pas y être ajouté."
          : "La modification n'a pas pu être enregistrée. Réessayez.",
      )
    }
  }

  const isSection = variant === 'section'

  const row = ({ player, reason, overridden }: (typeof rows)[number]) => {
    const category = categoryDisplay(player.category)
    const addable = competition ? canClubAdd(competition, player) : false
    return (
      <li
        key={player.id}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-0"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {player.firstName} {player.lastName}
          </p>
          <p className="text-xs text-slate-500">
            {category || 'Catégorie inconnue'} · {ELIGIBILITY_REASON_LABELS[reason]}
          </p>
        </div>
        {canManage && (
          overridden ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(player.id, 'default')}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 disabled:opacity-50 ${TEXT_TARGET_CLASS}`}
            >
              Rétablir le défaut
            </button>
          ) : reason === 'category' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(player.id, 'excluded')}
              className={`text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 ${TEXT_TARGET_CLASS}`}
            >
              Exclure
            </button>
          ) : addable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(player.id, 'included')}
              className={`text-sm font-medium text-accent-600 hover:text-accent-800 disabled:opacity-50 ${TEXT_TARGET_CLASS}`}
            >
              Ajouter
            </button>
          ) : (
            <span className="text-xs text-slate-400">Compétition réservée</span>
          )
        )}
      </li>
    )
  }

  return (
    <section
      aria-labelledby={`${idPrefix}-competitions-title`}
      className={
        isSection
          ? 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
          : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
      }
    >
      {isSection ? (
        <h3
          id={`${idPrefix}-competitions-title`}
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Compétitions
        </h3>
      ) : (
        <h2 id={`${idPrefix}-competitions-title`} className="font-display text-lg font-semibold text-slate-800">
          Compétitions
        </h2>
      )}

      {available.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Aucune compétition n'est définie. Tous les licenciés du club restent proposés partout.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <label htmlFor={`${idPrefix}-competition-select`} className="sr-only">
              Compétition
            </label>
            <select
              id={`${idPrefix}-competition-select`}
              value={competition?.id ?? ''}
              onChange={(e) => {
                setError(null)
                setSelectedId(e.target.value)
              }}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0"
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
          </div>

          {competition && (
            <p className="mt-2 text-xs text-slate-500">
              Par défaut : {categoriesSummary(competition.categories)}.
              {competition.isCategoryLocked
                ? ' Réservée à ces catégories — le club peut retirer un licencié, pas en ajouter un autre.'
                : ' Le club peut ajouter ou retirer des licenciés.'}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Éligibles ({eligible.length})
          </h4>
          {eligible.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Aucun licencié du club n'y est éligible.</p>
          ) : (
            <ul className="mt-1">{eligible.map(row)}</ul>
          )}

          {rest.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Non éligibles ({rest.length})
              </h4>
              <ul className="mt-1">{rest.map(row)}</ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
