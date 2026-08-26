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
import { useAppData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/constants/colors'
import { useLayout } from '@/constants/layout'
import { sortByName } from '@shared/lib/sortByName'
import { hasVisited, lastSeenSentence } from '@shared/lib/lastSeen'
import {
  ACTIVE_ONLY_LABEL,
  canSeeArchivedPlayers,
  visiblePlayers,
} from '@shared/lib/playerVisibility'
import { Screen, contentWidth } from '@/components/Screen'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/constants/typography'

const STATUS_LABELS = {
  active: 'Actif',
  archived: 'Archivé',
}

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
  // Two columns of licenciés on a tablet, one on a phone (#446). A card is a
  // name and a line of meta: one per row across a slab is mostly empty card.
  const { isTablet } = useLayout()
  const columns = isTablet ? 2 : 1

  const clubPlayers =
    user?.role === 'general_admin'
      ? players
      : players.filter((p) => p.clubId === user?.clubId)

  // #406. The API only fills `lastSeenAt` in for members the caller
  // administers, so for anyone else it is uniformly absent — rendering it would
  // read as "nobody in this club has ever signed in".
  const showLastSeen = user?.role === 'general_admin' || user?.role === 'club_admin'

  const filtered = sortByName(
    visiblePlayers(clubPlayers, { role: user?.role, activeOnly }).filter((p) => {
      const q = query.toLowerCase()
      return (
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
      )
    }),
  )

  return (
    <Screen>
      <View style={[styles.searchBar, contentWidth(columns)]}>
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
        // `numColumns` is fixed for the life of a FlatList — React Native throws
        // when it changes — so the key changes with it and the list remounts.
        key={`columns-${columns}`}
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={[styles.list, contentWidth(columns)]}
        renderItem={({ item: p }) => {
          const club = clubs.find((c) => c.id === p.clubId)
          return (
            <TouchableOpacity
              // Only in a grid: as the single child of a column, `flex: 1`
              // would stretch the card down the whole list instead.
              style={[styles.card, columns > 1 && styles.cardInGrid]}
              onPress={() => router.push(`/player/${p.id}`)}
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
  row: { gap: 8 },
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
  cardInGrid: { flex: 1 },
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
