import {
  ScrollView, View, Text, StyleSheet,
  TouchableOpacity, Linking, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppData } from '@/contexts/DataContext'
import { colors } from '@/constants/colors'
import { getTeamName, getRoleLabel } from '@/utils/roles'
import { Avatar } from '@/components/Avatar'
import { pickAvatarFromLibrary, takeAvatarPhoto, type ProcessedAvatar } from '@/utils/avatar'
import type { Player } from '@shared/types'
import { pointsFor } from '@shared/lib/phasePoints'
import { fonts } from '@/constants/typography'

type EditableFields = Required<Pick<Player, 'phone' | 'birthDate' | 'birthPlace'>> & { email: string }

export default function MonCompteScreen() {
  const { user, logout } = useAuth()
  const { players, teams, clubs, phases, playerPhasePoints, updatePlayer, setAvatar, removeAvatar } = useAppData()
  const [editing, setEditing] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [form, setForm] = useState<EditableFields>({ email: '', phone: '', birthDate: '', birthPlace: '' })

  const player = user?.isPlayer ? players.find((p) => p.id === user.id) : null
  const club = player ? clubs.find((c) => c.id === player.clubId) : null

  const activePhase = phases.find((p) => p.status === 'active')
  const playerTeams = player
    ? teams.filter((t) => t.phaseId === activePhase?.id && t.playerIds?.includes(player.id))
    : []
  const phasePoints = pointsFor(playerPhasePoints, activePhase?.id, player?.id)

  function openEdit() {
    if (!player) return
    setForm({
      email: player.email ?? '',
      phone: player.phone ?? '',
      birthDate: player.birthDate ?? '',
      birthPlace: player.birthPlace ?? '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!player) return
    const patch: Partial<EditableFields> = {}
    if (form.email !== (player.email ?? '')) patch.email = form.email
    if (form.phone !== (player.phone ?? '')) patch.phone = form.phone
    if (form.birthDate !== (player.birthDate ?? '')) patch.birthDate = form.birthDate || undefined
    if (form.birthPlace !== (player.birthPlace ?? '')) patch.birthPlace = form.birthPlace || undefined
    if (Object.keys(patch).length > 0) await updatePlayer(player.id, patch)
    setEditing(false)
  }

  async function applyAvatar(pick: () => Promise<ProcessedAvatar | null>) {
    if (!player) return
    let img: ProcessedAvatar | null
    try {
      img = await pick()
    } catch {
      Alert.alert('Erreur', "Impossible d'accéder à la photo.")
      return
    }
    if (!img) return
    try {
      setUploadingAvatar(true)
      await setAvatar(player.id, img.base64, img.contentType)
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer la photo de profil.")
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function deleteAvatar() {
    if (!player) return
    try {
      setUploadingAvatar(true)
      await removeAvatar(player.id)
    } catch {
      Alert.alert('Erreur', 'Impossible de supprimer la photo de profil.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  function chooseAvatar() {
    if (!player) return
    Alert.alert('Photo de profil', undefined, [
      { text: 'Prendre une photo', onPress: () => applyAvatar(takeAvatarPhoto) },
      { text: 'Choisir dans la bibliothèque', onPress: () => applyAvatar(pickAvatarFromLibrary) },
      ...(player.avatarUpdatedAt
        ? [{ text: 'Supprimer la photo', style: 'destructive' as const, onPress: deleteAvatar }]
        : []),
      { text: 'Annuler', style: 'cancel' as const },
    ])
  }

  function confirmLogout() {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnexion', style: 'destructive', onPress: logout },
      ],
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar */}
        <View style={styles.header}>
          {player ? (
            <TouchableOpacity activeOpacity={0.8} onPress={chooseAvatar} disabled={uploadingAvatar}>
              <Avatar
                playerId={player.id}
                avatarUpdatedAt={player.avatarUpdatedAt}
                firstName={player.firstName}
                lastName={player.lastName}
                size={88}
              />
              <View style={styles.cameraBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.initials}>{(user?.email?.[0] ?? '?').toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>
            {player ? `${player.firstName} ${player.lastName}` : user?.email ?? '—'}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{getRoleLabel(user?.role ?? 'player')}</Text>
          </View>
        </View>

        {/* Coordonnées — editable by the player */}
        {player && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coordonnées</Text>
              <TouchableOpacity onPress={openEdit}>
                <Text style={styles.editLink}>Modifier</Text>
              </TouchableOpacity>
            </View>
            {player.email ? <InfoRow label="Email" value={player.email} /> : null}
            {player.phone ? <PhoneRow phone={player.phone} /> : null}
            {player.birthDate ? <InfoRow label="Date de naissance" value={player.birthDate} /> : null}
            {player.birthPlace ? <InfoRow label="Lieu de naissance" value={player.birthPlace} /> : null}
          </View>
        )}

        {/* Admin: just show email */}
        {!player && user?.email && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coordonnées</Text>
            <InfoRow label="Email" value={user.email} />
          </View>
        )}

        {/* Profil — club/sports data, read-only */}
        {player && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profil</Text>
            {club && <InfoRow label="Club" value={club.displayName} />}
            {player.licenseNumber && <InfoRow label="Licence" value={player.licenseNumber} />}
            {phasePoints && <InfoRow label="Points" value={phasePoints} />}
            {playerTeams.map((t) => (
              <View key={t.id} style={styles.teamRow}>
                <View style={[styles.colorDot, { backgroundColor: t.color ?? colors.accent }]} />
                <Text style={styles.teamName}>{getTeamName(t, clubs)}</Text>
                {t.captainId === player.id && <Text style={styles.cap}>Cap.</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={styles.modalCancel}>Annuler</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Modifier mon profil</Text>
              <TouchableOpacity onPress={saveEdit}>
                <Text style={styles.modalSave}>Enregistrer</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Field
                label="Email"
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Téléphone"
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                keyboardType="phone-pad"
              />
              <Field
                label="Date de naissance"
                value={form.birthDate ?? ''}
                onChangeText={(v) => setForm((f) => ({ ...f, birthDate: v }))}
                placeholder="JJ/MM/AAAA"
              />
              <Field
                label="Lieu de naissance"
                value={form.birthPlace ?? ''}
                onChangeText={(v) => setForm((f) => ({ ...f, birthPlace: v }))}
                placeholder="Ville, Pays"
                autoCapitalize="words"
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function Field({
  label, value, onChangeText, keyboardType, autoCapitalize, placeholder,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  keyboardType?: 'default' | 'email-address' | 'phone-pad'
  autoCapitalize?: 'none' | 'words' | 'sentences'
  placeholder?: string
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { gap: 12, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { color: '#fff', fontFamily: fonts.bold, fontSize: 26 },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  name: { fontSize: 22, fontFamily: fonts.bold, color: colors.textPrimary },
  roleBadge: {
    backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  roleText: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.accent },
  section: {
    backgroundColor: colors.card, marginHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  editLink: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.accent },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, color: colors.textPrimary, fontFamily: fonts.medium, flexShrink: 1, textAlign: 'right' },
  phoneLink: { color: '#25D366' },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { flex: 1, fontSize: 15, color: colors.textPrimary },
  cap: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.accent },
  logoutBtn: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 12,
    borderWidth: 1, borderColor: colors.accentSoftBorder, backgroundColor: colors.accentSoft,
    paddingVertical: 14, alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontFamily: fonts.semiBold, color: '#dc2626' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  modalCancel: { fontSize: 15, color: colors.textSecondary },
  modalSave: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.accent },
  modalScroll: { padding: 16, gap: 16 },
  field: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
  },
  fieldLabel: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
  fieldInput: { fontSize: 16, color: colors.textPrimary, letterSpacing: 0 },
})
