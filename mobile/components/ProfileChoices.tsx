import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { ProfileAvatar, ProfileClubMark } from '@/components/ProfileAvatar'
import { getRoleLabel } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { profileClubName, profileFederations, profileName, profileSections } from '@shared/lib/profiles'
import type { Profile } from '@shared/types'

/**
 * The profiles the signed-in person may open, and a tap to become one (#640)
 * — one list for the header's account menu and the « Changer de profil »
 * sheet of Compte (#720), so the two cannot drift: the web's `ProfileList` is
 * the same rows.
 *
 * Two flat lists (#749): « Mes clubs », where a row IS the club — logo, name,
 * role — because the person's own profiles differ by nothing else; then
 * « Profils que vous gérez », where a row is the other person, photo badged
 * with their club. The current profile is listed and ticked.
 *
 * Switching lands on the Accueil: the screen underneath was the previous
 * profile's, and may be one the next cannot open (a club's admin sections,
 * under a child who only plays).
 */
export function ProfileChoices({ onSwitched }: { onSwitched: () => void }) {
  const { user, profiles, switchProfile } = useAuth()
  const { players, users, clubs = [], federations = [] } = useAppData()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function choose(p: Profile) {
    if (p.id === user?.id || busy) return
    setBusy(p.id)
    try {
      await switchProfile(p.id)
      onSwitched()
      router.replace('/')
    } catch {
      Alert.alert('Erreur', 'Impossible de changer de profil. Vérifiez votre connexion.')
    } finally {
      setBusy(null)
    }
  }

  const { own, managed } = profileSections(profiles)
  const avatarOf = (id: string) => (players.find((x) => x.id === id) ?? users.find((x) => x.id === id))?.avatarUpdatedAt
  const role = (p: Profile) => `${getRoleLabel(p.role)}${p.status === 'archived' ? ' · Archivé' : ''}`

  // The club's federations beside its name (#767), as on the web: Landser is
  // the AGR's, Rixheim the FFTT's, Bootzheim both — nothing else said so.
  const pills = (p: Profile, names: string[]) => names.length > 0 && (
    <View style={s.pills} testID={`profile-federations-${p.id}`}>
      {names.map((n) => <Text key={n} style={s.pill}>{n}</Text>)}
    </View>
  )

  /** A row: the club's name carries its federations, in the title (own) or the subtitle (managed). */
  const row = (p: Profile, mark: ReactNode, title: string, roleText: string, clubIn: 'title' | 'subtitle') => {
    const current = p.id === user?.id
    const subtitle = clubIn === 'title' ? roleText : `${profileClubName(p)} · ${roleText}`
    const feds = profileFederations(p, clubs, federations)
    return (
      <TouchableOpacity
        key={p.id}
        testID={`profile-${p.id}`}
        style={[s.row, current && s.rowCurrent]}
        onPress={() => choose(p)}
        disabled={current || !!busy}
        accessibilityRole="button"
        accessibilityState={{ selected: current, disabled: current || !!busy }}
        accessibilityLabel={`${title}, ${subtitle}${feds.length ? `, ${feds.join(' et ')}` : ''}${current ? ', profil actuel' : ''}`}
      >
        {mark}
        <View style={s.body}>
          <View style={s.line}>
            <Text style={[s.title, s.shrink]} numberOfLines={1}>{title}</Text>
            {clubIn === 'title' && pills(p, feds)}
          </View>
          {clubIn === 'title' ? (
            <Text style={s.subtitle} numberOfLines={1}>{roleText}</Text>
          ) : (
            <View style={s.line}>
              <Text style={s.subtitle} numberOfLines={1}>{profileClubName(p)}</Text>
              {pills(p, feds)}
              <Text style={[s.subtitle, s.shrink]} numberOfLines={1}>{`· ${roleText}`}</Text>
            </View>
          )}
        </View>
        {current ? (
          <Ionicons name="checkmark" size={22} color={colors.accent} />
        ) : busy === p.id ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : null}
      </TouchableOpacity>
    )
  }

  return (
    <>
      {own.length > 0 && (
        <View>
          <Text style={s.section}>Mes clubs</Text>
          {own.map((p) => row(p, <ProfileClubMark profile={p} size={40} />, profileClubName(p), role(p), 'title'))}
        </View>
      )}
      {managed.length > 0 && (
        <View style={own.length > 0 && s.sectionSplit}>
          <Text style={s.section}>Profils que vous gérez</Text>
          {managed.map((p) => row(
            p,
            <ProfileAvatar profile={p} avatarUpdatedAt={avatarOf(p.id)} size={40} />,
            profileName(p),
            role(p),
            'subtitle',
          ))}
        </View>
      )}
    </>
  )
}

const s = StyleSheet.create({
  section: {
    fontSize: 13, fontFamily: fonts.semiBold, color: colors.textSecondary,
    marginTop: 10, marginBottom: 4, paddingHorizontal: 8,
  },
  sectionSplit: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12,
  },
  rowCurrent: { backgroundColor: colors.accentSoft },
  body: { flex: 1, gap: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pills: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  pill: {
    fontSize: 10, lineHeight: 14, fontFamily: fonts.semiBold, color: colors.textSecondary,
    backgroundColor: colors.border, borderRadius: 4, paddingHorizontal: 5, overflow: 'hidden',
  },
  title: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary },
})
