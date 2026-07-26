// Parser for FFTT poule schedule documents (PDF/image import, #260).
//
// FFTT auto-generates one PDF per division/poule with a fixed layout: a
// header ("CHAMPIONNAT GRAND EST ELITE Poule 3" / "1ère phase 2026-2027"), an
// 8-team roster table (rank, name, team number within the club, default
// day/time, club affiliation number), then "Journée N" sections with 4
// match rows each (day/time, home team+number, "contre", away team+number,
// score or "-"). No LLM: this is a line-based regex parser targeting that
// known template, fed by either pdfScheduleText.ts (text-layer PDFs) or
// ocrScheduleText.ts (photographed/scanned images).

/** FFTT club affiliation numbers are 8 digits (league + department + club number). */
export const AFFILIATION_NUMBER_RE = /^\d{8}$/

export interface ParsedScheduleTeam {
  rank: number
  name: string
  number: number
  day: string
  /** Normalized "Hh MM", e.g. "16h00". */
  time: string
  affiliationNumber: string
  /** False when the trailing token isn't a plausible affiliation number — OCR's sharpest failure mode, flag for manual review rather than silently trusting it. */
  affiliationValid: boolean
}

export interface ParsedScheduleMatch {
  day: string
  time: string
  homeName: string
  homeNumber: number
  awayName: string
  awayNumber: number
  /** Raw trailing token(s): "-" when not yet played, otherwise free text (scores are never imported, see games/import). */
  score: string
}

export interface ParsedScheduleJournee {
  number: number
  /** 'range' when the document only gives a week window ("du 14 au 20 septembre 2026") — clubs pick the exact date later. */
  dateType: 'fixed' | 'range'
  /** YYYY-MM-DD: the fixed date, or the range's start date. */
  date: string | null
  /** YYYY-MM-DD range end date; only set when dateType === 'range'. */
  rangeEndDate: string | null
  matches: ParsedScheduleMatch[]
}

export interface ParsedScheduleDocument {
  /** e.g. "CHAMPIONNAT GRAND EST ELITE" (the "Poule N" suffix is stripped into poolNumber). */
  divisionLabel: string
  poolNumber: number
  phaseLabel: string
  phaseNumber: number | null
  /** e.g. "2026-2027". */
  seasonLabel: string
  /** FFTT-aligned season id ("27"), or null when the header couldn't be read. */
  seasonId: string | null
  teams: ParsedScheduleTeam[]
  journees: ParsedScheduleJournee[]
  /** Non-fatal parse issues surfaced to the admin for manual review. */
  warnings: string[]
}

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAY_RE_SRC = DAY_NAMES.join('|')

// Team numbers tolerate a trailing stray punctuation mark (`[.,']?`): a real
// OCR pass read "... ESTT 1' contre ..." and "... PPA 1. contre ..." for
// plain "1" — the apostrophe/period isn't part of the number, just noise
// tesseract occasionally appends to an isolated digit.
//
// They also tolerate an isolated "I", "l" or "|" standing in for the digit
// "1": a real OCR pass read "... contre RIXHEIM PPA I -" for plain "1" —
// those characters are visually near-identical to "1" in most fonts, a
// classic OCR confusion. normalizeTeamNumber() below converts them back.
const TEAM_NUMBER_RE_SRC = '(?:\\d{1,2}|[Il|])'

function normalizeTeamNumber(raw: string): number {
  return /^[il|]$/i.test(raw) ? 1 : Number(raw)
}

const ROSTER_RE = new RegExp(`^(\\d+)\\s+(.+?)\\s+(${TEAM_NUMBER_RE_SRC})[.,']?\\s+(${DAY_RE_SRC})\\s+(\\d{1,2}h\\d{0,2})\\s+(\\S+)$`)
const JOURNEE_RE = /^Journ[ée]e\s+(\d+)\s*:\s*(.+)$/i
// A real OCR pass inserted one or two stray standalone underscores between
// the home team's number and "contre" ("... BARR TT 4 _ contre ...", "...
// BARR TT 4 __ contre ...") — noise from a faint table rule or vertical
// separator, not part of either token.
const MATCH_RE = new RegExp(
  `^(${DAY_RE_SRC})\\s+(\\d{1,2}h\\d{0,2})\\s+(.+?)\\s+(${TEAM_NUMBER_RE_SRC})[.,']?\\s+(?:_+\\s+)?contre\\s+(.+?)\\s+(${TEAM_NUMBER_RE_SRC})[.,']?\\s+(.+)$`, 'i',
)
const RANGE_DATE_RE = /^du\s+(.+?)\s+au\s+(.+)$/i
const FIXED_DATE_RE = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/
// The start of a range carries a month only when it differs from the end's
// ("du 28 sept au 04 octobre") — a same-month range just says "du 14 au 20".
const START_DATE_RE = /^(\d{1,2})(?:\s+(\S+))?$/
// Lenient on purpose: this line also has to survive OCR (photographed/scanned
// documents, see ocrScheduleText.ts), which routinely mangles spacing and
// punctuation without touching the letters/digits themselves.
const PHASE_SEASON_RE = /^(\d+)\D{0,6}phase\D{0,3}(\d{4})\D{1,3}(\d{4})$/i
const POOL_RE = /Poule\D{0,3}(\d+)/i

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
]

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** "septembre" → 9, "sept" → 9 (a real abbreviation, prefix of the full name), null when unreadable. */
function monthNumberFromLabel(label: string): number | null {
  const token = stripAccents(label.toLowerCase())
  if (token.length < 3) return null
  const idx = MONTHS.findIndex((m) => m.startsWith(token))
  return idx === -1 ? null : idx + 1
}

function parseFrenchDate(day: number, monthLabel: string, year: number): string | null {
  const month = monthNumberFromLabel(monthLabel)
  if (month === null || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const DAY_INDEX: Record<string, number> = {
  Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
}

/** The date within [startDate, endDate] (inclusive, YYYY-MM-DD) that falls on `dayName`, or null if none does. */
function dateForDayInRange(startDate: string, endDate: string, dayName: string): string | null {
  const target = DAY_INDEX[dayName]
  if (target === undefined) return null
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  const d = new Date(`${startDate}T00:00:00Z`)
  while (d.getTime() <= end) {
    if (d.getUTCDay() === target) return d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return null
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** "16h" → "16h00", "19h30" stays as-is. */
function normalizeTime(t: string): string {
  const m = /^(\d{1,2})h(\d{0,2})$/.exec(t)
  if (!m) return t
  return `${m[1]}h${m[2] ? m[2].padStart(2, '0') : '00'}`
}

/**
 * "19 septembre 2026" (fixed) or "du 14 au 20 septembre 2026" / "du 28 sept
 * au 04 octobre 2026" (range — the start month may be abbreviated and/or
 * omit the year, which always belongs to the end date; a start month numerically
 * after the end month rolls the start year back, for a range spanning New Year's).
 */
function parseJourneeDate(text: string): { type: 'fixed' | 'range'; date: string; rangeEndDate: string | null } | null {
  const rangeM = RANGE_DATE_RE.exec(text)
  if (rangeM) {
    const endM = FIXED_DATE_RE.exec(normalizeLine(rangeM[2]))
    if (!endM) return null
    const endDate = parseFrenchDate(Number(endM[1]), endM[2], Number(endM[3]))
    if (!endDate) return null
    const startM = START_DATE_RE.exec(normalizeLine(rangeM[1]))
    if (!startM) return null
    // No explicit start month ("du 14 au 20 ...") means the same month as the end date.
    const startMonthLabel = startM[2] ?? endM[2]
    const endMonthNum = monthNumberFromLabel(endM[2])
    const startMonthNum = monthNumberFromLabel(startMonthLabel)
    let startYear = Number(endM[3])
    if (startM[2] && startMonthNum !== null && endMonthNum !== null && startMonthNum > endMonthNum) startYear -= 1
    const startDate = parseFrenchDate(Number(startM[1]), startMonthLabel, startYear)
    if (!startDate) return null
    return { type: 'range', date: startDate, rangeEndDate: endDate }
  }
  const fixedM = FIXED_DATE_RE.exec(text)
  if (fixedM) {
    const date = parseFrenchDate(Number(fixedM[1]), fixedM[2], Number(fixedM[3]))
    return date ? { type: 'fixed', date, rangeEndDate: null } : null
  }
  return null
}

/**
 * Parse an already-extracted array of text lines (from either a text-layer
 * PDF or OCR) into one schedule document. Returns `{ error }` only when the
 * header ("... Poule N") can't be located at all — every other issue is
 * reported as a non-fatal warning so the admin can still review/complete the
 * roster or journées manually before confirming the import.
 */
export function parseScheduleDocumentLines(rawLines: string[]): ParsedScheduleDocument | { error: string } {
  const lines = rawLines.map(normalizeLine).filter(Boolean)

  const headerIdx = lines.findIndex((l) => POOL_RE.test(l))
  if (headerIdx === -1) return { error: 'header_not_found' }
  const poolMatch = POOL_RE.exec(lines[headerIdx])!
  const poolNumber = Number(poolMatch[1])
  const divisionLabel = lines[headerIdx].slice(0, poolMatch.index).trim()

  const warnings: string[] = []

  let phaseNumber: number | null = null
  let seasonLabel = ''
  let seasonId: string | null = null
  let phaseLabel = ''
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 4, lines.length); i++) {
    const m = PHASE_SEASON_RE.exec(lines[i])
    if (m) {
      phaseNumber = Number(m[1])
      seasonLabel = `${m[2]}-${m[3]}`
      seasonId = String(Number(m[3]) - 2000)
      phaseLabel = lines[i]
      break
    }
  }
  if (phaseNumber === null) warnings.push("Phase/saison introuvable dans l'en-tête du document.")

  const firstJourneeIdx = lines.findIndex((l) => JOURNEE_RE.test(l))
  const rosterLines = lines.slice(headerIdx + 1, firstJourneeIdx === -1 ? lines.length : firstJourneeIdx)
  const teams: ParsedScheduleTeam[] = []
  for (const line of rosterLines) {
    const m = ROSTER_RE.exec(line)
    if (!m) continue // header phase/season line, blank separators, etc.
    const affiliationNumber = m[6]
    teams.push({
      rank: Number(m[1]),
      name: m[2].trim(),
      number: normalizeTeamNumber(m[3]),
      day: m[4],
      time: normalizeTime(m[5]),
      affiliationNumber,
      affiliationValid: AFFILIATION_NUMBER_RE.test(affiliationNumber),
    })
  }
  if (teams.length === 0) warnings.push('Aucune équipe détectée dans le tableau des équipes.')

  const journees: ParsedScheduleJournee[] = []
  if (firstJourneeIdx !== -1) {
    let current: ParsedScheduleJournee | null = null
    for (let i = firstJourneeIdx; i < lines.length; i++) {
      const line = lines[i]
      const jm = JOURNEE_RE.exec(line)
      if (jm) {
        const parsed = parseJourneeDate(jm[2].trim())
        if (!parsed) warnings.push(`Date de la journée ${jm[1]} illisible : "${jm[2].trim()}"`)
        current = {
          number: Number(jm[1]),
          dateType: parsed?.type ?? 'fixed',
          date: parsed?.date ?? null,
          rangeEndDate: parsed?.rangeEndDate ?? null,
          matches: [],
        }
        journees.push(current)
        continue
      }
      if (!current) continue
      const mm = MATCH_RE.exec(line)
      if (!mm) {
        warnings.push(`Ligne de match illisible (journée ${current.number}) : "${line}"`)
        continue
      }
      current.matches.push({
        day: mm[1],
        time: normalizeTime(mm[2]),
        homeName: mm[3].trim(),
        homeNumber: normalizeTeamNumber(mm[4]),
        awayName: mm[5].trim(),
        awayNumber: normalizeTeamNumber(mm[6]),
        score: mm[7].trim(),
      })
    }
  } else {
    warnings.push('Aucune journée détectée dans le document.')
  }

  // FFTT's own calendar sometimes only gives a week window for a journée
  // ("du 14 au 20 septembre 2026") rather than one fixed date — each match's
  // own day (Samedi, Lundi, ...) is that team's actual home day, echoed from
  // the roster, and different teams within the same poule often play on
  // different days (one team's home day can be a Sunday while the rest play
  // Saturday). The app's MatchDay only carries a single date per journée, so
  // once each match's real date is resolved from its own day within the
  // window, the most common one becomes the journée's stored date — far
  // closer to reality than the window's first day, which is very often a
  // day nobody in the poule actually plays on.
  for (const j of journees) {
    if (j.dateType !== 'range' || !j.date || !j.rangeEndDate || j.matches.length === 0) continue
    const resolved = j.matches
      .map((m) => dateForDayInRange(j.date!, j.rangeEndDate!, m.day))
      .filter((d): d is string => d !== null)
    if (resolved.length === 0) continue
    const counts = new Map<string, number>()
    for (const d of resolved) counts.set(d, (counts.get(d) ?? 0) + 1)
    let best = resolved[0]
    let bestCount = 0
    for (const [d, count] of counts) {
      if (count > bestCount) { best = d; bestCount = count }
    }
    j.date = best
  }

  return { divisionLabel, poolNumber, phaseLabel, phaseNumber, seasonLabel, seasonId, teams, journees, warnings }
}

/**
 * Loose word-overlap score (0..1) between a parsed division label and an
 * existing division's display name — no two labels for the same division are
 * ever identical text (one comes from this calendar PDF template, the other
 * from whatever the division was originally named/imported as), so this is
 * only ever a *suggestion* pre-filling the admin's mapping dropdown, never an
 * authoritative match.
 */
export function divisionLabelScore(label: string, displayName: string): number {
  const words = (s: string) => new Set(
    stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean),
  )
  const a = words(label)
  const b = words(displayName)
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / Math.max(a.size, b.size)
}
