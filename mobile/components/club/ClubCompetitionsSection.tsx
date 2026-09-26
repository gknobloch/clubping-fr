import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Sheet } from '@/components/Sheet'
import { ChecklistSheet } from '@/components/ChecklistSheet'
import { SelectMark, SelectionList, selection } from '@/components/Selection'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import {
  competitionGroupOf, competitionsOfClub, isPlayerEligible, playerEligibility,
  type EligiblePlayer,
} from '@shared/lib/competitionEligibility'
import { assignmentSummary, assignmentsByPlayer } from '@shared/lib/competitionAssignments'
import { categoriesSummary, categoryDisplay } from '@shared/lib/playerCategories'
import { withSeasonCategory } from '@shared/lib/seasonCategories'
import { sortByName } from '@shared/lib/sortByName'
import type {
  Club, Competition, CompetitionGroup, Division, GameSelection, MemberGroup, Player, PlayerSeasonCategory, Season, Team,
} from '@shared/types'
import { ClubSection, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Compétitions (#604) — le pendant de la section du web
//
// Chaque compétition que le club joue, le groupe auquel il l'a réservée, et de
// quoi ranger dans ce groupe ceux qui doivent y être. Le web en fait un
// tableau ; un téléphone n'en a pas la largeur, donc c'est la feuille du
// capitaine (`ChecklistSheet`) qui sert de tableau, et l'avertissement
// « engagés hors du groupe » règle le cas courant d'un geste.
//
// La règle — catégories ET groupe — est celle de
// `src/lib/competitionEligibility.ts`, la même que le web et l'API.
// ---------------------------------------------------------------------------

type ClubPlayer = EligiblePlayer & Player

const nameOf = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`
const names = (ps: ClubPlayer[]) => {
  const shown = ps.slice(0, 5).map(nameOf).join(', ')
  return ps.length > 5 ? `${shown} et ${ps.length - 5} autre${ps.length - 5 > 1 ? 's' : ''}` : shown
}

/** Nothing is ever taken off a team or a line-up (#482): the question says so. */
const askLeaving = (title: string, leaving: ClubPlayer[], confirmLabel: string) =>
  new Promise<boolean>((resolve) => {
    if (leaving.length === 0) { resolve(true); return }
    Alert.alert(
      title,
      `${leaving.length === 1 ? 'Un licencié que vos équipes engagent déjà ne sera' : `${leaving.length} licenciés que vos équipes engagent déjà ne seront`} plus éligible${leaving.length > 1 ? 's' : ''} : ${names(leaving)}. Rien ne les retire d'une équipe ni d'une composition ; ils ne seront simplement plus proposés ailleurs.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
    )
  })

export function ClubCompetitionsSection({
  club,
  canManage,
  groups,
  players,
  teams,
  divisions,
  competitions,
  competitionGroups,
  gameSelections,
  seasons,
  playerSeasonCategories,
  onChooseGroup,
  onSetMembers,
}: {
  club: Club
  canManage: boolean
  groups: MemberGroup[]
  players: Player[]
  teams: Team[]
  divisions: Division[]
  competitions: Competition[]
  competitionGroups: CompetitionGroup[]
  gameSelections: GameSelection[]
  seasons: Season[]
  playerSeasonCategories: PlayerSeasonCategory[]
  onChooseGroup: (competitionId: string, groupId: string | null) => void
  onSetMembers: (groupId: string, ids: string[]) => void
}) {
  const [showOthers, setShowOthers] = useState(false)
  const { played, others } = useMemo(
    () => competitionsOfClub(club.id, competitions, teams, divisions, competitionGroups),
    [club.id, competitions, teams, divisions, competitionGroups],
  )
  const seasonId = seasons.find((s) => s.status === 'active')?.id
  const clubPlayers = useMemo(
    () => withSeasonCategory(
      sortByName(players.filter((p) => p.clubId === club.id && p.status === 'active')),
      playerSeasonCategories,
      seasonId,
    ) as ClubPlayer[],
    [players, club.id, playerSeasonCategories, seasonId],
  )
  const clubTeams = useMemo(() => teams.filter((t) => t.clubId === club.id), [teams, club.id])

  if (played.length + others.length === 0) return null

  const card = (competition: Competition) => (
    <CompetitionCard
      key={competition.id}
      competition={competition}
      group={competitionGroupOf(club.id, competition.id, competitionGroups, groups)}
      groups={groups}
      players={clubPlayers}
      engaged={assignmentsByPlayer(competition.id, { teams: clubTeams, divisions, competitions, gameSelections })}
      canManage={canManage}
      onChooseGroup={(groupId) => onChooseGroup(competition.id, groupId)}
      onSetMembers={onSetMembers}
    />
  )

  return (
    <ClubSection title="Compétitions" testID="club-competitions">
      <Text style={section.hint}>
        Chaque compétition admet certaines catégories. Le club peut la réserver à l’un de ses groupes : seuls ses
        membres de ces catégories y sont alors proposés.
      </Text>
      {played.length === 0 && (
        <Text style={section.empty}>Aucune équipe du club n’est engagée dans une compétition.</Text>
      )}
      {played.map(card)}
      {others.length > 0 && (
        <TouchableOpacity
          testID="club-competitions-others"
          onPress={() => setShowOthers((v) => !v)}
          style={s.more}
          accessibilityRole="button"
          accessibilityState={{ expanded: showOthers }}
        >
          <Text style={section.action}>
            {showOthers ? 'Masquer' : 'Afficher'} les compétitions où le club n’a pas d’équipe ({others.length})
          </Text>
        </TouchableOpacity>
      )}
      {showOthers && others.map(card)}
    </ClubSection>
  )
}

function CompetitionCard({
  competition,
  group,
  groups,
  players,
  engaged,
  canManage,
  onChooseGroup,
  onSetMembers,
}: {
  competition: Competition
  group: MemberGroup | undefined
  groups: MemberGroup[]
  players: ClubPlayer[]
  engaged: ReturnType<typeof assignmentsByPlayer>
  canManage: boolean
  onChooseGroup: (groupId: string | null) => void
  onSetMembers: (groupId: string, ids: string[]) => void
}) {
  const [choosing, setChoosing] = useState(false)
  const [filing, setFiling] = useState(false)

  // Who the categories admit — whom a group can be made of.
  const admitted = players.filter((p) => playerEligibility(p, competition).eligible)
  const eligible = admitted.filter((p) => !group || group.memberIds.includes(p.id))
  const eligibleIds = new Set(eligible.map((p) => p.id))
  const conflicts = players.filter((p) => engaged.has(p.id) && !eligibleIds.has(p.id))
  const fixable = conflicts.filter((p) => admitted.includes(p))
  const noneLabel = competition.categories.length === 0 ? 'Aucun — tous les licenciés' : 'Aucun — tous ceux de ces catégories'

  const choose = async (groupId: string | null) => {
    setChoosing(false)
    const next = groups.find((g) => g.id === groupId)
    if (next) {
      const leaving = players.filter((p) => engaged.has(p.id) && !isPlayerEligible(p, competition, next))
      if (!(await askLeaving(`Réserver au groupe « ${next.displayName} » ?`, leaving, 'Réserver'))) return
    }
    onChooseGroup(groupId)
  }

  return (
    <View style={s.card} testID={`competition-${competition.id}`}>
      <Text style={s.name}>{competition.displayName}</Text>
      <Text style={section.rowSubtitle}>Catégories : {categoriesSummary(competition.categories)}</Text>

      <TouchableOpacity
        testID={`competition-group-${competition.id}`}
        style={s.groupRow}
        disabled={!canManage}
        onPress={() => setChoosing(true)}
        accessibilityRole={canManage ? 'button' : 'text'}
        accessibilityLabel={`Réservée au groupe : ${group?.displayName ?? noneLabel}`}
      >
        <Text style={s.groupLabel}>Réservée au groupe</Text>
        <Text style={[s.groupValue, !group && s.groupNone]} numberOfLines={1}>{group?.displayName ?? noneLabel}</Text>
        {canManage && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
      </TouchableOpacity>

      {conflicts.length > 0 && (
        <View style={s.alert} accessibilityRole="alert" testID={`competition-conflicts-${competition.id}`}>
          <Text style={s.alertText}>
            ⚠ {conflicts.length} joueur{conflicts.length > 1 ? 's' : ''} engagé{conflicts.length > 1 ? 's' : ''} mais plus éligible{conflicts.length > 1 ? 's' : ''} : {names(conflicts)}
          </Text>
          {canManage && group && fixable.length > 0 && (
            <TouchableOpacity
              testID={`competition-fix-${competition.id}`}
              onPress={() => Alert.alert(
                `Ajouter ${fixable.length} joueur${fixable.length > 1 ? 's' : ''} au groupe « ${group.displayName} » ?`,
                names(fixable),
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Ajouter', onPress: () => onSetMembers(group.id, [...group.memberIds, ...fixable.map((p) => p.id)]) },
                ],
              )}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
            >
              <Text style={s.alertAction}>Les ajouter au groupe</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={s.footer}>
        <Text style={section.hint}>
          {eligible.length} joueur{eligible.length > 1 ? 's' : ''} éligible{eligible.length > 1 ? 's' : ''}
        </Text>
        {canManage && group && (
          <TouchableOpacity
            testID={`competition-players-${competition.id}`}
            onPress={() => setFiling(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
          >
            <Text style={section.action}>Joueurs</Text>
          </TouchableOpacity>
        )}
      </View>

      {choosing && (
        <GroupChoice
          title={competition.displayName}
          noneLabel={noneLabel}
          groups={groups}
          value={group?.id ?? null}
          onPick={choose}
          onClose={() => setChoosing(false)}
        />
      )}

      {filing && group && (
        <ChecklistSheet
          testID="competition-players"
          rowTestIDPrefix="competition-player-"
          title={`${group.displayName} — ${competition.displayName}`}
          // Everyone the categories admit, with what the club needs to know
          // about each; the group's out-of-category members are kept as they
          // are — the sheet never drops what it did not show.
          options={admitted.map((p) => ({
            id: p.id,
            label: nameOf(p),
            hint: [categoryDisplay(p.category), assignmentSummary(engaged.get(p.id))].filter(Boolean).join(' · ') || undefined,
          }))}
          selected={group.memberIds}
          emptyLabel="Aucun licencié du club dans ces catégories."
          onSave={async (ids) => {
            const leaving = players.filter((p) => engaged.has(p.id) && group.memberIds.includes(p.id) && !ids.includes(p.id))
            if (!(await askLeaving(`Retirer du groupe « ${group.displayName} » ?`, leaving, 'Retirer'))) return false
            onSetMembers(group.id, ids)
            return true
          }}
          onClose={() => setFiling(false)}
        />
      )}
    </View>
  )
}

/** Pick one group, or none — a single choice, so a tap is the answer. */
function GroupChoice({
  title,
  noneLabel,
  groups,
  value,
  onPick,
  onClose,
}: {
  title: string
  noneLabel: string
  groups: MemberGroup[]
  value: string | null
  onPick: (groupId: string | null) => void
  onClose: () => void
}) {
  const options = [{ id: null as string | null, label: noneLabel }, ...groups.map((g) => ({ id: g.id as string | null, label: g.displayName }))]
  return (
    <Sheet onClose={onClose} testID="group-choice">
      <Text style={selection.title}>Réserver « {title} »</Text>
      <SelectionList>
        {options.map((o) => (
          <TouchableOpacity
            key={o.id ?? 'none'}
            testID={`group-choice-${o.id ?? 'none'}`}
            style={[selection.row, s.choice]}
            onPress={() => onPick(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: o.id === value }}
          >
            <View style={selection.checkTarget}><SelectMark picked={o.id === value} /></View>
            <Text style={[selection.name, o.id === value && selection.namePicked]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
        {groups.length === 0 && (
          <Text style={selection.empty}>Le club n’a encore aucun groupe : créez-en un dans la section Groupes.</Text>
        )}
      </SelectionList>
      <View style={selection.actions}>
        <TouchableOpacity testID="group-choice-cancel" style={selection.cancelBtn} onPress={onClose}>
          <Text style={selection.cancelTxt}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 4 },
  name: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 4 },
  groupLabel: { fontSize: 13, color: colors.textSecondary },
  groupValue: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: fonts.medium, color: colors.textPrimary },
  groupNone: { color: colors.textSecondary, fontFamily: fonts.regular },
  alert: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, gap: 6 },
  alertText: { fontSize: 13, color: '#92400E' },
  alertAction: { fontSize: 13, fontFamily: fonts.semiBold, color: '#78350F', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  more: { minHeight: 44, justifyContent: 'center' },
  choice: { minHeight: 48 },
})
