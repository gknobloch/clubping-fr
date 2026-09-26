import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAppData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/constants/colors'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
import { usePaneSelection } from '@/utils/paneSelection'
import type { Player } from '@shared/types'
import { sortByName } from '@shared/lib/sortByName'
import { hasVisited, lastSeenSentence } from '@shared/lib/lastSeen'
import {
  ACTIVE_ONLY_LABEL,
  canSeeArchivedPlayers,
  visiblePlayers,
} from '@shared/lib/playerVisibility'
import { Screen, contentWidth } from '@/components/Screen'
import { Avatar } from '@/components/Avatar'
import { PlayerDetail } from '@/components/PlayerDetail'
import { fonts } from '@/constants/typography'
import { GroupMatchSwitch, MemberGroupFilter } from '@/components/MemberGroupFilter'
import { canManageClub } from '@/utils/roles'
import { PLAYER_SEARCH_LABEL } from '@shared/lib/playerSearch'
import { clubMemberGroups, memberGroupFilter, type GroupMatch } from '@shared/lib/memberGroups'

const STATUS_LABELS = {
  active: 'Actif',
  archived: 'Archivé',
}

// ---------------------------------------------------------------------------
// Joueurs, sur une tablette : la liste et la fiche, côte à côte (#466)
//
// The pattern #447 built for Équipes, on the section that wanted it most. This
// tab opens on a search box — it exists to look somebody up — and until now
// every look-up cost a pushed screen and a way back out of it.
//
// It replaces the two-column grid #446 gave the tablet here, deliberately: a
// 320pt list pane holds one column, so the two cannot both exist. The grid
// served *scanning* a roster; the panes serve *finding one person*, which is
// what the search box at the top says this tab is for.
// ---------------------------------------------------------------------------
export default function JoueursScreen() {
  const { players, clubs, memberGroups } = useAppData()
  const { user } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  // The roster is the active players, for everybody, every time the screen
  // opens (#438). Only the people who administer the club are given the switch
  // that widens it — an archived member has left, and looking someone up is
  // what this tab is for.
  const [activeOnly, setActiveOnly] = useState(true)
  const canSeeArchived = canSeeArchivedPlayers(user?.role)
  // The FFTT import writes into one club, so it needs one to write into: a
  // general admin sees every club's licensees here and has no target (#555).
  // Back on this list since #604 — it brings the roster in, and this is where
  // a club checks what it brought.
  const ownClub = user?.clubId ? clubs.find((c) => c.id === user.clubId) : undefined
  const canImport =
    !!user && !!ownClub && canManageClub(user, ownClub.id) && !!ownClub.affiliationNumber
  // The fiche beside the list rather than pushed over it (#466).
  const { isTwoPane } = useLayout()
  const listRef = useRef<FlatList<Player>>(null)
  // The row a selection from elsewhere still owes the list. Held rather than
  // scrolled to on the spot: on mount the list has measured nothing yet.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null)
  const { selectedId, select } = usePaneSelection({ onArrival: setPendingScroll })

  const clubPlayers =
    user?.role === 'general_admin'
      ? players
      : players.filter((p) => p.clubId === user?.clubId)

  // #406. The API only fills `lastSeenAt` in for members the caller
  // administers, so for anyone else it is uniformly absent — rendering it would
  // read as "nobody in this club has ever signed in".
  const showLastSeen = user?.role === 'general_admin' || user?.role === 'club_admin'

  /** The roster this member may see — the actif/archivé rule (#438), unsearched. */
  const roster = sortByName(visiblePlayers(clubPlayers, { role: user?.role, activeOnly }))

  // The group filter (#602) rides in the route, like the selection (#585): the
  // club tab opens this list already narrowed to one of its groups. Cleared
  // with the empty string rather than `undefined`, which is the one value a
  // merge cannot be trusted to drop.
  const params = useLocalSearchParams<{ groupes?: string; mode?: string }>()
  const selectedGroupIds = (params.groupes ?? '').split(',').filter(Boolean)
  const groupMatch: GroupMatch = params.mode === 'tous' ? 'all' : 'any'
  const setGroupFilter = (ids: string[], mode: GroupMatch) =>
    router.setParams({ groupes: ids.join(','), mode: mode === 'all' ? 'tous' : '' })
  // Whose groups: the member's own club — or, for a general admin, who sees
  // every club here, the club of a group they arrived filtered on.
  const groupClubId = user?.role === 'general_admin'
    ? memberGroups.find((g) => selectedGroupIds.includes(g.id))?.clubId
    : user?.clubId
  const filterGroups = clubMemberGroups(memberGroups, groupClubId)
  const inGroups = memberGroupFilter(filterGroups, selectedGroupIds, groupMatch)

  const filtered = roster.filter((p) => {
    const q = query.toLowerCase()
    return (
      inGroups(p.id) &&
      (p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q))
    )
  })

  // Read from the roster and *not* from the search results — the one place this
  // differs from Équipes, where the selection is read from the phase on screen
  // because changing phase changes the subject. Typing does not: narrowing the
  // list to find the next person must not blank the fiche being read. The
  // switch that hides the archived ones does empty it, which is right — that
  // one is a change of who this list is about.
  const selectedPlayer = roster.find((p) => p.id === selectedId) ?? null

  // A club of sixty is the case this exists for: a licensee named from another
  // tab is otherwise selected forty rows below the fold, on a list that looks
  // untouched. Centred, so the neighbours say where in the alphabet it landed.
  // The target is `filtered` and not the roster — the row to bring on screen
  // is the one the list actually renders.
  useEffect(() => {
    if (!pendingScroll) return
    const index = filtered.findIndex((p) => p.id === pendingScroll)
    if (index < 0) return
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 })
    setPendingScroll(null)
  }, [pendingScroll, filtered])

  function openPlayer(id: string) {
    if (isTwoPane) select(id)
    else router.push(`/player/${id}`)
  }

  const list = (
    <>
      {/* The list's controls, in the web's order (#602): search, the club's
          groups, the two switches, and how many that leaves. */}
      <View style={[styles.searchBar, contentWidth()]}>
        {/* The import as an icon beside the search box, not a banner under it:
            a full-width row of its own pushed the list down for a task a club
            runs a few times a season. The label rides in its accessible name. */}
        <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, styles.inputGrow]}
          placeholder={PLAYER_SEARCH_LABEL}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
        {canImport && (
          <TouchableOpacity
            testID="import-players"
            style={styles.importButton}
            onPress={() => router.push('/joueurs/import')}
            accessibilityRole="button"
            accessibilityLabel="Importer les licenciés FFTT"
          >
            <Ionicons name="cloud-download-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
        </View>
        <MemberGroupFilter
          groups={filterGroups}
          selected={selectedGroupIds}
          mode={groupMatch}
          onChange={setGroupFilter}
        />
        <GroupMatchSwitch
          groups={filterGroups}
          selected={selectedGroupIds}
          mode={groupMatch}
          onChange={setGroupFilter}
        />
        {canSeeArchived && (
          <View style={styles.filterRow}>
            <Switch
              value={activeOnly}
              onValueChange={setActiveOnly}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={ACTIVE_ONLY_LABEL}
            />
            <Text style={styles.filterLabel}>{ACTIVE_ONLY_LABEL}</Text>
          </View>
        )}
        {/* Always said, as on the web: it is how a member reads what the
            controls above have done — the more so when the list is empty,
            which would otherwise read as a club with nobody in it. */}
        {/* « Effacer » by the count, as on the web: on the chip row it took a
            line of its own as soon as a long group name filled the one before. */}
        <View style={styles.countRow}>
          <Text style={styles.resultCount} testID="players-count">
            {filtered.length} joueur{filtered.length > 1 ? 's' : ''}
          </Text>
          {filterGroups.some((g) => selectedGroupIds.includes(g.id)) && (
            <TouchableOpacity
              testID="group-filter-clear"
              onPress={() => setGroupFilter([], groupMatch)}
              hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>Effacer</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, contentWidth()]}
        // A row can be asked for before the list has measured it — an arrival
        // on mount, or one far enough down that nothing below the fold is laid
        // out yet. Let the list settle, then ask again.
        onScrollToIndexFailed={({ index }) => {
          setTimeout(
            () => listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 }),
            0,
          )
        }}
        renderItem={({ item: p }) => {
          const club = clubs.find((c) => c.id === p.clubId)
          const isSelected = p.id === selectedPlayer?.id
          return (
            <TouchableOpacity
              testID={`player-row-${p.id}`}
              style={[styles.card, isSelected && styles.cardSelected]}
              accessibilityState={isSelected ? { selected: true } : {}}
              onPress={() => openPlayer(p.id)}
            >
              <Avatar
                playerId={p.id}
                avatarUpdatedAt={p.avatarUpdatedAt}
                firstName={p.firstName}
                lastName={p.lastName}
                size={40}
              />
              <View style={styles.cardBody}>
                <Text style={styles.name}>{p.firstName} {p.lastName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {club?.displayName}
                  {showLastSeen && (
                    <Text style={hasVisited(p.lastSeenAt) ? undefined : styles.metaNever}>
                      {' · '}
                      {lastSeenSentence(p.lastSeenAt)}
                    </Text>
                  )}
                </Text>
              </View>
              {/* Only when it says something. With the list on active-only by
                  default (#438) a green «Actif» on every card is a badge that
                  never varies; the web list has always shown it this way. */}
              {p.status !== 'active' && (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{STATUS_LABELS[p.status] ?? p.status}</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        }}
      />
    </>
  )

  if (!isTwoPane) return <Screen>{list}</Screen>

  return (
    // One frame for the two panes: `Screen` takes the window's side insets
    // once, here, and each pane sits inside them.
    <Screen style={styles.split}>
      <View style={styles.listPane}>{list}</View>
      <View style={styles.detailPane}>
        {selectedPlayer ? (
          <PlayerDetail playerId={selectedPlayer.id} embedded />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="person-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>
              Choisissez un licencié pour afficher sa fiche.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  searchBar: { padding: 12, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputGrow: { flex: 1 },
  importButton: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accentSoftBorder, backgroundColor: colors.accentSoft,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    // iOS renders TextInput placeholders with stray letter-spacing unless an
    // explicit value is set; pin it to 0 so placeholders track normally (#118).
    letterSpacing: 0,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  resultCount: { fontSize: 13, color: colors.textSecondary },
  clearText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.accent },
  filterLabel: { fontSize: 13, color: colors.textSecondary },
  list: { padding: 12, gap: 8 },

  split: { flexDirection: 'row' },
  listPane: {
    width: LIST_PANE_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  detailPane: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // The row showing in the pane beside it — the same red-tinted surface the
  // Équipes list uses (#447).
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  metaNever: { color: colors.warningText },
  statusBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary },
})
