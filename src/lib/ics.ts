import type { MatchEvent } from './calendar'

// ---------------------------------------------------------------------------
// iCalendar file for one match (#426) — the web's answer to the mobile app's
// native "new event" screen. A downloaded .ics is the one form Apple Calendar,
// Outlook and Google Agenda all take, so the player keeps their own agenda
// instead of being sent to whichever one we picked for them.
// ---------------------------------------------------------------------------

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 §3.1: no line over 75 octets. Folding counts bytes, not characters
 * — "Journée" and the "–" of a matchup are two and three bytes each, and a
 * split through the middle of one of them reaches the calendar as mojibake.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let currentBytes = 0
  // A continuation line starts with a space, which costs one of its 75 octets.
  for (const char of line) {
    const size = new TextEncoder().encode(char).length
    const limit = out.length === 0 ? 75 : 74
    if (currentBytes + size > limit) {
      out.push(current)
      current = ''
      currentBytes = 0
    }
    current += char
    currentBytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date as YYYYMMDD, for an all-day event's DATE value. */
const dateValue = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

/**
 * Local date-time as YYYYMMDDTHHMMSS, deliberately without a TZID or a
 * trailing Z: a "floating" time, which every calendar reads in the viewer's
 * own zone. A match at 19h30 in Alsace is at 19h30 for everyone who plays it,
 * and floating spares us shipping a timezone database to say so.
 */
const dateTimeValue = (d: Date) =>
  `${dateValue(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`

/** UTC stamp for DTSTAMP, which RFC 5545 requires to be absolute. */
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

/**
 * One VEVENT, as a complete .ics file.
 *
 * `uid` is derived from the game id by the caller, so re-adding a match after
 * the club moves it updates the event already in the player's agenda instead
 * of leaving two.
 */
export function toIcs(event: MatchEvent, uid: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Club Ping//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${utcStamp(now)}`,
  ]

  if (event.allDay) {
    // DTEND is exclusive for a DATE value: the day after, or the calendar
    // shows a match that ends the evening before it starts.
    const end = new Date(event.startDate)
    end.setDate(end.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${dateValue(end)}`)
  } else {
    lines.push(`DTSTART:${dateTimeValue(event.startDate)}`)
    lines.push(`DTEND:${dateTimeValue(event.endDate)}`)
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`)
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')

  // CRLF throughout, and a trailing one: RFC 5545 asks for it, and Outlook is
  // the one that notices when it is missing.
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** File name for the download: "club-ping-j3-illzach-ttsjb-2.ics". */
export function icsFileName(matchDayNumber: number, opponentName: string): string {
  const slug = opponentName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return ['club-ping', `j${matchDayNumber}`, slug].filter(Boolean).join('-') + '.ics'
}

/** Hands the file to the browser. Revokes the object URL once it has it. */
export function downloadIcs(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
