import { useState } from 'react'
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAppData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/constants/colors'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
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
  const { players, clubs } = useAppData()
  const { user } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  // The roster is the active players, for everybody, every time the screen
  // opens (#438). Only the people who administer the club are given the switch
  // that widens it — an archived member has left, and looking someone up is
  // what this tab is for.
  const [activeOnly, setActiveOnly] = useState(true)
  const canSeeArchived = canSeeArchivedPlayers(user?.role)
  // The fiche beside the list rather than pushed over it (#466).
  const { isTwoPane } = useLayout()
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const filtered = roster.filter((p) => {
    const q = query.toLowerCase()
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
  })

  // Read from the roster and *not* from the search results — the one place this
  // differs from Équipes, where the selection is read from the phase on screen
  // because changing phase changes the subject. Typing does not: narrowing the
  // list to find the next person must not blank the fiche being read. The
  // switch that hides the archived ones does empty it, which is right — that
  // one is a change of who this list is about.
  const selectedPlayer = roster.find((p) => p.id === selectedId) ?? null

  function openPlayer(id: string) {
    if (isTwoPane) setSelectedId(id)
    else router.push(`/player/${id}`)
  }

  const list = (
    <>
      <View style={[styles.searchBar, contentWidth()]}>
        <TextInput
          style={styles.input}
          placeholder="Rechercher…"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
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
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, contentWidth()]}
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
