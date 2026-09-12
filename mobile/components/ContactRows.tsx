import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Les coordonnées d'un licencié (#503)
//
// The fiche joueur showed an email nobody could do anything with and a phone
// number whose only gesture was WhatsApp. Both are now copiable — a member
// texts, dials, or writes from another mailbox, and the app is not the place
// that decides which.
//
// The copy is an explicit button, never a long-press: a gesture nobody sees is
// a gesture nobody uses, and this one has to be found on someone else's phone.
// Tapping the number itself still opens WhatsApp — that is the gesture the
// club already has in its fingers, and adding a second affordance must not
// move the first.
//
// These two rows live here rather than in the screen because the fiche joueur
// and the Compte screen had drifted into two byte-identical copies of them,
// wa.me URL included; the next change would have landed in one of the two.
// ---------------------------------------------------------------------------

/** How long the row says « Copié » before going back to its label. */
const COPIED_MS = 1600

function ContactRow({
  label,
  value,
  /** What to copy, when the displayed text is not it. Defaults to `value`. */
  copyValue,
  /** The tap on the value itself — WhatsApp, for a phone. */
  onPressValue,
  valueStyle,
  copyLabel,
  testID,
}: {
  label: string
  value: string
  copyValue?: string
  onPressValue?: () => void
  valueStyle?: object
  copyLabel: string
  testID: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The row can be unmounted while the confirmation is still showing — the
  // fiche is a pane on a tablet, and switching licensee replaces it outright.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = async () => {
    await Clipboard.setStringAsync(copyValue ?? value)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <View style={styles.row}>
      {/* The label carries the confirmation: it is the one part of the row
          with room for a word, and the value must stay readable while the
          member checks what landed in the clipboard. */}
      <Text style={[styles.label, copied && styles.labelCopied]}>
        {copied ? 'Copié' : label}
      </Text>
      <View style={styles.right}>
        {onPressValue ? (
          <TouchableOpacity onPress={onPressValue} style={styles.valueBtn}>
            <Text style={[styles.value, valueStyle]}>{value}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.value, valueStyle]}>{value}</Text>
        )}
        <TouchableOpacity
          onPress={copy}
          hitSlop={8}
          style={styles.copyBtn}
          accessibilityRole="button"
          accessibilityLabel={copyLabel}
          testID={testID}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={16}
            color={copied ? colors.success : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}

/** L'email d'un licencié, copiable. */
export function EmailRow({ email }: { email: string }) {
  return (
    <ContactRow
      label="Email"
      value={email}
      copyLabel="Copier l'email"
      testID="copy-email"
    />
  )
}

/** Le téléphone d'un licencié : WhatsApp au tap, copiable à côté. */
export function PhoneRow({ phone }: { phone: string }) {
  const digits = phone.replace(/[^\d+]/g, '')
  const waUrl = `https://wa.me/${digits.startsWith('+') ? digits.slice(1) : digits}`
  return (
    <ContactRow
      label="Téléphone"
      value={phone}
      valueStyle={styles.phoneLink}
      onPressValue={() => {
        Linking.openURL(waUrl).catch(() => {
          /* no WhatsApp installed — nothing useful to say beyond not crashing */
        })
      }}
      copyLabel="Copier le numéro"
      testID="copy-phone"
    />
  )
}

const styles = StyleSheet.create({
  // Same metrics as the plain `InfoRow` of the screens that host these, so a
  // copiable row and an inert one line up in the same section.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  label: { fontSize: 14, color: colors.textSecondary },
  labelCopied: { color: colors.success, fontFamily: fonts.medium },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  valueBtn: { flexShrink: 1 },
  value: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    flexShrink: 1,
    textAlign: 'right',
  },
  phoneLink: { color: '#25D366' },
  // Bare, like the app's other icon buttons: no chrome, and hitSlop rather
  // than padding gives it its 44px target. The negative margin pulls the
  // glyph back towards the section's edge, where the inert rows end.
  copyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
})
