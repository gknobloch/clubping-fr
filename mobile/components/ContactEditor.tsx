import { useState } from 'react'
import {
  Modal, View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { contentWidth } from '@/components/Screen'
import type { Player } from '@shared/types'

// ---------------------------------------------------------------------------
// Modifier les coordonnées d'un licencié (#600)
//
// Le même formulaire pour les deux écrans qui l'ouvrent : « Mon compte », où un
// membre corrige les siennes, et la fiche joueur, où un administrateur de club
// corrige celles de quelqu'un de son club. Ce qui diffère est qui a le droit
// d'ouvrir — question posée chez l'appelant — et `fields`, la liste des champs
// à montrer.
//
// Partagé plutôt que recopié pour la raison de #503, qui est arrivée à ces deux
// écrans-là avec ces deux lignes-là : `EmailRow` et `PhoneRow` avaient dérivé
// en deux copies identiques, URL wa.me comprise. Le formulaire qui les écrit ne
// repart pas dans la même direction.
// ---------------------------------------------------------------------------

/**
 * Les quatre champs qu'un membre édite lui-même — `OWN_PROFILE_FIELDS` côté
 * API (#558). Un appelant en montre tout ou partie, jamais autre chose : le
 * nom, la licence, le club et le statut viennent de la FFTT ou décident de
 * l'éligibilité (#482), et leur chemin est l'import.
 */
export type ContactField = 'email' | 'phone' | 'birthDate' | 'birthPlace'

/** Ce que le formulaire rend : ce qui a changé, et rien d'autre. */
export type ContactPatch = Partial<Pick<Player, ContactField>>

/** Ce sur quoi le formulaire s'ouvre. Un `Player` en est un. */
export type ContactSubject = Partial<Pick<Player, ContactField>>

/** Les coordonnées telles qu'un formulaire les tient : des chaînes, jamais rien. */
type Draft = Record<ContactField, string>

/** Ce qui distingue un champ d'un autre, et c'est tout ce qui les distingue. */
const FIELDS: Record<ContactField, {
  label: string
  keyboardType?: 'default' | 'email-address' | 'phone-pad'
  autoCapitalize?: 'none' | 'words' | 'sentences'
  placeholder?: string
}> = {
  email: { label: 'Email', keyboardType: 'email-address', autoCapitalize: 'none' },
  phone: { label: 'Téléphone', keyboardType: 'phone-pad' },
  birthDate: { label: 'Date de naissance', placeholder: 'JJ/MM/AAAA' },
  birthPlace: { label: 'Lieu de naissance', placeholder: 'Ville, Pays', autoCapitalize: 'words' },
}

function draftOf(subject: ContactSubject): Draft {
  return {
    email: subject.email ?? '',
    phone: subject.phone ?? '',
    birthDate: subject.birthDate ?? '',
    birthPlace: subject.birthPlace ?? '',
  }
}

/**
 * Ce qui a bougé depuis l'ouverture, borné aux champs montrés.
 *
 * Vidé, un e-mail ou un téléphone part comme la chaîne vide — l'API en fait un
 * NULL — là où une date ou un lieu de naissance part comme `undefined`. C'est
 * ce que « Mon compte » faisait déjà, et la différence tient à la colonne, pas
 * à l'écran.
 */
function patchOf(next: Draft, was: Draft, fields: readonly ContactField[]): ContactPatch {
  const patch: ContactPatch = {}
  const changed = (f: ContactField) => fields.includes(f) && next[f] !== was[f]
  if (changed('email')) patch.email = next.email
  if (changed('phone')) patch.phone = next.phone
  if (changed('birthDate')) patch.birthDate = next.birthDate || undefined
  if (changed('birthPlace')) patch.birthPlace = next.birthPlace || undefined
  return patch
}

/**
 * Monté à l'ouverture, démonté à la fermeture : c'est ce qui sème le brouillon
 * sur le licencié courant. Le garder monté et masqué le figerait sur celui
 * qu'on regardait la première fois — et sur une tablette, la fiche change de
 * licencié sans que l'écran change.
 */
export function ContactEditor({
  title,
  fields,
  subject,
  onSave,
  onClose,
}: {
  title: string
  fields: readonly ContactField[]
  subject: ContactSubject
  /** Appelé seulement s'il y a quelque chose à écrire. */
  onSave: (patch: ContactPatch) => void
  onClose: () => void
}) {
  const [was] = useState<Draft>(() => draftOf(subject))
  const [draft, setDraft] = useState<Draft>(was)

  function submit() {
    const patch = patchOf(draft, was, fields)
    if (Object.keys(patch).length > 0) onSave(patch)
    onClose()
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={8} testID="contact-edit-cancel">
              <Text style={styles.cancel}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={submit} hitSlop={8} testID="contact-edit-save">
              <Text style={styles.save}>Enregistrer</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={[styles.scroll, contentWidth()]}>
            {fields.map((name) => {
              const field = FIELDS[name]
              return (
                <View key={name} style={styles.field}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.fieldInput}
                    testID={`contact-edit-${name}`}
                    value={draft[name]}
                    onChangeText={(v) => setDraft((d) => ({ ...d, [name]: v }))}
                    keyboardType={field.keyboardType ?? 'default'}
                    autoCapitalize={field.autoCapitalize ?? 'sentences'}
                    autoCorrect={false}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              )
            })}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  cancel: { fontSize: 15, color: colors.textSecondary },
  save: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.accent },
  scroll: { padding: 16, gap: 16 },
  field: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
  },
  fieldLabel: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
  fieldInput: { fontSize: 16, color: colors.textPrimary, letterSpacing: 0 },
})
