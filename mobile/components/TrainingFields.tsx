import { useState, type ReactNode } from 'react'
import { Switch, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { MonthCalendar } from '@/components/MonthCalendar'
import { longDate } from '@shared/lib/pushNotifications'
import { DATES_MODE_LABELS, sessionDatesHint, type DatesMode } from '@shared/lib/trainings'
import { trainingFieldStyles as f, type SessionDatesState } from '@/utils/trainingForm'

// ---------------------------------------------------------------------------
// Les champs d'un entraînement dans l'app (#608)
//
// Ce que le web fait avec `<input type="time">` et `<input type="date">`, en
// pièces à toucher : une heure qui se règle d'un pouce (− / +, et les minutes
// par quart d'heure — l'heure d'un entraînement en est toujours un), une date
// qui s'ouvre sur un mois, et les deux façons de poser les dates d'une série
// dirigée. En JS pur, pour partir par une mise à jour et non par les stores.
// ---------------------------------------------------------------------------

/** A field's label, the size every sheet in the app uses. */
export function FieldLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <Text style={f.label}>
      {children}
      {optional && <Text style={f.optional}> (facultatif)</Text>}
    </Text>
  )
}

/** One pill — a weekday, a group, a place, a mode. */
export function Chip({
  label, on, onPress, testID,
}: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[f.chip, on && f.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[f.chipText, on && f.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={f.chips}>{children}</View>
}

const MINUTES = ['00', '15', '30', '45']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * An hour set with the thumb: − / + on the hour, the minutes by quarter.
 * A time already stored off the quarter (20:10) keeps its own minute on offer.
 */
export function TimeField({
  label, value, onChange, testID,
}: { label: string; value: string; onChange: (time: string) => void; testID: string }) {
  const [h, m] = value.split(':')
  const hour = Number(h)
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()
  const setHour = (next: number) => onChange(`${pad((next + 24) % 24)}:${m}`)
  return (
    <View style={f.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={f.timeRow}>
        <TouchableOpacity
          testID={`${testID}-minus`}
          onPress={() => setHour(hour - 1)}
          style={f.stepper}
          accessibilityRole="button"
          accessibilityLabel={`${label} : une heure plus tôt`}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text testID={`${testID}-value`} style={f.hour}>{hour}h</Text>
        <TouchableOpacity
          testID={`${testID}-plus`}
          onPress={() => setHour(hour + 1)}
          style={f.stepper}
          accessibilityRole="button"
          accessibilityLabel={`${label} : une heure plus tard`}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={f.minutes}>
          {minutes.map((mm) => (
            <Chip
              key={mm}
              testID={`${testID}-min-${mm}`}
              label={mm}
              on={mm === m}
              onPress={() => onChange(`${pad(hour)}:${mm}`)}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

/** The end of a session: optional, so it is switched on before it is set. */
export function EndTimeField({
  start, value, onChange,
}: { start: string; value: string; onChange: (time: string) => void }) {
  const on = !!value
  // Two hours after the start: the evening most sessions are.
  const suggested = `${pad((Number(start.split(':')[0]) + 2) % 24)}:${start.split(':')[1]}`
  return (
    <View style={f.field}>
      <View style={f.switchRow}>
        <FieldLabel>Heure de fin</FieldLabel>
        <Switch
          testID="training-end-switch"
          value={on}
          onValueChange={(next) => onChange(next ? suggested : '')}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>
      {on && <TimeField label="Fin" value={value} onChange={onChange} testID="training-end" />}
    </View>
  )
}

/**
 * One date, opened on a month. `optional` lets it be taken back out — the
 * open end of a slot, the « jusqu'au » of a weekly run.
 */
export function DateField({
  label, value, onChange, today, min, optional, testID,
}: {
  label: string
  value: string
  onChange: (date: string) => void
  today: string
  min?: string
  optional?: boolean
  testID: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <View style={f.field}>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <View style={f.dateRow}>
        <TouchableOpacity
          testID={testID}
          onPress={() => setOpen((v) => !v)}
          style={[f.dateButton, open && f.dateButtonOpen]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={[f.dateText, !value && f.placeholder]}>{value ? longDate(value) : 'Choisir une date'}</Text>
        </TouchableOpacity>
        {optional && value ? (
          <TouchableOpacity
            testID={`${testID}-clear`}
            onPress={() => { onChange(''); setOpen(false) }}
            style={f.clear}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${label.toLowerCase()}`}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <MonthCalendar
          testID={`${testID}-calendar`}
          selected={value ? [value] : []}
          today={today}
          min={min}
          onToggle={(d) => { onChange(d); setOpen(false) }}
        />
      )}
    </View>
  )
}

/**
 * A guided series' dates, the two ways the web has them: a weekly run, or
 * dates ticked on a month. Counted under the field, as on the web.
 */
export function DatesField({ state, today }: { state: SessionDatesState; today: string }) {
  const togglePicked = (d: string) =>
    state.setPicked(state.picked.includes(d) ? state.picked.filter((x) => x !== d) : [...state.picked, d])
  return (
    <View style={f.field}>
      <FieldLabel>Dates</FieldLabel>
      <ChipRow>
        {(['weekly', 'pick'] as DatesMode[]).map((m) => (
          <Chip
            key={m}
            testID={`training-dates-mode-${m}`}
            label={DATES_MODE_LABELS[m]}
            on={state.mode === m}
            onPress={() => state.setMode(m)}
          />
        ))}
      </ChipRow>
      {state.mode === 'weekly' ? (
        <>
          <DateField
            testID="training-first-date"
            label="Première séance"
            value={state.first}
            onChange={state.setFirst}
            today={today}
          />
          <DateField
            testID="training-repeat-until"
            label="Chaque semaine jusqu’au"
            value={state.until}
            onChange={state.setUntil}
            today={today}
            min={state.first || undefined}
            optional
          />
        </>
      ) : (
        <MonthCalendar
          testID="training-dates-calendar"
          selected={state.picked}
          existing={state.existing}
          today={today}
          onToggle={togglePicked}
        />
      )}
      <Text testID="training-dates-count" style={f.hint}>{sessionDatesHint(state.dates.length)}</Text>
    </View>
  )
}
