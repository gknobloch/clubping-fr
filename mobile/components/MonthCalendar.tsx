import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { addDays, isoWeekday } from '@shared/lib/trainings'

// ---------------------------------------------------------------------------
// Un mois qu'on coche (#608)
//
// Le calendrier du web (`MultiDateCalendar`), en natif : les dates d'une série
// dirigée qui n'est pas hebdomadaire — le 8, le 15, puis le 5 du mois suivant
// — et, en mode `single`, le choix d'une seule date (la première séance, la
// fin d'un créneau). En JS pur plutôt qu'un sélecteur natif : un module natif
// de plus demanderait une nouvelle version sur les stores, là où celui-ci part
// par une mise à jour.
//
// Le passé ne se coche pas, et une date que la série a déjà est montrée sans
// être proposée une seconde fois.
// ---------------------------------------------------------------------------

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`

function shiftMonth(first: string, delta: number): string {
  const [y, m] = first.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10)
}

function monthLabel(first: string): string {
  const s = new Date(`${first}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The month's days, padded to whole Monday-first weeks with nulls. */
function monthGrid(first: string): Array<string | null> {
  const days: Array<string | null> = Array.from({ length: isoWeekday(first) - 1 }, () => null)
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d)
  while (days.length % 7) days.push(null)
  return days
}

export function MonthCalendar({
  selected,
  onToggle,
  today,
  existing = [],
  min,
  testID = 'month-calendar',
}: {
  selected: readonly string[]
  /** Called with the date tapped; the caller decides what a tap means. */
  onToggle: (date: string) => void
  today: string
  /** Dates the series already has: shown, not offered. */
  existing?: readonly string[]
  /** Nothing before it can be picked; today by default. */
  min?: string
  testID?: string
}) {
  const floor = min ?? today
  const [month, setMonth] = useState(() => firstOfMonth(selected[0] ?? floor))
  const grid = monthGrid(month)

  return (
    <View testID={testID} style={s.box}>
      <View style={s.head}>
        <TouchableOpacity
          testID={`${testID}-prev`}
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          disabled={month <= firstOfMonth(floor)}
          style={s.nav}
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={month <= firstOfMonth(floor) ? colors.border : colors.textPrimary}
          />
        </TouchableOpacity>
        <Text testID={`${testID}-month`} style={s.month}>{monthLabel(month)}</Text>
        <TouchableOpacity
          testID={`${testID}-next`}
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={s.nav}
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={s.row}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[s.cell, s.weekday]}>{w}</Text>
        ))}
      </View>
      {Array.from({ length: grid.length / 7 }, (_, week) => (
        <View key={week} style={s.row}>
          {grid.slice(week * 7, week * 7 + 7).map((d, i) => {
            if (!d) return <View key={`pad-${i}`} style={s.cell} />
            const past = d < floor
            const already = existing.includes(d)
            const on = selected.includes(d)
            return (
              <TouchableOpacity
                key={d}
                testID={`${testID}-${d}`}
                disabled={past || already}
                onPress={() => onToggle(d)}
                style={[s.cell, s.day, on && s.dayOn, already && s.dayTaken, d === today && !on && s.dayToday]}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: past || already }}
              >
                <Text style={[s.dayText, (past || already) && s.dayTextOff, on && s.dayTextOn]}>
                  {Number(d.slice(8))}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 12, color: colors.textSecondary, paddingVertical: 4, textAlign: 'center' },
  day: { height: 40, margin: 1, borderRadius: 8 },
  dayOn: { backgroundColor: colors.accent },
  dayTaken: { backgroundColor: colors.bg },
  dayToday: { borderWidth: 1, borderColor: colors.border },
  dayText: { fontSize: 14, color: colors.textPrimary },
  dayTextOff: { color: colors.border },
  dayTextOn: { color: '#fff', fontFamily: fonts.semiBold },
})
