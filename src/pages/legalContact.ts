/**
 * Contact details shared by the two public legal pages (#356, #434).
 *
 * They live here rather than in either page because the deletion page and the
 * privacy policy must name the same controller and the same address: Google
 * Play checks that the deletion URL "references the app or developer name",
 * and a member who reads both should not find two different ways to write.
 */

export const CONTACT_EMAIL = 'clubping@leskno.fr'

// Confirmed before the Play Store listing went up (#434): Club Ping is the name
// that appears as data controller, and clubping@leskno.fr identifies it. Left as
// a constant because the two legal pages must not drift into naming it
// differently, not because it is expected to change.
export const CONTROLLER = 'Club Ping'
