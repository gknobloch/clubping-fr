import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
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
import { categoryFor } from '@shared/lib/seasonCategories'
import { categoryDisplay } from '@shared/lib/playerCategories'
import { clubLicences } from '@shared/lib/seasonLicences'
import { LicenceTag } from '@/components/LicenceTag'
import { EmailRow, PhoneRow } from '@/components/ContactRows'
import { TeamBadge } from '@/components/TeamBadge'
import { computeBrulage } from '@shared/lib/brulage'

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
  const {
    players, teams, clubs, phases, seasons, playerPhasePoints,
    playerSeasonCategories, playerSeasonLicences, matchDays, games, gameSelections,
  } = useAppData()
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

  // A category belongs to a season, not to the licensee (#482): a cadet becomes
  // a junior, and last season's answer is not this season's.
  const category = categoryDisplay(categoryFor(playerSeasonCategories, activeSeason?.id, id))

  // Brûlage — the same answer the quick view and the journées matrix give.
  //
  // It belongs on the fiche because this is the screen somebody opens to ask
  // "can I field them?", and the fiche was the one place that listed a
  // licensee's situation without it. `computeBrulage` is the single derivation
  // (src/lib/brulage.ts); never re-answer it at a call site.
  //
  // Over the whole phase, with no `asOfMatchDayId`: a fiche is not being read
  // from inside one match-day, so the question is simply where they stand now.
  const brulageTeam = (() => {
    if (!player || !activePhase) return null
    const clubTeamsInPhase = teams.filter(
      (t) => t.phaseId === activePhase.id && t.clubId === player.clubId,
    )
    // Defaulted: an offline cache written before these rode in `DataState`
    // has none of them, and a fiche that cannot answer "burned?" should say
    // nothing rather than fail to render at all (same rule as #498).
    const info = computeBrulage(
      player.id, clubTeamsInPhase, matchDays ?? [], games ?? [], gameSelections ?? [],
    )
    if (!info.burnedIntoTeamId) return null
    return teams.find((t) => t.id === info.burnedIntoTeamId) ?? null
  })()

  // And whether the federation listed their licence at all this season (#488).
  const unlicensed = !!player && clubLicences(
    playerSeasonLicences,
    activeSeason?.id,
    players.filter((p) => p.clubId === player.clubId).map((p) => p.id),
  ).statusOf(player.id) === 'missing'

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

        {unlicensed && (
          <View style={styles.section}>
            <LicenceTag />
            <Text style={styles.licenceNote}>
              La FFTT n’a pas listé sa licence pour cette saison.
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          {player.licenseNumber && <InfoRow label="Licence" value={player.licenseNumber} />}
          <InfoRow label="Catégorie" value={category || 'Inconnue'} />
          {phasePoints && <InfoRow label="Points" value={phasePoints} />}
          {/* Copiables, both of them (#503) — the tap on the number still
              opens WhatsApp. */}
          {player.email && <EmailRow email={player.email} />}
          {player.phone && <PhoneRow phone={player.phone} />}
          {/* Same badge as the quick view, `danger` and all: the two screens
              show one licensee, and a rule that looked different depending on
              which you opened would be worse than one screen not showing it. */}
          {brulageTeam && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Brûlage</Text>
              <TeamBadge large danger color={brulageTeam.color} label={getTeamName(brulageTeam, clubs)} />
            </View>
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

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingTop: 16, paddingBottom: 32 },
  notFound: { padding: 24, color: colors.textSecondary, textAlign: 'center' },

  identityCard: { marginHorizontal: 16 },

  licenceNote: { marginTop: 6, fontSize: 12, color: colors.textSecondary },

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
