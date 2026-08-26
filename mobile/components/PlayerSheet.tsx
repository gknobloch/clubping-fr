import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { Sheet } from '@/components/Sheet'
import { TeamBadge } from '@/components/TeamBadge'
import type { Player, Team } from '@shared/types'
import { fonts } from '@/constants/typography'

export type PlayerHistoryEntry = {
  jNumber?: number
  /** Home/away icon. If absent and jNumber is set, a · separator is rendered instead. */
  icon?: 'home' | 'paper-plane-outline'
  text: string
  /** The team this game was played for — shown as a small colored label. */
  team?: Team
  date: string
  isPast: boolean
}

function hexToRgba(hex: string, alpha: number): string {
  try {
    const h =
      hex.startsWith('#') && hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex
    const r = parseInt(h.slice(1, 3), 16)
    const g = parseInt(h.slice(3, 5), 16)
    const b = parseInt(h.slice(5, 7), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error()
    return `rgba(${r},${g},${b},${alpha})`
  } catch {
    return `rgba(226,59,59,${alpha})`
  }
}

export function PlayerSheet({
  player,
  phaseLabel,
  phasePoints,
  gamesPlayed,
  gamesTotal,
  team,
  brulageTeam,
  history,
  onClose,
  onProfile,
}: {
  player: Player
  /** e.g. "Saison 2025/2026 Phase 2" — used as section heading above phase stats */
  phaseLabel?: string
  phasePoints?: string
  gamesPlayed: number
  /** When provided, "Matchs joués" reads "played / total". */
  gamesTotal?: number
  team: Team | null
  brulageTeam: Team | null
  history: PlayerHistoryEntry[]
  onClose: () => void
  /** Overrides the "Profil" action. When omitted, it closes the sheet and opens
   *  the player's profile in the Joueurs tab. The button is always shown. */
  onProfile?: () => void
}) {
  const { clubs } = useAppData()
  const router = useRouter()

  const openProfile =
    onProfile ?? (() => { onClose(); router.push(`/player/${player.id}`) })

  return (
    <Sheet onClose={onClose} testID="player-sheet">
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Identity */}
        <Text style={s.name}>{player.firstName} {player.lastName}</Text>
        <View style={s.row}>
          <Text style={s.label}>Licence</Text>
          <Text style={s.value}>{player.licenseNumber}</Text>
        </View>

        <View style={s.divider} />

        {/* Phase stats */}
        {phaseLabel && <Text style={s.sectionHeading}>{phaseLabel}</Text>}
        <View style={s.rows}>
          {phasePoints && (
            <View style={s.row}>
              <Text style={s.label}>Points</Text>
              <Text style={s.value}>{phasePoints}</Text>
            </View>
          )}
          <View style={s.row}>
            <Text style={s.label}>Matchs joués</Text>
            <Text style={s.value}>
              {gamesTotal != null ? `${gamesPlayed} / ${gamesTotal}` : String(gamesPlayed)}
            </Text>
          </View>
          {team && (
            <View style={s.row}>
              <Text style={s.label}>Équipe</Text>
              <TeamBadge large color={team.color} label={getTeamName(team, clubs)} />
            </View>
          )}
          {brulageTeam && (
            <View style={s.row}>
              <Text style={s.label}>Brûlage</Text>
              <TeamBadge large danger color={brulageTeam.color} label={getTeamName(brulageTeam, clubs)} />
            </View>
          )}
        </View>

        {/* Game history — no heading, flows directly */}
        {history.length > 0 && (
          <View style={s.historySection}>
            {history.map((entry, i) => (
              <View key={i} style={s.historyRow}>
                <View style={s.historyLeft}>
                  {entry.jNumber != null && (
                    <Text style={[s.historyJ, entry.isPast && s.historyPast]}>
                      J{entry.jNumber}
                    </Text>
                  )}
                  {entry.team && (() => {
                    const tc = entry.team.color ?? colors.accent
                    return (
                      <View style={[s.historyTeamBadge, { borderColor: tc, backgroundColor: hexToRgba(tc, 0.1) }]}>
                        <Text style={[s.historyTeamNum, { color: tc }]}>{entry.team.number}</Text>
                      </View>
                    )
                  })()}
                  {entry.icon ? (
                    <Ionicons
                      name={entry.icon}
                      size={13}
                      color={entry.isPast ? '#94a3b8' : colors.textSecondary}
                    />
                  ) : entry.jNumber != null ? (
                    <Text style={[s.historyDot, entry.isPast && s.historyPast]}>·</Text>
                  ) : null}
                  <Text
                    style={[s.historyText, entry.isPast && s.historyPast]}
                    numberOfLines={1}
                  >
                    {entry.text}
                  </Text>
                </View>
                <Text style={[s.historyDate, entry.isPast && s.historyPast]}>
                  {entry.date}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer}>
          <TouchableOpacity style={[s.footerBtn, s.footerClose]} onPress={onClose}>
            <Text style={s.footerCloseTxt}>Fermer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.footerBtn, s.footerProfile]} onPress={openProfile}>
            <Text style={s.footerProfileTxt}>Profil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Sheet>
  )
}

const s = StyleSheet.create({
  name: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 12 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  sectionHeading: {
    fontSize: 12, fontFamily: fonts.bold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  rows: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, color: colors.textSecondary },
  value: {
    fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary,
    flexShrink: 1, textAlign: 'right',
  },
  historySection: { marginTop: 16, gap: 6 },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  historyJ: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent, width: 18 },
  // Circle for a 1-digit team number; grows to a pill for 2-digit numbers.
  historyTeamBadge: {
    minWidth: 18, height: 18, borderRadius: 9, borderWidth: 1,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
  },
  historyTeamNum: { fontSize: 11, fontFamily: fonts.bold },
  historyDot: { fontSize: 13, color: colors.textSecondary },
  historyText: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  historyDate: { fontSize: 13, color: colors.textSecondary },
  historyPast: { color: '#94a3b8' },

  footer: { flexDirection: 'row', gap: 10, marginTop: 20 },
  footerBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  footerClose: { backgroundColor: colors.bg },
  footerProfile: { backgroundColor: colors.accent },
  footerCloseTxt: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  footerProfileTxt: { fontSize: 15, fontFamily: fonts.semiBold, color: '#fff' },
})
