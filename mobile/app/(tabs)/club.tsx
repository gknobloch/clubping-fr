import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ClubLogo } from '@/components/ClubLogo'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { CHANNEL_LABELS, formatAddress, mapsUrl } from '@/utils/club'
import type { Address, ClubChannel, ClubChannelType } from '@shared/types'

// ---------------------------------------------------------------------------
// Mon club — read-only view of the member's own club (#365)
//
// Mirrors what the web shows a player on /club (src/pages/MyClubPage.tsx):
// identity, addresses, communication channels. Editing stays on the web for
// now. Everything here is already in the GET /api/data payload.
// ---------------------------------------------------------------------------

// The web draws these inline (it has no icon library); the names below are the
// Ionicons it points at — see the note in src/components/ClubDetailView.tsx.
const CHANNEL_ICONS: Record<ClubChannelType, keyof typeof Ionicons.glyphMap> = {
  website: 'globe-outline',
  whatsapp: 'logo-whatsapp',
  facebook: 'logo-facebook',
  other: 'link-outline',
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    /* no app to handle it — nothing useful to say beyond not crashing */
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function AddressRow({ address }: { address: Address }) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => openUrl(mapsUrl(address))}
      accessibilityRole="button"
      accessibilityLabel={`${address.label} — ouvrir dans le plan`}
    >
      <View style={s.rowBody}>
        <View style={s.rowTitleLine}>
          <Text style={s.rowTitle}>{address.label}</Text>
          {address.isDefault && (
            <View style={s.badge}>
              <Text style={s.badgeText}>Par défaut</Text>
            </View>
          )}
        </View>
        <Text style={s.rowSubtitle}>{formatAddress(address)}</Text>
      </View>
      <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  )
}

function ChannelRow({ channel }: { channel: ClubChannel }) {
  const label = channel.displayName?.trim() || CHANNEL_LABELS[channel.type]
  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => openUrl(channel.link)}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Ionicons
        name={CHANNEL_ICONS[channel.type]}
        size={20}
        color={colors.textSecondary}
        style={s.rowIcon}
      />
      {/* Label only, as on the web: the raw link is long, unreadable and
          says nothing the label doesn't. */}
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{label}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  )
}

export default function ClubScreen() {
  const { user } = useAuth()
  const { clubs, refreshing, refresh } = useAppData()

  const club = user?.clubId ? clubs.find((c) => c.id === user.clubId) : undefined

  if (!club) {
    // The tab is hidden for a member with no club, so this is the transient
    // case: the payload has not arrived yet, or the club was archived away.
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyText}>Club introuvable.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const addresses = club.addresses ?? []
  const channels = [...(club.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={s.identity}>
          <ClubLogo
            clubId={club.id}
            logoUpdatedAt={club.logoUpdatedAt}
            name={club.displayName}
            size={56}
          />
          <View style={s.identityBody}>
            <Text style={s.clubName}>{club.displayName}</Text>
            <Text style={s.affiliation}>N° {club.affiliationNumber}</Text>
          </View>
        </View>

        <Section title="Adresses">
          {addresses.length === 0 ? (
            <Text style={s.sectionEmpty}>Aucune adresse.</Text>
          ) : (
            addresses.map((a) => <AddressRow key={a.id} address={a} />)
          )}
        </Section>

        <Section title="Canaux de communication">
          {channels.length === 0 ? (
            <Text style={s.sectionEmpty}>Aucun canal.</Text>
          ) : (
            channels.map((ch) => <ChannelRow key={ch.id} channel={ch} />)
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 16 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  identityBody: { flex: 1 },
  clubName: { fontSize: 18, fontFamily: fonts.semiBold, color: colors.textPrimary },
  affiliation: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionEmpty: { fontSize: 14, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIcon: { width: 20 },
  rowBody: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  rowSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: {
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
})
