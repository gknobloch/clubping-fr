import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { displayFonts, fonts } from '@/constants/typography'
import { openStore, useClientVersionVerdict } from '@/utils/clientVersion'

/**
 * The two faces of the version floor (#508), kept apart on purpose.
 *
 * "Une mise à jour est disponible" is an invitation — a bar you brush aside,
 * above an app that works. "Cette version ne fonctionne plus" is a wall. Saying
 * both the same way would turn the wall into one more notification and the
 * invitation into a threat, and the member can only tell them apart by how much
 * of the screen they take.
 *
 * Each renders nothing at all in the other's case, and both render nothing
 * while the floor is still being fetched — see `useClientVersionVerdict`.
 */

/** Dismissible, and only for this launch: a cold start asks again. */
export function UpdateBanner() {
  const verdict = useClientVersionVerdict()
  const [dismissed, setDismissed] = useState(false)
  const insets = useSafeAreaInsets()

  if (verdict !== 'update-available' || dismissed) return null

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Ionicons name="arrow-up-circle-outline" size={15} color="#fff" />
      <Pressable style={styles.barLabel} onPress={openStore} accessibilityRole="button">
        <Text style={styles.barText} numberOfLines={1}>
          Une mise à jour est disponible
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Masquer"
      >
        <Ionicons name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  )
}

/**
 * Covers everything, including the sign-in screen — a build the server no
 * longer answers cannot be signed into either, and offering the form would only
 * fail further in.
 *
 * It is an overlay rather than a replacement for the navigator: the splash is
 * dismissed by the screen underneath (app/_layout.tsx), and a gate that
 * unmounted it would hold the splash forever over its own message.
 */
export function UnsupportedOverlay() {
  const verdict = useClientVersionVerdict()
  const insets = useSafeAreaInsets()

  if (verdict !== 'unsupported') return null

  return (
    <View
      style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
    >
      <Ionicons name="cloud-download-outline" size={56} color="#fff" />
      <Text style={styles.title}>Mise à jour requise</Text>
      <Text style={styles.body}>
        Cette version de l&apos;application ne peut plus communiquer avec le serveur. Installez la
        dernière version pour continuer.
      </Text>
      <Pressable style={styles.button} onPress={openStore} accessibilityRole="button">
        <Text style={styles.buttonText}>Mettre à jour</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  // Mirrors OfflineBanner, which sits in the same slot and must not look like a
  // different kind of object.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.primary,
  },
  barLabel: { flex: 1 },
  barText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.semiBold,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
    backgroundColor: colors.primary,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontFamily: displayFonts.bold,
    textAlign: 'center',
  },
  body: {
    color: '#cbd5e1', // slate-300 — readable on primary without competing with the title
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: fonts.semiBold,
  },
})
