// Which club profiles one profile reaches (#655).
//
// A session is ONE club profile (#640): every rule of the API — `administers`,
// `mayAnswerFor`, `mayManageTeam` — is a question about one member of one club.
// What a person may open beyond it is this relation, and nothing else:
//
//   1. their own person's profiles — Gilles at Rixheim reaches Gilles at Landser;
//   2. the profiles of every person who delegated to them — Benjamin reaches
//      Sacha's (0064). One level: a delegate never reaches the delegator's own
//      delegations, and a delegator never reaches their delegate;
//   3. for now, the profiles sharing their address — #640's households, until
//      the cleanup that turns each of them into a delegation. An empty address
//      shares nothing.
//
// The profile switcher lists this, `/auth/switch` admits it, sign-in lands on
// the most recent of it, and a device rings for it. One fragment for all of
// them, so they cannot drift apart: a phone that rang for a profile the
// switcher would not open, or the reverse, is the bug this file exists to stop.

/**
 * SQL: profile `u` is within reach of profile `o`, both aliases of `users`.
 * Binds nothing.
 */
export const reaches = (o: string, u: string) => `(
  ${u}.id = ${o}.id
  OR (${o}.person_id IS NOT NULL AND ${u}.person_id = ${o}.person_id)
  OR (${o}.person_id IS NOT NULL AND ${u}.person_id IN (
        SELECT pd.person_id FROM person_delegates pd WHERE pd.delegate_id = ${o}.person_id))
  OR (COALESCE(${o}.email, '') != '' AND lower(${u}.email) = lower(${o}.email))
)`

/** Whether the profile `fromId` reaches the profile `toId`. */
export async function profileReaches(db: D1Database, fromId: string, toId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS ok FROM profiles o JOIN profiles u ON ${reaches('o', 'u')} WHERE o.id = ? AND u.id = ?`,
  ).bind(fromId, toId).first<{ ok: number }>()
  return !!row
}

/**
 * The profiles connected to `userId` either way — who it reaches, and who
 * reaches it. One household as far as a device can tell: a parent acting as
 * their child, from the child's profile, is still the parent holding the phone.
 */
export async function householdIds(db: D1Database, userId: string): Promise<Set<string>> {
  const r = await db.prepare(
    `SELECT u.id AS id FROM profiles a JOIN profiles u ON ${reaches('a', 'u')} OR ${reaches('u', 'a')}
      WHERE a.id = ?`,
  ).bind(userId).all<{ id: string }>()
  return new Set([userId, ...(r.results ?? []).map((x) => x.id)])
}
