import { useState } from 'react'
import { addDays, isoWeekday } from '@/lib/trainings'

// A month you tick dates on (#608) — how a coach's schedule that is not weekly
// gets entered: the 8th, the 15th, then the 5th of next month. One tap per
// date, across as many months as the arrows reach, and a tap again takes a date
// back out.

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** "2026-10" → the month's first day, as a civil date. */
const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`

function shiftMonth(first: string, delta: number): string {
  const [y, m] = first.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 10)
}

function monthLabel(first: string): string {
  const s = new Date(`${first}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The month's days, padded to whole Monday-first weeks with nulls. */
function monthGrid(first: string): Array<string | null> {
  const lead = isoWeekday(first) - 1
  const days: Array<string | null> = Array.from({ length: lead }, () => null)
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d)
  while (days.length % 7) days.push(null)
  return days
}

export function MultiDateCalendar({
  selected,
  onChange,
  existing = [],
  today,
  label = 'Dates des séances',
}: {
  selected: string[]
  onChange: (dates: string[]) => void
  /** Dates the series already has: shown, and not offered again. */
  existing?: string[]
  /** Nothing before it can be picked — a session in the past reminds nobody. */
  today: string
  label?: string
}) {
  const [month, setMonth] = useState(() => firstOfMonth(selected[0] ?? today))
  const chosen = new Set(selected)
  const taken = new Set(existing)
  const toggle = (d: string) =>
    onChange(chosen.has(d) ? selected.filter((x) => x !== d) : [...selected, d].sort())

  return (
    <div role="group" aria-label={label} className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          disabled={month <= firstOfMonth(today)}
          aria-label="Mois précédent"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 md:h-8 md:w-8"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-slate-800" aria-live="polite">{monthLabel(month)}</p>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Mois suivant"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:h-8 md:w-8"
        >
          ›
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-xs font-medium text-slate-400" aria-hidden>{w}</span>
        ))}
        {monthGrid(month).map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />
          const past = d < today
          const already = taken.has(d)
          const on = chosen.has(d)
          return (
            <button
              key={d}
              type="button"
              disabled={past || already}
              aria-pressed={on}
              aria-label={new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
              }) + (already ? ' — déjà prévue' : '')}
              onClick={() => toggle(d)}
              className={`flex h-11 items-center justify-center rounded-lg text-sm md:h-9 ${
                on
                  ? 'bg-accent-600 font-semibold text-white'
                  : already
                    ? 'bg-slate-100 font-medium text-slate-500'
                    : past
                      ? 'text-slate-300'
                      : 'text-slate-700 hover:bg-slate-100'
              } ${d === today && !on ? 'ring-1 ring-inset ring-slate-300' : ''}`}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
