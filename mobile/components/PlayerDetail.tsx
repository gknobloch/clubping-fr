import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { colors } from '@/constants/colors'
import { getTeamName } from '@/utils/roles'
import { Screen, contentWidth } from '@/components/Screen'
import { PlayerIdentityCard } from '@/components/PlayerIdentityCard'
import { AvatarViewer } from '@/components/AvatarViewer'
import { fonts } from '@/constants/typography'
import { pointsFor } from '@shared/lib/phasePoints'

// ---------------------------------------------------------------------------
// La fiche joueur (#466)
//
// Extracted exactly as `TeamDetail` was in #447, and for the same reason: a
// tablet shows this beside the Joueurs list rather than pushed over it, and
// one component has to serve both — a second, pane-shaped copy would drift
// from this one within a release.
//
// `embedded` collects the two things that depend on which of the two it is:
// the header title (a pane has no pushed screen to name), and the safe-area
// frame (a pane sits inside one already).
// ---------------------------------------------------------------------------
export function PlayerDetail({
  playerId,
  /** Rendered in a section's detail pane rather than pushed on a stack. */
  embedded = false,
}: {
  playerId?: string
  embedded?: boolean
}) {
  const id = playerId
  const { players, teams, clubs, phases, seasons, playerPhasePoints } = useAppData()
  const navigation = useNavigation()
  const router = useRouter()
  const [avatarOpen, setAvatarOpen] = useState(false)

  const player = players.find((p) => p.id === id)
  const club = clubs.find((c) => c.id === player?.clubId)
  const activeSeason = seasons.find((s) => s.status === 'active')

  const activePhase = phases.find((p) => p.status === 'active')
  const playerTeams = teams.filter(
    (t) => t.phaseId === activePhase?.id && t.playerIds?.includes(id ?? ''),
  )

  // Points belong to (phase, player) since #384 — a player with no team this
  // phase still has them.
  const phasePoints = pointsFor(playerPhasePoints, activePhase?.id, id)

  // The pushed screen names itself after the licencié. In a pane there is no
  // such header to set — the one above belongs to the section, and is «Joueurs».
  useEffect(() => {
    if (player && !embedded)
      navigation.setOptions({ title: `${player.firstName} ${player.lastName}` })
  }, [player, navigation, embedded])

  if (!player) {
    return (
      <Screen pane={embedded}>
        <Text style={styles.notFound}>Joueur introuvable.</Text>
      </Screen>
    )
  }

  return (
    <Screen pane={embedded}>
      <ScrollView contentContainerStyle={[styles.scroll, contentWidth()]}>
        {/* Identity header — shared with the Accueil welcome header */}
        <PlayerIdentityCard
          style={styles.identityCard}
          playerId={player.id}
          avatarUpdatedAt={player.avatarUpdatedAt}
          firstName={player.firstName}
          lastName={player.lastName}
          name={`${player.firstName} ${player.lastName}`}
          club={club}
          status={player.status}
          onAvatarPress={player.avatarUpdatedAt ? () => setAvatarOpen(true) : undefined}
        />

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          {player.licenseNumber && <InfoRow label="Licence" value={player.licenseNumber} />}
          {phasePoints && <InfoRow label="Points" value={phasePoints} />}
          {player.email && <InfoRow label="Email" value={player.email} />}
          {player.phone && (
            <PhoneRow phone={player.phone} />
          )}
        </View>

        {/* Active phase teams — list style, aligned with the team detail roster */}
        {playerTeams.length > 0 && (
          <View style={styles.sectionList}>
            <Text style={styles.sectionListTitle}>Équipe</Text>
            {playerTeams.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.teamRow}
                onPress={() => router.push({ pathname: '/team/[id]', params: { id: t.id } })}
              >
                <View style={[styles.colorDot, { backgroundColor: t.color ?? colors.accent }]} />
                <Text style={styles.teamName}>{getTeamName(t, clubs)}</Text>
                {t.captainId === player.id && <Text style={styles.cap}>Cap.</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Matches — opens the shared player match list for this player */}
        <TouchableOpacity
          style={styles.matchesBtn}
          onPress={() => router.push({ pathname: '/mes-matchs', params: { playerId: player.id } })}
        >
          <View style={styles.matchesLeft}>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <View>
              <Text style={styles.matchesTitle}>Matchs</Text>
              {activeSeason ? (
                <Text style={styles.matchesSub} numberOfLines={1}>Saison {activeSeason.displayName}</Text>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

      </ScrollView>

      {avatarOpen && player.avatarUpdatedAt && (
        <AvatarViewer
          playerId={player.id}
          avatarUpdatedAt={player.avatarUpdatedAt}
          onClose={() => setAvatarOpen(false)}
        />
      )}
    </Screen>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function PhoneRow({ phone }: { phone: string }) {
  const digits = phone.replace(/[^\d+]/g, '')
  const waUrl = `https://wa.me/${digits.startsWith('+') ? digits.slice(1) : digits}`
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>Téléphone</Text>
      <TouchableOpacity onPress={() => Linking.openURL(waUrl)}>
        <Text style={[styles.infoValue, styles.phoneLink]}>{phone}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingTop: 16, paddingBottom: 32 },
  notFound: { padding: 24, color: colors.textSecondary, textAlign: 'center' },

  identityCard: { marginHorizontal: 16 },

  // Padded section (Informations)
  section: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
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
    letterSpacing: 0.5,
  },

  // List-style section (Équipe) — matches the team detail roster
  sectionList: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionListTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, color: colors.textPrimary, fontFamily: fonts.medium, flexShrink: 1, textAlign: 'right' },
  phoneLink: { color: '#25D366' },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { flex: 1, fontSize: 15, color: colors.textPrimary },
  cap: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // Matches button — mirrors the Accueil "Tous mes matchs" card
  matchesBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  matchesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  matchesTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  matchesSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
})
