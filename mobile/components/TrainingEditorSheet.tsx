import { useMemo, useState } from 'react'
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { Sheet } from '@/components/Sheet'
import { SelectionActions, selection } from '@/components/Selection'
import {
  Chip, ChipRow, DateField, DatesField, EndTimeField, FieldLabel, TimeField,
} from '@/components/TrainingFields'
import { trainingFieldStyles as f, useSessionDates } from '@/utils/trainingForm'
import { todayIso } from '@/utils/weeks'
import { matchesSearch } from '@shared/lib/playerSearch'
import { TRAINING_KIND_LABELS, type TrainingDraft, type TrainingResult } from '@shared/lib/trainings'
import type { Address, MemberGroup, Training, TrainingKind, User } from '@shared/types'

// ---------------------------------------------------------------------------
// Créer ou modifier un entraînement, depuis l'app (#608)
//
// Le formulaire du web (`TrainingEditor`), champ pour champ : le type — choisi
// une fois, à la création —, le nom, le jour d'un créneau, les heures, le lieu,
// pour qui, la période d'un créneau, les responsables d'une série dirigée, les
// informations ; et, pour une série dirigée neuve, ses premières dates, chaque
// semaine ou au choix.
//
// Attendu, comme sur le web : l'API vérifie les heures et le jour, et la
// feuille reste ouverte pour dire pourquoi elle refuse.
// ---------------------------------------------------------------------------

const WEEKDAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const memberName = (u: User) => [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || 'Sans nom'

export function TrainingEditorSheet({
  training,
  addresses,
  groups,
  members,
  onSave,
  onAddDates,
  onClose,
}: {
  training?: Training
  addresses: Address[]
  groups: MemberGroup[]
  /** The club's members, sorted — who may be named to run a guided series. */
  members: User[]
  onSave: (draft: TrainingDraft) => Promise<TrainingResult>
  /** Only for a new guided series, once it exists. */
  onAddDates: (trainingId: string, dates: string[]) => void
  onClose: () => void
}) {
  const today = todayIso()
  const isNew = !training
  const [kind, setKind] = useState<TrainingKind>(training?.kind ?? 'guided')
  const [displayName, setDisplayName] = useState(training?.displayName ?? '')
  const [weekday, setWeekday] = useState(training?.weekday ?? 2)
  const [startTime, setStartTime] = useState(training?.startTime ?? '20:00')
  const [endTime, setEndTime] = useState(training ? training.endTime ?? '' : '22:00')
  const [addressId, setAddressId] = useState(training?.addressId ?? '')
  const [groupIds, setGroupIds] = useState<string[]>(training?.memberGroupIds ?? [])
  const [validFrom, setValidFrom] = useState(training?.validFrom ?? '')
  const [validUntil, setValidUntil] = useState(training?.validUntil ?? '')
  const [managerIds, setManagerIds] = useState<string[]>(training?.managerIds ?? [])
  const [managerQuery, setManagerQuery] = useState('')
  const [notes, setNotes] = useState(training?.notes ?? '')
  const newDates = useSessionDates()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dates = isNew && kind === 'guided' ? newDates.dates : []
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const managerMatches = useMemo(
    () => (managerQuery.trim()
      ? members
        .filter((m) => !managerIds.includes(m.id) && m.status !== 'archived' && matchesSearch(memberName(m), managerQuery))
        .slice(0, 5)
      : []),
    [members, managerIds, managerQuery],
  )

  const canSave = !saving && !!displayName.trim() && (!isNew || kind !== 'guided' || dates.length > 0)

  async function save() {
    setError(null)
    setSaving(true)
    const draft: TrainingDraft = {
      kind,
      displayName: displayName.trim(),
      startTime,
      ...(endTime ? { endTime } : {}),
      ...(addressId ? { addressId } : {}),
      memberGroupIds: groupIds,
      managerIds: kind === 'guided' ? managerIds : [],
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(kind === 'regular'
        ? { weekday, ...(validFrom ? { validFrom } : {}), ...(validUntil ? { validUntil } : {}) }
        : {}),
    }
    const result = await onSave(draft)
    setSaving(false)
    if (!result.ok) { setError(result.message); return }
    if (dates.length) onAddDates(result.training.id, dates)
    onClose()
  }

  return (
    <Sheet onClose={onClose} testID="training-editor" maxHeight="92%">
      {/* The keyboard is `Sheet`'s to handle (#628): the panel rises above it. */}
      <View style={s.frame}>
        <Text style={selection.title}>{isNew ? 'Nouvel entraînement' : "Modifier l'entraînement"}</Text>
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
          {isNew && (
            <View style={f.field}>
              <FieldLabel>Type</FieldLabel>
              <ChipRow>
                {(['guided', 'regular'] as TrainingKind[]).map((k) => (
                  <Chip key={k} testID={`training-kind-${k}`} label={TRAINING_KIND_LABELS[k]} on={kind === k} onPress={() => setKind(k)} />
                ))}
              </ChipRow>
              <Text style={f.hint}>
                {kind === 'guided'
                  ? 'Des séances datées, avec un encadrant. Chacun indique s’il vient.'
                  : 'Un créneau qui revient chaque semaine. Pas de réponse demandée.'}
              </Text>
            </View>
          )}

          <View style={f.field}>
            <FieldLabel>Nom</FieldLabel>
            <TextInput
              testID="training-name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={kind === 'guided' ? 'Dirigé jeunes' : 'Entraînement libre'}
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              style={s.input}
            />
          </View>

          {kind === 'regular' && (
            <View style={f.field}>
              <FieldLabel>Jour</FieldLabel>
              <ChipRow>
                {WEEKDAY_CHIPS.map((label, i) => (
                  <Chip key={label} testID={`training-weekday-${i + 1}`} label={label} on={weekday === i + 1} onPress={() => setWeekday(i + 1)} />
                ))}
              </ChipRow>
            </View>
          )}

          <TimeField label="Début" value={startTime} onChange={setStartTime} testID="training-start" />
          <EndTimeField start={startTime} value={endTime} onChange={setEndTime} />

          {addresses.length > 0 && (
            <View style={f.field}>
              <FieldLabel>Lieu</FieldLabel>
              <ChipRow>
                <Chip testID="training-address-default" label="Adresse par défaut" on={!addressId} onPress={() => setAddressId('')} />
                {addresses.map((a) => (
                  <Chip key={a.id} testID={`training-address-${a.id}`} label={a.label || a.city} on={addressId === a.id} onPress={() => setAddressId(a.id)} />
                ))}
              </ChipRow>
            </View>
          )}

          <View style={f.field}>
            <FieldLabel>Pour qui</FieldLabel>
            {groups.length === 0 ? (
              <Text style={f.hint}>Tout le club. Créez des groupes dans l’onglet Club pour viser une partie des membres.</Text>
            ) : (
              <>
                <ChipRow>
                  {groups.map((g) => (
                    <Chip key={g.id} testID={`training-group-${g.id}`} label={g.displayName} on={groupIds.includes(g.id)} onPress={() => setGroupIds(toggle(groupIds, g.id))} />
                  ))}
                </ChipRow>
                <Text style={f.hint}>{groupIds.length ? 'Les membres des groupes choisis.' : 'Aucun groupe choisi : tout le club.'}</Text>
              </>
            )}
          </View>

          {kind === 'regular' && (
            <>
              <DateField testID="training-from" label="Du" value={validFrom} onChange={setValidFrom} today={today} optional />
              <DateField
                testID="training-until" label="Au" value={validUntil} onChange={setValidUntil} today={today}
                min={validFrom || undefined} optional
              />
            </>
          )}

          {kind === 'guided' && (
            <View style={f.field}>
              <FieldLabel optional>Responsables du planning</FieldLabel>
              {managerIds.length > 0 && (
                <ChipRow>
                  {managerIds.map((id) => {
                    const m = members.find((x) => x.id === id)
                    return (
                      <TouchableOpacity
                        key={id}
                        testID={`training-manager-${id}`}
                        onPress={() => setManagerIds(managerIds.filter((x) => x !== id))}
                        style={[f.chip, f.chipOn, s.managerChip]}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer ${m ? memberName(m) : id}`}
                      >
                        <Text style={[f.chipText, f.chipTextOn]}>{m ? memberName(m) : id}</Text>
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    )
                  })}
                </ChipRow>
              )}
              <TextInput
                testID="training-manager-search"
                value={managerQuery}
                onChangeText={setManagerQuery}
                placeholder="Ajouter un responsable"
                placeholderTextColor={colors.textSecondary}
                style={s.input}
              />
              {managerMatches.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  testID={`training-manager-add-${m.id}`}
                  style={s.match}
                  onPress={() => { setManagerIds([...managerIds, m.id]); setManagerQuery('') }}
                  accessibilityRole="button"
                >
                  <Ionicons name="person-add-outline" size={18} color={colors.accent} />
                  <Text style={s.matchText}>{memberName(m)}</Text>
                </TouchableOpacity>
              ))}
              <Text style={f.hint}>
                En plus des administrateurs du club : ils ajoutent des dates, annulent une séance et répondent pour
                les attendus.
              </Text>
            </View>
          )}

          {isNew && kind === 'guided' && <DatesField state={newDates} today={today} />}

          <View style={f.field}>
            <FieldLabel optional>Informations</FieldLabel>
            <TextInput
              testID="training-notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Encadrant, matériel, niveau…"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={300}
              style={[s.input, s.notes]}
            />
          </View>
        </ScrollView>

        {error && <Text testID="training-editor-error" style={s.error}>{error}</Text>}
        <SelectionActions
          onCancel={onClose}
          onSave={save}
          saveDisabled={!canSave}
          cancelTestID="training-editor-cancel"
          saveTestID="training-editor-save"
        />
      </View>
    </Sheet>
  )
}

/** Add dates to a guided series, weekly or picked on a month. */
export function AddDatesSheet({
  training, existingDates, onAdd, onClose,
}: {
  training: Training
  existingDates: string[]
  onAdd: (dates: string[]) => void
  onClose: () => void
}) {
  const state = useSessionDates(existingDates)
  return (
    <Sheet onClose={onClose} testID="training-dates-sheet" maxHeight="92%">
      <View style={s.frame}>
        <Text style={selection.title}>Ajouter des dates — {training.displayName}</Text>
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
          <DatesField state={state} today={todayIso()} />
        </ScrollView>
        <SelectionActions
          onCancel={onClose}
          onSave={() => { onAdd(state.dates); onClose() }}
          saveLabel="Ajouter"
          saveDisabled={state.dates.length === 0}
          cancelTestID="training-dates-cancel"
          saveTestID="training-dates-save"
        />
      </View>
    </Sheet>
  )
}

const s = StyleSheet.create({
  frame: { flexShrink: 1 },
  // A scrolling form beside a footer in a sheet declares flexShrink, or the
  // footer is pushed out of the capped panel (see CLAUDE.md, Mobile UI).
  body: { flexShrink: 1, marginBottom: 12 },
  bodyContent: { gap: 16, paddingBottom: 8 },
  // letterSpacing pinned so iOS does not space out the placeholder (#118, #520).
  input: {
    minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12,
    fontSize: 16, color: colors.textPrimary, letterSpacing: 0,
  },
  notes: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
  managerChip: { flexDirection: 'row', gap: 6 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  matchText: { fontSize: 15, color: colors.textPrimary },
  error: { fontSize: 14, color: colors.danger, fontFamily: fonts.medium, marginBottom: 8 },
})
