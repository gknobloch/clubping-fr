import { useState } from 'react'
import { Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Sheet } from '@/components/Sheet'
import { SelectionActions, selection } from '@/components/Selection'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { CHANNEL_LABELS } from '@/utils/club'
import type { Club, ClubChannel, ClubChannelType } from '@shared/types'
import { ClubSection, RowIcon, section } from './ClubSection'

// ---------------------------------------------------------------------------
// Canaux de communication (#135) — modifiables depuis l'app (#604)
//
// Toucher le nom ouvre le lien : l'icône « ouvrir » qui le suivait disait deux
// fois la même chose. Mais c'est un lien vers l'extérieur — WhatsApp, un site
// — et on quitte l'app : la question est posée avant, avec l'adresse.
// ---------------------------------------------------------------------------

// The web draws these inline (it has no icon library); the names below are the
// Ionicons it points at — see the note in src/components/ClubDetailView.tsx.
const CHANNEL_ICONS: Record<ClubChannelType, keyof typeof Ionicons.glyphMap> = {
  website: 'globe-outline',
  whatsapp: 'logo-whatsapp',
  facebook: 'logo-facebook',
  other: 'link-outline',
}

const TYPES: ClubChannelType[] = ['whatsapp', 'website', 'facebook', 'other']

/** A link as typed on a phone, made openable: « chat.whatsapp.com/… » works too. */
function normalizeLink(link: string): string {
  const trimmed = link.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const labelOf = (ch: ClubChannel) => ch.displayName?.trim() || CHANNEL_LABELS[ch.type]

function confirmOpen(ch: ClubChannel) {
  Alert.alert(labelOf(ch), `Ouvrir ce lien en dehors de l’application ?\n\n${ch.link}`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Ouvrir', onPress: () => Linking.openURL(ch.link).catch(() => {}) },
  ])
}

export function ClubChannels({
  club,
  canManage,
  onAdd,
  onUpdate,
  onDelete,
}: {
  club: Club
  canManage: boolean
  onAdd: (data: Omit<ClubChannel, 'id' | 'sortOrder'>) => void
  onUpdate: (channelId: string, patch: Partial<Omit<ClubChannel, 'id'>>) => void
  onDelete: (channelId: string) => void
}) {
  // `{}` is a new channel, `{ channel }` an existing one, null nothing open.
  const [editing, setEditing] = useState<{ channel?: ClubChannel } | null>(null)
  const channels = [...(club.channels ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  const confirmDelete = (ch: ClubChannel) =>
    Alert.alert(`Supprimer « ${labelOf(ch)} » ?`, 'Le lien disparaît de la page du club.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(ch.id) },
    ])

  return (
    <ClubSection
      title="Canaux de communication"
      testID="club-channels"
      action={canManage ? { label: '+ Nouveau', onPress: () => setEditing({}), testID: 'club-channel-new' } : undefined}
    >
      {channels.length === 0 ? (
        <Text style={section.empty}>Aucun canal.</Text>
      ) : (
        channels.map((ch) => (
          <View key={ch.id} style={section.row}>
            <TouchableOpacity
              testID={`club-channel-${ch.id}`}
              style={section.rowMain}
              onPress={() => confirmOpen(ch)}
              accessibilityRole="link"
              accessibilityLabel={labelOf(ch)}
            >
              <Ionicons name={CHANNEL_ICONS[ch.type]} size={20} color={colors.textSecondary} style={section.rowIcon} />
              <Text style={[section.rowTitle, section.rowBody]} numberOfLines={1}>{labelOf(ch)}</Text>
            </TouchableOpacity>
            {canManage && (
              <>
                <RowIcon
                  testID={`club-channel-edit-${ch.id}`}
                  name="create-outline"
                  label={`Modifier ${labelOf(ch)}`}
                  onPress={() => setEditing({ channel: ch })}
                />
                <RowIcon
                  testID={`club-channel-delete-${ch.id}`}
                  name="trash-outline"
                  label={`Supprimer ${labelOf(ch)}`}
                  danger
                  onPress={() => confirmDelete(ch)}
                />
              </>
            )}
          </View>
        ))
      )}

      {editing && (
        <ChannelEditor
          channel={editing.channel}
          onSave={(data) => (editing.channel ? onUpdate(editing.channel.id, data) : onAdd(data))}
          onClose={() => setEditing(null)}
        />
      )}
    </ClubSection>
  )
}

/** Create or change one channel: its kind, its link, and an optional name. */
function ChannelEditor({
  channel,
  onSave,
  onClose,
}: {
  channel?: ClubChannel
  onSave: (data: Omit<ClubChannel, 'id' | 'sortOrder'>) => void
  onClose: () => void
}) {
  const [type, setType] = useState<ClubChannelType>(channel?.type ?? 'whatsapp')
  const [link, setLink] = useState(channel?.link ?? '')
  const [name, setName] = useState(channel?.displayName ?? '')

  const save = () => {
    // Always the string, never undefined: an emptied name has to reach PATCH to
    // be cleared, and the label falls back to the channel's kind on its own.
    onSave({ type, link: normalizeLink(link), displayName: name.trim() })
    onClose()
  }

  return (
    <Sheet onClose={onClose} testID="channel-edit">
      <Text style={selection.title}>{channel ? 'Modifier le canal' : 'Nouveau canal'}</Text>
      <View style={s.types}>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            testID={`channel-type-${t}`}
            style={[s.type, type === t && s.typeOn]}
            onPress={() => setType(t)}
            accessibilityRole="radio"
            accessibilityState={{ checked: type === t }}
          >
            <Ionicons name={CHANNEL_ICONS[t]} size={16} color={type === t ? colors.accent : colors.textSecondary} />
            <Text style={[s.typeText, type === t && s.typeTextOn]}>{CHANNEL_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        testID="channel-edit-link"
        style={s.input}
        value={link}
        onChangeText={setLink}
        placeholder="Lien — https://…"
        placeholderTextColor={colors.textSecondary}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Lien"
      />
      <TextInput
        testID="channel-edit-name"
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder={`Nom (facultatif) — ${CHANNEL_LABELS[type]}`}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Nom"
      />
      <View style={s.actions}>
        <SelectionActions
          cancelTestID="channel-edit-cancel"
          saveTestID="channel-edit-save"
          saveDisabled={!link.trim()}
          onCancel={onClose}
          onSave={save}
        />
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  type: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  typeOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  typeText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textSecondary },
  typeTextOn: { color: colors.accent, fontFamily: fonts.semiBold },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, minHeight: 44, fontSize: 15, marginBottom: 10,
    color: colors.textPrimary, backgroundColor: colors.card,
    // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
    letterSpacing: 0,
  },
  actions: { marginTop: 6 },
})
