import { useState } from 'react'
import {
  Alert, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { AVAIL } from '@/constants/availability'
import { MyAvailability } from '@/components/MyAvailability'
import { Sheet } from '@/components/Sheet'
import type { AvailabilityStatus, TrainingAvailability, User } from '@shared/types'
import { longDate } from '@shared/lib/pushNotifications'
import {
  answerCounts, answerOf, answerTally, asksForAnswer, formatTimeRange, type TrainingOccurrence,
} from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Une séance d'entraînement (#608)
//
// La carte que liste l'écran Entraînements. Une séance dirigée porte la
// réponse du membre et le décompte sur les attendus, qui se déplie sur les
// noms ; un créneau libre dit seulement quand, où et pour qui — il ne demande
// rien. Une séance annulée reste affichée, et dit pourquoi.
//
// Qui tient la séance l'annule (ou la rétablit) d'un bouton. Une séance
// dirigée a une seconde action, comme sur le web : retirer la date, saisie par
// erreur — elle disparaît alors, réponses comprises, là où une séance annulée
// reste affichée et prévient ceux qui comptaient dessus. Deux actions, donc le
// « … » du web plutôt que deux boutons côte à côte dans l'en-tête de la carte.
// ---------------------------------------------------------------------------

export function TrainingCard({
  occurrence: o,
  place,
  audience,
  expected,
  answers,
  viewerId,
  canManage,
  onAnswer,
  onCancel,
  onRestore,
  onRemoveDate,
  onAddToCalendar,
  showDate = false,
}: {
  occurrence: TrainingOccurrence
  place?: string
  audience: string
  /** Who is expected, already sorted by name. */
  expected: User[]
  answers: TrainingAvailability[]
  viewerId?: string
  canManage: boolean
  onAnswer: (status: AvailabilityStatus | null) => void
  onCancel: () => void
  onRestore: () => void
  /** A guided date entered by mistake: offered with cancelling, under « … ». */
  onRemoveDate?: () => void
  /** Offered on a guided session still on — this date or the whole series. */
  onAddToCalendar?: () => void
  /** Say the day too — on the Accueil, where no date heading sits above the card. */
  showDate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const t = o.training
  const key = `${t.id}-${o.date}`
  const expectedIds = expected.map((u) => u.id)
  const isExpected = !!viewerId && expectedIds.includes(viewerId)
  const mine = answerOf(answers, t.id, o.date, viewerId)
  const asks = asksForAnswer(t.kind) && !o.cancelled

  return (
    <View testID={`training-${key}`} style={[s.card, o.cancelled && s.cardCancelled]}>
      <View style={s.head}>
        <View style={s.headBody}>
          <View style={s.titleLine}>
            <Text style={[s.title, o.cancelled && s.titleCancelled]}>{t.displayName}</Text>
            <View style={[s.pill, t.kind === 'guided' ? s.pillGuided : s.pillRegular]}>
              <Text style={[s.pillText, t.kind === 'guided' && s.pillTextGuided]}>
                {t.kind === 'guided' ? 'Dirigé' : 'Libre'}
              </Text>
            </View>
          </View>
          <Text style={s.meta}>
            {showDate ? `${longDate(o.date)} · ` : ''}{formatTimeRange(t)}{place ? ` · ${place}` : ''}
          </Text>
          <Text style={s.meta}>{audience}</Text>
          {o.cancelled ? (
            <Text testID={`training-cancelled-${key}`} style={s.cancelled}>
              Annulée{o.note ? ` — ${o.note}` : ''}
            </Text>
          ) : o.note ? (
            <Text style={s.note}>{o.note}</Text>
          ) : null}
        </View>
        {onAddToCalendar && asksForAnswer(t.kind) && !o.cancelled && (
          <TouchableOpacity
            testID={`training-calendar-${key}`}
            onPress={onAddToCalendar}
            style={s.manage}
            accessibilityRole="button"
            accessibilityLabel="Ajouter à mon agenda"
          >
            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {canManage && t.kind === 'guided' && onRemoveDate ? (
          <TouchableOpacity
            testID={`training-actions-${key}`}
            onPress={() =>
              Alert.alert(`${t.displayName}, ${longDate(o.date)}`, undefined, [
                o.cancelled
                  ? { text: 'Rétablir la séance', onPress: onRestore }
                  : { text: 'Annuler la séance', style: 'destructive', onPress: onCancel },
                { text: 'Retirer cette date', style: 'destructive', onPress: onRemoveDate },
                { text: 'Fermer', style: 'cancel' },
              ])
            }
            style={s.manage}
            accessibilityRole="button"
            accessibilityLabel={`Actions — ${t.displayName}, ${longDate(o.date)}`}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : canManage && (
          <TouchableOpacity
            testID={o.cancelled ? `training-restore-${key}` : `training-cancel-${key}`}
            onPress={o.cancelled ? onRestore : onCancel}
            style={s.manage}
            accessibilityRole="button"
            accessibilityLabel={o.cancelled ? 'Rétablir la séance' : 'Annuler la séance'}
          >
            <Text style={[s.manageText, !o.cancelled && s.manageDanger]}>
              {o.cancelled ? 'Rétablir' : 'Annuler'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {asks && (
        <View style={s.answers}>
          {isExpected && (
            <MyAvailability
              status={mine}
              onPick={(status) => onAnswer(status)}
              onClear={() => onAnswer(null)}
              testIDPrefix={`training-answer-${key}`}
            />
          )}
          <TouchableOpacity
            testID={`training-tally-${key}`}
            onPress={() => setOpen((v) => !v)}
            style={s.tally}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
          >
            <Text style={s.tallyText}>{answerTally(answerCounts(answers, t.id, o.date, expectedIds))}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          {open && expected.map((u) => {
            const status = answerOf(answers, t.id, o.date, u.id)
            return (
              <View key={u.id} style={s.person}>
                <Text style={s.personName} numberOfLines={1}>{u.firstName} {u.lastName}</Text>
                <Text style={[s.personStatus, status && { color: AVAIL[status].color }]}>
                  {status ? AVAIL[status].label : 'Sans réponse'}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

/**
 * Call a session off, with an optional reason — which goes out with the
 * notice to whoever was counting on it.
 */
export function CancelTrainingSheet({
  title,
  onConfirm,
  onClose,
}: {
  title: string
  onConfirm: (note: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  return (
    <Sheet onClose={onClose} testID="training-cancel-sheet">
      {/* `Sheet` lifts the panel above the keyboard (#628); what no longer
          fits under it — sideways, everything below the field — scrolls. */}
      <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
        <Text style={s.sheetTitle}>{title}</Text>
        <Text style={s.fieldLabel}>Motif (facultatif)</Text>
        <TextInput
          testID="training-cancel-note"
          value={note}
          onChangeText={setNote}
          placeholder="Gymnase fermé, tournoi…"
          placeholderTextColor={colors.textSecondary}
          maxLength={120}
          style={s.input}
        />
        <Text style={s.hint}>
          La séance reste affichée, marquée annulée. Les membres déjà prévenus, ou qui avaient dit venir,
          reçoivent un avis.
        </Text>
        <View style={s.sheetActions}>
          {/* « Retour », not « Annuler », beside a button that cancels the session. */}
          <TouchableOpacity testID="training-cancel-back" style={[s.button, s.buttonNeutral]} onPress={onClose}>
            <Text style={s.buttonNeutralText}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="training-cancel-confirm"
            style={[s.button, s.buttonDanger]}
            onPress={() => { onConfirm(note.trim()); onClose() }}
          >
            <Text style={s.buttonDangerText}>Annuler la séance</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Sheet>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10,
  },
  cardCancelled: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headBody: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  titleCancelled: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  pill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pillGuided: { backgroundColor: colors.accentSoft },
  pillRegular: { backgroundColor: colors.bg },
  pillText: { fontSize: 11, fontFamily: fonts.medium, color: colors.textSecondary },
  pillTextGuided: { color: colors.accent },
  meta: { fontSize: 13, color: colors.textSecondary },
  cancelled: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.danger, marginTop: 4 },
  note: { fontSize: 13, color: colors.textPrimary, marginTop: 4 },
  manage: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  manageText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.accent },
  manageDanger: { color: colors.danger },
  answers: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  tallyText: { fontSize: 13, color: colors.textSecondary },
  person: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
  personName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  personStatus: { fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  sheetScroll: { flexShrink: 1 },
  sheetBody: { padding: 20, gap: 10 },
  sheetTitle: { fontSize: 17, fontFamily: fonts.semiBold, color: colors.textPrimary },
  fieldLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  // letterSpacing pinned so iOS does not space out the placeholder (#118, #520).
  input: {
    minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12,
    fontSize: 16, color: colors.textPrimary, letterSpacing: 0,
  },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  buttonNeutral: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  buttonNeutralText: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  buttonDanger: { backgroundColor: colors.accent },
  buttonDangerText: { fontSize: 15, fontFamily: fonts.semiBold, color: '#fff' },
})
