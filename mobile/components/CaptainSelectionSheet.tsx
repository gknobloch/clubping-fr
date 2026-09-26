import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useMemo, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import {
  SelectMark, SelectionActions, SelectionList, SelectionSearch, selection as shared,
} from '@/components/Selection'
import { PlayerQuickView } from '@/components/PlayerQuickView'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { isPlayerEligibleForTeam } from '@shared/lib/brulage'
import { PLAYER_SEARCH_THRESHOLD, filterPlayersBySearch } from '@shared/lib/playerSearch'
import { selectablePlayers } from '@shared/lib/playerVisibility'
import { clubLicences } from '@shared/lib/seasonLicences'
import { categoryFromIndex, seasonCategoryIndex } from '@shared/lib/seasonCategories'
import { teamEligibility } from '@shared/lib/competitionEligibility'
import { LicenceTag } from '@/components/LicenceTag'
import { playersCommittedElsewhere } from '@/utils/matchdays'
import type {
  AvailabilityStatus, Club, Player, Team, MatchDay, Game, GameSelection, PlayerSeasonLicence,
  Division, Competition, CompetitionGroup, MemberGroup, PlayerSeasonCategory,
} from '@shared/types'
import { fonts } from '@/constants/typography'

export interface SelectionData {
  matchDayId: string
  allClubPlayers: Player[]
  clubTeams: Team[]
  matchDays: MatchDay[]
  games: Game[]
  gameSelections: GameSelection[]
  /** Licences the FFTT listed, and the season to read them for (#488). */
  playerSeasonLicences?: PlayerSeasonLicence[]
  seasonId?: string
  /**
   * What the team's competition admits (#498). A team reaches its competition
   * through its division, and the categories through the season — so all four
   * travel together. Absent, nothing is restricted, which is what an offline
   * cache written before #498 hands over.
   */
  divisions?: Division[]
  competitions?: Competition[]
  /** The club's group for a competition, when it set one (#604). */
  competitionGroups?: CompetitionGroup[]
  memberGroups?: MemberGroup[]
  playerSeasonCategories?: PlayerSeasonCategory[]
}

// Bottom-sheet line-up picker for captains: this team's roster plus other
// club players still eligible (brûlage) for the match-day. Shared by the
// Accueil hero card and the Mes matchs game cards.
export function CaptainSelectionSheet({
  team,
  teamPlayers,
  clubs,
  playersPerGame,
  getAvailability,
  initialSelection,
  selectionData,
  onSave,
  onClose,
}: {
  team: Team
  teamPlayers: Player[]
  clubs: Club[]
  playersPerGame: number
  getAvailability: (pid: string) => AvailabilityStatus | undefined
  initialSelection: string[]
  selectionData: SelectionData
  onSave: (playerIds: string[]) => void
  onClose: () => void
}) {
  const [selection, setSelection] = useState<string[]>(initialSelection)
  const [quickViewId, setQuickViewId] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const {
    matchDayId, allClubPlayers, clubTeams, matchDays, games, gameSelections,
    playerSeasonLicences = [], seasonId,
    divisions = [], competitions = [], competitionGroups = [], memberGroups = [],
    playerSeasonCategories = [],
  } = selectionData

  // Not a filter: an unvalidated licence is usually a renewal in flight, so the
  // sheet flags it beside the name rather than hiding the player (#488).
  const unlicensed = useMemo(() => {
    const ids = allClubPlayers.map((p) => p.id)
    const { statusOf } = clubLicences(playerSeasonLicences, seasonId, ids)
    return new Set(ids.filter((id) => statusOf(id) === 'missing'))
  }, [allClubPlayers, playerSeasonLicences, seasonId])
  // Named, not counted: a captain needs to know *who* to check on, and this
  // sheet is where the mistake would be made (#488).
  const pickedUnlicensed = useMemo(
    () => allClubPlayers
      .filter((p) => selection.includes(p.id) && unlicensed.has(p.id))
      .map((p) => `${p.firstName} ${p.lastName}`),
    [selection, allClubPlayers, unlicensed],
  )

  // Archived players have left the club and are not offered (#454); the web
  // sheet has always filtered them out, this one did not. `initialSelection`
  // rather than the live selection, so no row disappears mid-tap.
  const fieldableRoster = useMemo(
    () => selectablePlayers(teamPlayers, initialSelection),
    [teamPlayers, initialSelection],
  )

  // Who the team's competition admits (#498), on top of the brûlage. Ineligible
  // licensees are left out rather than shown disabled: this sheet is the
  // line-up itself, not a browse of the club. Someone already picked stays —
  // `selectablePlayers` keeps the current selection, and `mayField` keeps the
  // roster, so an exclusion decided afterwards never empties a squad.
  const eligibility = useMemo(
    () => teamEligibility([team], {
      divisions,
      competitions,
      competitionGroups,
      memberGroups,
    }),
    [team, divisions, competitions, competitionGroups, memberGroups],
  )
  const categoryIndex = useMemo(
    () => seasonCategoryIndex(playerSeasonCategories),
    [playerSeasonCategories],
  )

  const eligibleOthers = useMemo(() => {
    const teamPlayerIds = new Set(teamPlayers.map((p) => p.id))
    return selectablePlayers(allClubPlayers, initialSelection).filter((p) => {
      if (teamPlayerIds.has(p.id)) return false
      if (initialSelection.includes(p.id)) return true
      if (!eligibility.mayField(team.id, {
        id: p.id,
        category: categoryFromIndex(categoryIndex, seasonId, p.id),
      })) return false
      return isPlayerEligibleForTeam(p.id, team, clubTeams, matchDays, games, gameSelections, matchDayId)
    })
  }, [allClubPlayers, teamPlayers, initialSelection, team, clubTeams, matchDays, games,
      gameSelections, matchDayId, eligibility, categoryIndex, seasonId])

  // The filter earns its row of screen and its keyboard only on a long list,
  // so it is the whole sheet that is counted, not one section (#454).
  const searchable = fieldableRoster.length + eligibleOthers.length > PLAYER_SEARCH_THRESHOLD
  const shownRoster = searchable ? filterPlayersBySearch(fieldableRoster, query) : fieldableRoster
  const shownOthers = searchable ? filterPlayersBySearch(eligibleOthers, query) : eligibleOthers

  // Players already fielded by another club team this same journée — can't be
  // picked again. Keyed by playerId → that team's number.
  const committedElsewhere = useMemo(() => {
    const round = matchDays.find((md) => md.id === matchDayId)?.number
    if (round === undefined) return new Map<string, number>()
    return playersCommittedElsewhere(team.id, round, clubTeams, games, matchDays, gameSelections)
  }, [team.id, clubTeams, games, matchDays, gameSelections, matchDayId])

  function toggle(pid: string) {
    if (committedElsewhere.has(pid) && !selection.includes(pid)) return
    setSelection((prev) => {
      if (prev.includes(pid)) return prev.filter((id) => id !== pid)
      if (prev.length >= playersPerGame) {
        Alert.alert('Limite atteinte', `Maximum ${playersPerGame} joueurs par match.`)
        return prev
      }
      return [...prev, pid]
    })
  }

  function renderPlayerRow(p: Player) {
    const avail = getAvailability(p.id)
    const picked = selection.includes(p.id)
    const cfg = avail ? AVAIL[avail] : null
    const lockedTeam = !picked ? committedElsewhere.get(p.id) : undefined
    const locked = lockedTeam !== undefined
    return (
      // Two targets, not one (#585). The box alone picks; the name opens the
      // aperçu, as a name does everywhere else in the app. The row used to be
      // one big toggle, so there was nowhere left to ask «who is this?» —
      // which is the question a captain has while composing, not after.
      <View key={p.id} style={[shared.row, locked && sel.playerRowLocked]}>
        <TouchableOpacity
          testID={`selection-toggle-${p.id}`}
          style={shared.checkTarget}
          onPress={() => toggle(p.id)}
          disabled={locked}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: picked, disabled: locked }}
          accessibilityLabel={`${p.firstName} ${p.lastName}`}
        >
          <SelectMark picked={picked} />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`selection-open-${p.id}`}
          style={sel.nameTarget}
          onPress={() => setQuickViewId(p.id)}
          accessibilityRole="button"
        >
          <View style={sel.nameCell}>
            <Text style={[shared.name, picked && shared.namePicked]} numberOfLines={1}>
              {p.firstName} {p.lastName}
            </Text>
            {unlicensed.has(p.id) && <LicenceTag />}
          </View>
          {locked ? (
            <Text style={sel.lockedTxt}>Équipe {lockedTeam}</Text>
          ) : cfg ? (
            <View style={[sel.availChip, { backgroundColor: cfg.bg }]}>
              <Text style={[sel.availTxt, { color: cfg.color }]}>{cfg.short}</Text>
            </View>
          ) : (
            <Text style={sel.noAvail}>—</Text>
          )}
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <Sheet onClose={onClose} testID="selection-sheet">
      <Text style={shared.title}>
        Sélection — {getTeamName(team, clubs)} ({selection.length}/{playersPerGame})
      </Text>
      {pickedUnlicensed.length > 0 && (
        <Text style={sel.licenceWarning}>
          {pickedUnlicensed.length === 1
            ? `${pickedUnlicensed[0]} n’a pas de licence validée pour cette saison à la FFTT.`
            : `${pickedUnlicensed.length} joueurs alignés n’ont pas de licence validée pour cette saison à la FFTT : ${pickedUnlicensed.join(', ')}.`}
          {' '}Vérifiez avant la rencontre.
        </Text>
      )}
      {searchable && <SelectionSearch value={query} onChangeText={setQuery} />}
      <SelectionList>
        {shownRoster.length > 0 && (
          <>
            <Text style={shared.sectionLabel}>Cette équipe</Text>
            {shownRoster.map(renderPlayerRow)}
          </>
        )}
        {shownOthers.length > 0 && (
          <>
            <Text style={shared.sectionLabel}>Autres joueurs</Text>
            {shownOthers.map(renderPlayerRow)}
          </>
        )}
        {shownRoster.length === 0 && shownOthers.length === 0 && query.trim() !== '' && (
          <Text style={shared.empty}>Aucun joueur ne correspond à « {query.trim()} ».</Text>
        )}
      </SelectionList>
      <SelectionActions
        cancelTestID="selection-cancel"
        onCancel={onClose}
        onSave={() => { onSave(selection); onClose() }}
      />
      {/* Rendu **dans** cette feuille, et non à côté d'elle : `Sheet` est un
          `Modal`, et iOS ne présente pas un second modal par-dessus un modal
          déjà présenté — en frère, l'aperçu s'ouvrait sans jamais se voir.

          Sans « Profil » : partir d'ici abandonnerait la composition en cours.
          La question qu'on se pose en composant est « qui est-ce ? », et elle
          se referme là où elle s'est posée (#585). */}
      {quickViewId && (
        <PlayerQuickView
          playerId={quickViewId}
          team={team}
          showProfile={false}
          onClose={() => setQuickViewId(null)}
        />
      )}
    </Sheet>
  )
}

const sel = StyleSheet.create({
  nameCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  licenceWarning: {
    marginBottom: 8, borderRadius: 8, backgroundColor: '#FEF3C7',
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: '#92400E',
  },
  // Everything else on the row, so «qui est-ce ?» has the space the box does
  // not need.
  nameTarget: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
  },
  availChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  availTxt: { fontSize: 11, fontFamily: fonts.semiBold },
  noAvail: { fontSize: 12, color: colors.border },
  playerRowLocked: { opacity: 0.45 },
  lockedTxt: { fontSize: 11, fontStyle: 'italic', color: colors.textSecondary },
})
