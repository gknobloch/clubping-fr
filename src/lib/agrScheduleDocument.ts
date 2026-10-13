// Parser for AGR poule calendars (#647).
//
// Shared domain logic — no DOM, no network: fed the text lines that
// `extractPdfScheduleLines` reconstructs from the PDF's text layer.
//
// The AGR (Section du Haut-Rhin) has no API: a poule's calendar is a PDF,
// « Calendrier de 1ère Phase », with a clean and regular text layer —
//
//   Championnat MESSIEURS
//   Prom. HONNEUR - poule A
//   Secteur Départemental
//   Saison 2026-2027 - Calendrier de 1ère Phase
//   Journée 1
//   Ven 25-09-2026 20 h KEMBS ASL TT 4 LANDSER ASL 2
//   Jeu 24-09-2026 20 h15 SPECHBACH MJC 3 KIRCHBERG-NIEDERBRUCK 4
//   …
//   KIRCHBERG/NIEDERBRUCK 4 JOUE A NIEDERBRUCK          ← notes, to the poule
//   LIMITE DES REPORTS DE MATCH : 30/04/2027
//   Impression du 07-10-2026
//
// What differs from the FFTT's export (ffttScheduleDocument.ts): no roster
// table and no affiliation numbers — a club is its AGR name, the team number
// follows it —, each match carries its own date (a journée spreads over
// Wednesday to Friday), poules are letters, and phase 2 carries on the
// numbering (journées 8 to 14), which is kept as published.

export interface AgrScheduleSide {
  /** The club as the AGR writes it: « LANDSER ASL », « KEMBS ASL TT ». */
  club: string
  number: number
}

export interface AgrScheduleMatch {
  /** YYYY-MM-DD. */
  date: string
  /** « 20h00 », « 20h15 » — the app's spelling. */
  time: string
  home: AgrScheduleSide
  away: AgrScheduleSide
}

export interface AgrScheduleJournee {
  number: number
  matches: AgrScheduleMatch[]
}

export interface AgrScheduleDocument {
  /** « Championnat MESSIEURS ». */
  championship: string
  /** « EXCELLENCE », « Prom. HONNEUR ». */
  division: string
  /** « A ». */
  poolLetter: string
  /** 1 for A, 2 for B: what a poule stores, the letter being shown (#647). */
  poolNumber: number
  /** « Secteur Départemental ». */
  sector: string
  /** 2027 for « 2026-2027 »: the season's id is agr-27. */
  seasonEndYear: number
  phaseNumber: number
  journees: AgrScheduleJournee[]
  /** The footer, a line each — where a club plays, who gets the sheets, the deadline for postponements. */
  notes: string[]
  /** Every club the calendar names, in order of appearance. */
  clubs: string[]
  /** Lines that looked like a match and could not be read: the import shows them rather than dropping them. */
  unread: string[]
}

const POOL_RE = /^(.+?)\s+-\s+poule\s+([A-Z])\s*$/i
const SEASON_RE = /Saison\s+(\d{4})-(\d{4})\s+-\s+Calendrier\s+de\s+(\d+)\s*(?:ère|re|ème|e)\s+Phase/i
const JOURNEE_RE = /^Journée\s+(\d+)\s*$/i
const MATCH_RE = /^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.?\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2})\s*h\s*(\d{2})?\s+(.+)$/i
// Two sides: « <club> <n> <club> <n> ». The home side is the shortest prefix
// ending in a team number — a club name holds no standalone number (« KIRCHBERG-
// NIEDERBRUCK 4 » does not; its number is the team's).
const SIDES_RE = /^(.+?)\s+(\d{1,2})\s+(.+?)\s+(\d{1,2})$/
const FOOTER_END_RE = /^Impression du\b/i

/** A letter as a number: A → 1. */
export function poolNumberOfLetter(letter: string): number {
  return letter.trim().toUpperCase().charCodeAt(0) - 64
}

/** A number as a letter: 1 → A — what the AGR prints for a poule. */
export function poolLetterOf(number: number): string {
  return number >= 1 && number <= 26 ? String.fromCharCode(64 + number) : String(number)
}

/** Whether these lines are an AGR calendar at all — before trying the FFTT's parser on them. */
export function isAgrScheduleDocument(lines: readonly string[]): boolean {
  return lines.some((l) => SEASON_RE.test(l)) && lines.some((l) => POOL_RE.test(l.trim()))
}

export function parseAgrScheduleLines(rawLines: readonly string[]): AgrScheduleDocument | { error: string } {
  const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const seasonIndex = lines.findIndex((l) => SEASON_RE.test(l))
  const poolIndex = lines.findIndex((l) => POOL_RE.test(l))
  if (seasonIndex < 0 || poolIndex < 0) return { error: 'Ce document n’est pas un calendrier de poule de l’AGR.' }
  const season = SEASON_RE.exec(lines[seasonIndex])!
  const pool = POOL_RE.exec(lines[poolIndex])!
  const championship = lines.slice(0, poolIndex).find((l) => /^Championnat\b/i.test(l)) ?? ''
  const sector = lines.slice(poolIndex + 1, seasonIndex).find((l) => /^Secteur\b/i.test(l)) ?? ''

  const journees: AgrScheduleJournee[] = []
  const notes: string[] = []
  const unread: string[] = []
  const clubs: string[] = []
  const seen = new Set<string>()
  const note = (club: string) => {
    if (!seen.has(club)) { seen.add(club); clubs.push(club) }
  }
  let current: AgrScheduleJournee | null = null
  let afterLastJournee = false

  for (const line of lines.slice(seasonIndex + 1)) {
    if (FOOTER_END_RE.test(line)) break
    const j = JOURNEE_RE.exec(line)
    if (j) {
      current = { number: Number(j[1]), matches: [] }
      journees.push(current)
      continue
    }
    const m = MATCH_RE.exec(line)
    if (m && current && !afterLastJournee) {
      const [, , dd, mm, yyyy, hh, min, rest] = m
      const sides = SIDES_RE.exec(rest.trim())
      if (!sides) { unread.push(line); continue }
      const home = { club: sides[1].trim(), number: Number(sides[2]) }
      const away = { club: sides[3].trim(), number: Number(sides[4]) }
      note(home.club)
      note(away.club)
      current.matches.push({
        date: `${yyyy}-${mm}-${dd}`,
        time: `${hh.padStart(2, '0')}h${min ?? '00'}`,
        home, away,
      })
      continue
    }
    // Past the matches: the footer. A leading « + » is the AGR's own bullet.
    if (current && current.matches.length > 0) {
      afterLastJournee = true
      notes.push(line.replace(/^\+\s*/, ''))
    }
  }

  if (journees.length === 0) return { error: 'Aucune journée lue dans ce calendrier.' }
  return {
    championship,
    division: pool[1].trim(),
    poolLetter: pool[2].toUpperCase(),
    poolNumber: poolNumberOfLetter(pool[2]),
    sector,
    seasonEndYear: Number(season[2]),
    phaseNumber: Number(season[3]),
    journees,
    notes: joinWrappedNotes(notes),
    clubs,
    unread,
  }
}

/**
 * A footer line the PDF wrapped — an address running onto a second line —
 * starts lower-case or with a parenthesis, or follows a line that ends on a
 * postcode: joined back, so a note reads as written.
 */
function joinWrappedNotes(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const prev = out[out.length - 1]
    if (prev !== undefined && (/^[(a-zàâçéèêëîïôûù]/.test(line) || /\b\d{5}$/.test(prev))) {
      out[out.length - 1] = `${prev} ${line}`
    } else {
      out.push(line)
    }
  }
  return out
}

/**
 * The playing day a team's home matches fall on most often — « Vendredi » —
 * with the time they start at most often, to seed a team the import creates.
 */
export function usualHomeSlot(
  doc: Pick<AgrScheduleDocument, 'journees'>, club: string, number: number,
): { day: string; time: string } | null {
  const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  const days = new Map<string, number>()
  const times = new Map<string, number>()
  for (const j of doc.journees) {
    for (const m of j.matches) {
      if (m.home.club !== club || m.home.number !== number) continue
      const day = DAYS[new Date(`${m.date}T12:00:00`).getDay()]
      days.set(day, (days.get(day) ?? 0) + 1)
      times.set(m.time, (times.get(m.time) ?? 0) + 1)
    }
  }
  const most = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0]
  const day = most(days)
  return day ? { day, time: most(times) ?? '' } : null
}
