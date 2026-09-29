import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { sessionDates, type DatesMode } from '@shared/lib/trainings'

// The non-component half of the app's training form (#608) — kept apart from
// `components/TrainingFields.tsx` so that file exports components only, which
// is what fast refresh needs.

/** The state of a dates field — `sessionDates` turns it into dates. */
export function useSessionDates(existing: string[] = []) {
  const [mode, setMode] = useState<DatesMode>('weekly')
  const [first, setFirst] = useState('')
  const [until, setUntil] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const dates = sessionDates({ mode, first, until, picked }, existing)
  return { mode, setMode, first, setFirst, until, setUntil, picked, setPicked, dates, existing }
}

export type SessionDatesState = ReturnType<typeof useSessionDates>

export const trainingFieldStyles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  optional: { fontFamily: fonts.regular, color: colors.textSecondary },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.textPrimary },
  chipTextOn: { color: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stepper: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hour: { minWidth: 44, textAlign: 'center', fontSize: 18, fontFamily: fonts.semiBold, color: colors.textPrimary },
  minutes: { flexDirection: 'row', gap: 6, marginLeft: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
  },
  dateButtonOpen: { borderColor: colors.accent },
  dateText: { fontSize: 15, color: colors.textPrimary },
  placeholder: { color: colors.textSecondary },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
