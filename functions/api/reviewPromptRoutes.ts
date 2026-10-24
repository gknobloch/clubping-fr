import { Hono } from 'hono'
import { requestToken, sessionRoot, type Env } from './auth'
import type { UserRow } from './rows'
import {
  applyReviewEvent, isReviewPromptEvent, mergeReviewPromptStates,
  type ReviewPromptState, type ReviewPromptStop,
} from '../../src/lib/reviewPrompt'

/**
 * Whether to ask for a store review, and what the person answered (#781).
 *
 * The person's, not the profile's: a « Ne plus demander » given on one club
 * profile holds on the others, and on the next phone. And the person who
 * SIGNED IN (#702), never one they manage — the app does not ask under a
 * managed profile, and if a build ever did, the answer would still be the
 * delegate's own, since they are the one holding the phone.
 *
 * Like the notification switches, a missing viewer is refused rather than
 * stood in for: an answer recorded for nobody is recorded nowhere.
 */
export const reviewPromptApp = new Hono<Env>()

interface ReviewPromptRow {
  first_seen_at: number
  asked_count: number
  last_asked_at: number | null
  stopped: ReviewPromptStop | null
}

const fromRow = (r: ReviewPromptRow): ReviewPromptState => ({
  firstSeenAt: r.first_seen_at,
  askedCount: r.asked_count,
  ...(r.last_asked_at !== null ? { lastAskedAt: r.last_asked_at } : {}),
  ...(r.stopped ? { stopped: r.stopped } : {}),
})

const SELECT_ROW = 'SELECT first_seen_at, asked_count, last_asked_at, stopped FROM review_prompts WHERE person_id = ?'

export async function reviewPromptOf(db: D1Database, personId: string): Promise<ReviewPromptState | null> {
  const row = await db.prepare(SELECT_ROW).bind(personId).first<ReviewPromptRow>()
  return row ? fromRow(row) : null
}

/** Write a person's whole state — an upsert, so the first answer creates the row. */
export function writeReviewPrompt(db: D1Database, personId: string, s: ReviewPromptState): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO review_prompts (person_id, first_seen_at, asked_count, last_asked_at, stopped)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(person_id) DO UPDATE SET
       first_seen_at = excluded.first_seen_at,
       asked_count = excluded.asked_count,
       last_asked_at = excluded.last_asked_at,
       stopped = excluded.stopped`,
  ).bind(personId, s.firstSeenAt, s.askedCount, s.lastAskedAt ?? null, s.stopped ?? null)
}

/**
 * The merge of two people (#655) keeps one: fold the other's record into it,
 * before the cascade takes it. Nothing when neither was ever asked about.
 */
export async function foldReviewPrompt(db: D1Database, fromId: string, intoId: string): Promise<D1PreparedStatement | null> {
  const [from, into] = await Promise.all([reviewPromptOf(db, fromId), reviewPromptOf(db, intoId)])
  if (!from) return null
  return writeReviewPrompt(db, intoId, into ? mergeReviewPromptStates(into, from) : from)
}

/** The person who signed in (#702), or null when the session has none. */
async function signedInPerson(db: D1Database, token: string | null, user: UserRow): Promise<string | null> {
  const root = token ? await sessionRoot(db, token, user) : user.id
  const row = await db.prepare('SELECT person_id FROM users WHERE id = ?').bind(root).first<{ person_id: string | null }>()
  return row?.person_id ?? null
}

/**
 * The person's state. The first read starts their clock: « not in the first
 * fortnight » counts from the first build that asked, which is the nearest
 * thing to « started using the app » that every person has.
 */
reviewPromptApp.get('/', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const personId = await signedInPerson(c.env.DB, requestToken(c.req), user)
  if (!personId) return c.json({ error: 'no_person' }, 404)
  await c.env.DB.prepare('INSERT OR IGNORE INTO review_prompts (person_id, first_seen_at) VALUES (?, ?)')
    .bind(personId, Date.now()).run()
  const state = await reviewPromptOf(c.env.DB, personId)
  return c.json(state)
})

/** What a device saw: `{ event: 'asked' | 'declined' | 'reviewed' }`. */
reviewPromptApp.post('/', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const { event } = await c.req.json<{ event?: unknown }>().catch(() => ({ event: undefined }))
  if (!isReviewPromptEvent(event)) return c.json({ error: 'invalid_params' }, 400)
  const personId = await signedInPerson(c.env.DB, requestToken(c.req), user)
  if (!personId) return c.json({ error: 'no_person' }, 404)
  const now = Date.now()
  const state = applyReviewEvent(
    (await reviewPromptOf(c.env.DB, personId)) ?? { firstSeenAt: now, askedCount: 0 },
    event,
    now,
  )
  await writeReviewPrompt(c.env.DB, personId, state).run()
  return c.json(state)
})
