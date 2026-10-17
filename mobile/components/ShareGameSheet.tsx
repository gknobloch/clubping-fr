import { useState } from 'react'
import { Linking, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { Sheet } from '@/components/Sheet'
import { SelectionList, selection } from '@/components/Selection'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { gameShareMessage, gameShareUrl, whatsAppShareUrl } from '@shared/lib/gameShare'
import type { Club, Game, MatchDay, Team } from '@shared/types'

const WHATSAPP_GREEN = '#25D366'

/**
 * « Partager le match » (#747) — the web's `ShareGameButton`, row for row.
 *
 * The link names the sender's team only as a hint: whoever opens it lands on
 * their own side, under the profile that plays it (`sharedGameOpening`).
 */
export function ShareGameSheet({ game, matchDay, team, teams, clubs, onClose }: {
  game: Game
  matchDay: MatchDay
  /** The side of the fixture on screen — the sender's. */
  team: Team
  teams: Team[]
  clubs: Club[]
  onClose: () => void
}) {
  const [done, setDone] = useState<'link' | 'group' | null>(null)
  const url = gameShareUrl({ gameId: game.id, teamId: team.id })
  const message = gameShareMessage({ game, matchDay, teams, clubs, url })
  // What the sheet shows: the message without its link — an id of eighty
  // characters says nothing to whoever is about to send it.
  const preview = gameShareMessage({ game, matchDay, teams, clubs, url: '' })

  const open = (target: string) => Linking.openURL(target).catch(() => {})

  // WhatsApp cannot be told to post into a given group: an invite link only
  // opens it. So the message goes to the clipboard first, and the row says to
  // paste it — the sheet stays open behind WhatsApp to say so on return.
  async function shareToGroup() {
    await Clipboard.setStringAsync(message)
    setDone('group')
    if (team.whatsappLink) void open(team.whatsappLink)
  }

  async function copyLink() {
    await Clipboard.setStringAsync(url)
    setDone('link')
  }

  async function shareNative() {
    try {
      const result = await Share.share({ message })
      if (result.action === Share.sharedAction) onClose()
    } catch {
      /* nothing to share to: stay on the choices */
    }
  }

  return (
    <Sheet onClose={onClose} testID="share-game-sheet">
      <Text style={selection.title}>Partager le match</Text>
      <Text style={s.preview} testID="share-game-message">{preview}</Text>
      <SelectionList>
        {team.whatsappLink ? (
          <Row
            testID="share-game-group"
            icon={<Ionicons name="logo-whatsapp" size={22} color={WHATSAPP_GREEN} />}
            label="Dans le groupe de l'équipe"
            hint={done === 'group' ? 'Message copié : collez-le dans le groupe.' : 'Copie le message et ouvre le groupe WhatsApp'}
            onPress={shareToGroup}
          />
        ) : null}
        <Row
          testID="share-game-whatsapp"
          icon={<Ionicons name="logo-whatsapp" size={22} color={WHATSAPP_GREEN} />}
          label="Envoyer sur WhatsApp"
          onPress={() => {
            void open(whatsAppShareUrl(message))
            onClose()
          }}
        />
        <Row
          testID="share-game-copy"
          icon={<Ionicons name={done === 'link' ? 'checkmark' : 'link-outline'} size={22} color={colors.textSecondary} />}
          label={done === 'link' ? 'Lien copié' : 'Copier le lien'}
          onPress={copyLink}
        />
        <Row
          testID="share-game-native"
          icon={<Ionicons name="share-outline" size={22} color={colors.textSecondary} />}
          label="Autres applications…"
          onPress={shareNative}
        />
      </SelectionList>
      <View style={selection.actions}>
        <TouchableOpacity testID="share-game-close" style={selection.cancelBtn} onPress={onClose}>
          <Text style={selection.cancelTxt}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

function Row({ icon, label, hint, onPress, testID }: {
  icon: React.ReactNode
  label: string
  hint?: string
  onPress: () => void
  testID: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={s.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      <View style={s.icon}>{icon}</View>
      <View style={s.body}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  preview: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  icon: { width: 28, alignItems: 'center' },
  body: { flex: 1, gap: 1 },
  label: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textSecondary },
})
