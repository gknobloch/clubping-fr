import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { addDelegate, fetchDelegations, removeDelegate } from '@/utils/api'
import { matchesSearch } from '@shared/lib/playerSearch'
import type { DelegationPerson, Delegations } from '@shared/types'

const nameOf = (p: DelegationPerson) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Sans nom'

/**
 * « Délégations » in Mon compte (#655), the web's `PersonDelegates` in its
 * `self` mode: who may open this person's profiles — named by the address
 * they sign in with, withdrawn with « Retirer » — and whose profiles this
 * person opens, given back with « Ne plus gérer ».
 *
 * Every write waits for the API and reloads, never optimistic: a parent told
 * their child's profiles will open, when the server refused, would find out
 * at the gymnasium. Offline it says so instead.
 *
 * `admin` is the same section on a licensee's fiche (#682), the web's `admin`
 * mode: for someone who cannot sign in to ask — a child with no address —
 * whoever administers every club of theirs picks a member instead of typing
 * an address, and there is no « Vous gérez » side to show.
 */
export function DelegationsSection({ personId, mode = 'self' }: { personId: string; mode?: 'self' | 'admin' }) {
  const { refreshProfiles } = useAuth()
  const { users = [] } = useAppData()
  const admin = mode === 'admin'
  const [delegations, setDelegations] = useState<Delegations | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setDelegations(await fetchDelegations(personId))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [personId])

  useEffect(() => { void load() }, [load])

  // Members to pick from: one entry per person, never the person themselves
  // nor someone already named — the web's list, from the same rule.
  const candidates = useMemo(() => {
    if (!admin || !email.trim()) return []
    const taken = new Set([personId, ...(delegations?.delegates ?? []).map((d) => d.id)])
    const seen = new Set<string>()
    return users
      .filter((u) => u.personId && !taken.has(u.personId))
      .filter((u) => matchesSearch(`${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email ?? ''}`, email))
      .filter((u) => (seen.has(u.personId!) ? false : (seen.add(u.personId!), true)))
      .slice(0, 8)
  }, [admin, email, users, personId, delegations])

  async function name(target?: { delegateId: string }) {
    if (!target && !email.trim()) return
    setSaving(true)
    setRefusal(null)
    const result = await addDelegate(personId, target ?? { email: email.trim() })
    setSaving(false)
    if (!result.ok) {
      setRefusal(result.message)
      return
    }
    setAdding(false)
    setEmail('')
    await load()
  }

  function withdraw(delegate: DelegationPerson) {
    Alert.alert(`Retirer ${nameOf(delegate)} ?`, admin
      ? 'Cette personne ne pourra plus ouvrir ses profils.'
      : 'Cette personne ne pourra plus ouvrir vos profils.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          if (await removeDelegate(personId, delegate.id)) await load()
          else Alert.alert('Erreur', 'La délégation n’a pas pu être retirée.')
        },
      },
    ])
  }

  function stepDown(person: DelegationPerson) {
    Alert.alert(
      `Ne plus gérer ${nameOf(person)} ?`,
      'Ses profils ne vous seront plus proposés. Seuls cette personne ou l’administrateur général pourront vous les rendre.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ne plus gérer',
          style: 'destructive',
          onPress: async () => {
            if (await removeDelegate(person.id, personId)) {
              await load()
              await refreshProfiles()
            } else {
              Alert.alert('Erreur', 'La délégation n’a pas pu être retirée.')
            }
          },
        },
      ],
    )
  }

  return (
    <View style={styles.section} testID="delegations">
      <Text style={styles.sectionTitle}>Délégations</Text>
      {failed ? (
        <Text style={styles.hint}>Les délégations n’ont pas pu être lues.</Text>
      ) : !delegations ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.subTitle}>{admin ? 'Peuvent ouvrir ses profils' : 'Peuvent ouvrir vos profils'}</Text>
            {!adding && (
              <TouchableOpacity
                testID="delegate-add"
                onPress={() => { setAdding(true); setRefusal(null) }}
                style={styles.textTarget}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Ajouter un délégué</Text>
              </TouchableOpacity>
            )}
          </View>
          {delegations.delegates.length === 0 ? (
            <Text style={styles.hint}>Personne.</Text>
          ) : delegations.delegates.map((d) => (
            <View key={d.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{nameOf(d)}</Text>
                {d.email ? <Text style={styles.hint} numberOfLines={1}>{d.email}</Text> : null}
              </View>
              <TouchableOpacity
                testID={`delegate-remove-${d.id}`}
                onPress={() => withdraw(d)}
                style={styles.textTarget}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${nameOf(d)}`}
              >
                <Text style={styles.danger}>Retirer</Text>
              </TouchableOpacity>
            </View>
          ))}

          {adding && admin && (
            <View style={styles.form}>
              <Text style={styles.label}>Choisir un membre</Text>
              <Text style={styles.hint}>
                Il ouvrira ses profils depuis son propre compte, sans code.
              </Text>
              <TextInput
                testID="delegate-search"
                value={email}
                onChangeText={setEmail}
                autoCorrect={false}
                placeholder="Rechercher un membre"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
              {candidates.map((u) => (
                <TouchableOpacity
                  key={u.personId}
                  testID={`delegate-pick-${u.id}`}
                  onPress={() => void name({ delegateId: u.personId! })}
                  disabled={saving}
                  style={styles.row}
                  accessibilityRole="button"
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</Text>
                    {u.email ? <Text style={styles.hint} numberOfLines={1}>{u.email}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
              {email.trim() !== '' && candidates.length === 0 && (
                <Text style={styles.hint}>Aucun membre ne correspond.</Text>
              )}
              {refusal ? <Text style={styles.refusal} accessibilityRole="alert">{refusal}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => { setAdding(false); setRefusal(null); setEmail('') }}
                  style={[styles.button, styles.neutral]}
                  accessibilityRole="button"
                >
                  <Text style={styles.neutralText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {adding && !admin && (
            <View style={styles.form}>
              <Text style={styles.label}>Adresse e-mail du délégué</Text>
              <Text style={styles.hint}>
                Celle avec laquelle il se connecte. Il pourra ouvrir vos profils sans votre code.
              </Text>
              <TextInput
                testID="delegate-email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="parent@exemple.fr"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
              {refusal ? <Text style={styles.refusal} accessibilityRole="alert">{refusal}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => { setAdding(false); setRefusal(null) }}
                  style={[styles.button, styles.neutral]}
                  accessibilityRole="button"
                >
                  <Text style={styles.neutralText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="delegate-save"
                  onPress={() => void name()}
                  disabled={saving || !email.trim()}
                  style={[styles.button, styles.primary, (saving || !email.trim()) && styles.disabled]}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!admin && delegations.represents.length > 0 && (
            <>
              <Text style={[styles.subTitle, styles.spaced]}>Vous gérez</Text>
              {delegations.represents.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Text style={[styles.rowName, styles.rowText]}>{nameOf(p)}</Text>
                  <TouchableOpacity
                    testID={`delegate-stepdown-${p.id}`}
                    onPress={() => stepDown(p)}
                    style={styles.textTarget}
                    accessibilityRole="button"
                    accessibilityLabel={`Ne plus gérer ${nameOf(p)}`}
                  >
                    <Text style={styles.danger}>Ne plus gérer</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card, marginHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8,
  },
  sectionTitle: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  subTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  spaced: { marginTop: 8 },
  textTarget: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.accent },
  danger: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.danger },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowText: { flex: 1, paddingVertical: 6 },
  rowName: { fontSize: 15, fontFamily: fonts.medium, color: colors.textPrimary },
  form: {
    gap: 6, marginTop: 4, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  label: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  // letterSpacing pinned to 0 so iOS placeholders track normally (#118).
  input: {
    minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: 12, fontSize: 16, color: colors.textPrimary, letterSpacing: 0,
  },
  refusal: { fontSize: 13, color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  neutral: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  neutralText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  primary: { backgroundColor: colors.accent },
  primaryText: { fontSize: 15, fontFamily: fonts.semiBold, color: '#fff' },
  disabled: { opacity: 0.5 },
})
