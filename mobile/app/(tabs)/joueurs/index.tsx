import { useState } from 'react'
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAppData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/constants/colors'
import { sortByName } from '@shared/lib/sortByName'
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

  const visiblePlayers =
    user?.role === 'general_admin'
      ? players
      : players.filter((p) => p.clubId === user?.clubId)

  const filtered = sortByName(
    visiblePlayers.filter((p) => {
      const q = query.toLowerCase()
      return (
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
      )
    }),
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Rechercher…"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: p }) => {
          const club = clubs.find((c) => c.id === p.clubId)
          return (
            <TouchableOpacity
              style={styles.card}
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
                <Text style={styles.meta}>{club?.displayName}</Text>
              </View>
              <View style={[styles.statusBadge, p.status !== 'active' && styles.statusBadgeMuted]}>
                <Text style={[styles.statusText, p.status !== 'active' && styles.statusTextMuted]}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  list: { padding: 12, gap: 8 },
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
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  statusBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeMuted: { backgroundColor: '#f1f5f9' },
  statusText: { fontSize: 11, fontFamily: fonts.semiBold, color: '#16a34a' },
  statusTextMuted: { color: colors.textSecondary },
})
