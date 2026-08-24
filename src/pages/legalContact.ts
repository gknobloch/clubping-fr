/**
 * Contact details shared by the two public legal pages (#356, #434).
 *
 * They live here rather than in either page because the deletion page and the
 * privacy policy must name the same controller and the same address: Google
 * Play checks that the deletion URL "references the app or developer name",
 * and a member who reads both should not find two different ways to write.
 */

export const CONTACT_EMAIL = 'clubping@leskno.fr'

// TODO(#356): confirm before publishing to the stores. The legal entity acting
// as data controller is not derivable from the codebase.
export const CONTROLLER = 'Club Ping'
